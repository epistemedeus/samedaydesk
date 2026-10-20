import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { MonitorError } from "../errors.mjs";
import { RELEASE_GATE_PIN } from "./release-gate-pin.mjs";

const ARCHIVE_NAME = "release-gate-0.1.4.tgz";
const MAX_BYTES = 1024 * 1024;
const MAX_TREE_FILES = 64;
const MODULE_MEMBER = "package/src/index.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertReleaseGateArchive(bytes, pin = RELEASE_GATE_PIN) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (body.length > MAX_BYTES) {
    throw new MonitorError("Release Gate archive exceeds the receive limit", { code: "release_gate_rejected" });
  }
  const digest = sha256(body);
  if (body.length !== pin.bytes || digest !== pin.sha256) {
    throw new MonitorError(
      `Release Gate archive does not match ${pin.version} sha256 ${pin.sha256} (${pin.bytes} bytes)`,
      { code: "release_gate_rejected" },
    );
  }
  return { sha256: digest, bytes: body.length };
}

function defaultCacheDir() {
  if (process.env.CHANGE_MONITOR_RELEASE_GATE_CACHE) return process.env.CHANGE_MONITOR_RELEASE_GATE_CACHE;
  const home = homedir();
  const root = home && home !== "/" ? home : tmpdir();
  return path.join(root, ".cache", "change-monitor", "release-gate-0.1.4");
}

function assertMembers(members) {
  if (!members.length) {
    throw new MonitorError("Release Gate archive is empty", { code: "release_gate_rejected" });
  }
  for (const member of members) {
    if (!member.startsWith("package/") || member.startsWith("/") || member.includes("\\") || member.split("/").includes("..")) {
      throw new MonitorError(`Release Gate archive member is unsafe: ${member}`, { code: "release_gate_rejected" });
    }
  }
}

function listMembers(archivePath) {
  const output = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8", maxBuffer: MAX_BYTES });
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

function fileMembers(members) {
  return members.filter((member) => !member.endsWith("/"));
}

function archiveMemberBytes(archivePath, member) {
  return execFileSync("tar", ["-xOf", archivePath, member], { maxBuffer: MAX_BYTES });
}

function treeDigest(digests) {
  const lines = Object.keys(digests).sort().map((member) => `${member}\n${digests[member]}\n`).join("");
  return sha256(Buffer.from(lines));
}

function lstatOrNull(file) {
  try {
    return lstatSync(file);
  } catch {
    return null;
  }
}

function walkFiles(root) {
  const files = [];
  const visit = (relative) => {
    const full = relative ? path.join(root, relative) : root;
    const st = lstatSync(full);
    if (st.isSymbolicLink()) {
      const error = new Error("symlink");
      error.code = "cache_symlink";
      throw error;
    }
    if (st.isDirectory()) {
      if (files.length > MAX_TREE_FILES) {
        const error = new Error("too-many");
        error.code = "cache_partial";
        throw error;
      }
      for (const name of readdirSync(full)) visit(relative ? path.join(relative, name) : name);
      return;
    }
    if (!st.isFile()) {
      const error = new Error("not-file");
      error.code = "cache_not_file";
      throw error;
    }
    files.push(relative.split(path.sep).join("/"));
    if (files.length > MAX_TREE_FILES) {
      const error = new Error("too-many");
      error.code = "cache_partial";
      throw error;
    }
  };
  visit("");
  return files;
}

function treeMatchesArchive(root, archivePath) {
  const rootStat = lstatOrNull(root);
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) return null;
  let members;
  try {
    members = listMembers(archivePath);
    assertMembers(members);
  } catch (error) {
    if (error instanceof MonitorError) throw error;
    return null;
  }
  const expected = fileMembers(members);
  if (!expected.includes(MODULE_MEMBER)) {
    throw new MonitorError("Release Gate archive has no package/src/index.mjs", { code: "release_gate_rejected" });
  }
  let files;
  try {
    files = walkFiles(root);
  } catch {
    return null;
  }
  if (files.length !== expected.length) return null;
  const expectedSet = new Set(expected);
  for (const file of files) {
    if (!expectedSet.has(file)) return null;
  }
  const digests = {};
  for (const member of expected) {
    const full = path.join(root, member);
    const st = lstatOrNull(full);
    if (!st || st.isSymbolicLink() || !st.isFile() || st.size > MAX_BYTES) return null;
    let archived;
    try {
      archived = archiveMemberBytes(archivePath, member);
    } catch {
      return null;
    }
    const body = readFileSync(full);
    if (!body.equals(archived)) return null;
    digests[member] = sha256(body);
  }
  return { members, digests, treeSha256: treeDigest(digests) };
}

function removeOwnStaging(directory, cacheDir) {
  const stagingRoot = path.resolve(cacheDir, ".staging");
  const resolved = path.resolve(directory);
  if (resolved !== stagingRoot && !resolved.startsWith(`${stagingRoot}${path.sep}`)) {
    throw new MonitorError("refusing to delete a Release Gate extraction this process did not stage", {
      code: "release_gate_rejected",
    });
  }
  rmSync(resolved, { recursive: true, force: true });
}

function extractVerified(archivePath, dest) {
  const members = listMembers(archivePath);
  assertMembers(members);
  execFileSync("tar", ["-xzf", archivePath, "-C", dest], { stdio: "ignore" });
  const matched = treeMatchesArchive(dest, archivePath);
  if (!matched) {
    throw new MonitorError("extracted Release Gate tree does not match the archive", { code: "release_gate_rejected" });
  }
  return matched;
}

// A matching unpack/ or bound/<sha256>/ tree is reused in place. This process
// only deletes a staging directory it created. A partial, symlink, or edited
// tree is left alone and is not imported.
function acquireExecutableTree(cacheDir, archivePath) {
  const verified = assertReleaseGateArchive(readFileSync(archivePath));
  const legacy = treeMatchesArchive(path.join(cacheDir, "unpack"), archivePath);
  if (legacy) return { root: path.join(cacheDir, "unpack"), ...legacy, extraction: "reused" };
  const bound = path.join(cacheDir, "bound", verified.sha256);
  const published = treeMatchesArchive(bound, archivePath);
  if (published) return { root: bound, ...published, extraction: "reused" };

  const staging = path.join(cacheDir, ".staging", `${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { recursive: true });
  try {
    const extracted = extractVerified(archivePath, staging);
    const boundStat = lstatOrNull(bound);
    if (!boundStat) {
      mkdirSync(path.dirname(bound), { recursive: true });
      try {
        renameSync(staging, bound);
        return { root: bound, ...extracted, extraction: "published" };
      } catch {
        // The winner published first, or the path is an unusable foreign entry.
      }
    }
    const winner = treeMatchesArchive(bound, archivePath);
    if (winner) {
      removeOwnStaging(staging, cacheDir);
      return { root: bound, ...winner, extraction: "reused" };
    }
    return { root: staging, ...extracted, extraction: "private" };
  } catch (error) {
    removeOwnStaging(staging, cacheDir);
    throw error;
  }
}

async function readLimited(response) {
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > MAX_BYTES) {
        throw new MonitorError("Release Gate archive exceeds the receive limit", { code: "release_gate_rejected" });
      }
      chunks.push(Buffer.from(step.value));
    }
    return Buffer.concat(chunks);
  }
  const buffered = Buffer.from(await response.arrayBuffer());
  if (buffered.length > MAX_BYTES) {
    throw new MonitorError("Release Gate archive exceeds the receive limit", { code: "release_gate_rejected" });
  }
  return buffered;
}

async function fetchArchive(fetchImpl, timeoutMs) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(RELEASE_GATE_PIN.url, {
        method: "GET",
        redirect: "manual",
        headers: { accept: "application/octet-stream" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status >= 300 && response.status < 400) {
        throw new MonitorError("Release Gate download redirected away from the pinned URL", { code: "release_gate_redirect" });
      }
      if (response.status !== 200) {
        throw new MonitorError(`Release Gate download returned HTTP ${response.status}`, { code: "release_gate_unavailable" });
      }
      const body = await readLimited(response);
      const verified = assertReleaseGateArchive(body);
      return { body, ...verified, httpStatus: 200 };
    } catch (error) {
      if (error instanceof MonitorError && error.code !== "release_gate_unavailable") throw error;
      lastError = error;
    }
  }
  if (lastError instanceof MonitorError) throw lastError;
  throw new MonitorError("Release Gate download failed", { code: "release_gate_unavailable" });
}

function sourceCommitsOf(packageDir) {
  try {
    const pins = JSON.parse(readFileSync(path.join(packageDir, "PINS.json"), "utf8"));
    const sources = pins.sources && typeof pins.sources === "object" ? pins.sources : {};
    const commits = {};
    for (const [name, row] of Object.entries(sources)) {
      if (row && typeof row.commit === "string") commits[name] = row.commit;
    }
    return commits;
  } catch {
    return {};
  }
}

function refusePrivateSibling(moduleFile) {
  const resolved = realpathSync(moduleFile).split(path.sep).join("/");
  if (resolved.includes("/packages/release-gate/")) {
    throw new MonitorError("private sibling release-gate is not the runtime", { code: "private_sibling_refused" });
  }
  return resolved;
}

async function loadUnpacked(root, acquiredFrom, httpStatus, match) {
  const packageDir = path.join(root, "package");
  const packageJson = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
  if (packageJson.name !== RELEASE_GATE_PIN.packageName || packageJson.version !== RELEASE_GATE_PIN.version) {
    throw new MonitorError("unpacked Release Gate identity does not match the pin", { code: "release_gate_rejected" });
  }
  const moduleFile = path.join(packageDir, "src", "index.mjs");
  const moduleStat = lstatSync(moduleFile);
  if (moduleStat.isSymbolicLink() || !moduleStat.isFile()) {
    throw new MonitorError("Release Gate module is not a regular file from the archive", { code: "release_gate_rejected" });
  }
  const moduleBytes = readFileSync(moduleFile);
  const moduleSha256 = sha256(moduleBytes);
  if (moduleSha256 !== match.digests[MODULE_MEMBER]) {
    throw new MonitorError("Release Gate module does not match the pinned archive", { code: "release_gate_rejected" });
  }
  const resolved = refusePrivateSibling(moduleFile);
  const loaded = await import(pathToFileURL(moduleFile).href);
  const consumed = readFileSync(moduleFile);
  if (!consumed.equals(moduleBytes)) {
    throw new MonitorError("Release Gate module changed while it was loaded", { code: "release_gate_rejected" });
  }
  if (loaded.RECEIPT_SCHEMA !== RELEASE_GATE_PIN.receiptSchema || typeof loaded.evaluateRelease !== "function") {
    throw new MonitorError("unpacked Release Gate does not export the pinned receipt contract", { code: "release_gate_schema" });
  }
  const identity = {
    packageName: packageJson.name,
    version: packageJson.version,
    archive: RELEASE_GATE_PIN.archive,
    sha256: RELEASE_GATE_PIN.sha256,
    bytes: RELEASE_GATE_PIN.bytes,
    url: RELEASE_GATE_PIN.url,
    publicPath: RELEASE_GATE_PIN.publicPath,
    receiptSchema: loaded.RECEIPT_SCHEMA,
    acquiredFrom,
    httpStatus,
    module: MODULE_MEMBER,
    moduleResolved: resolved.endsWith("/package/src/index.mjs"),
    modulePath: resolved,
    moduleSha256,
    treeSha256: match.treeSha256,
    executableBound: true,
    extraction: match.extraction,
    sourceCommits: sourceCommitsOf(packageDir),
    members: match.members.length,
  };
  return {
    evaluateRelease: loaded.evaluateRelease,
    RECEIPT_SCHEMA: loaded.RECEIPT_SCHEMA,
    identity,
  };
}

function cachedArchive(cacheDir) {
  const archivePath = path.join(cacheDir, ARCHIVE_NAME);
  try {
    const bytes = readFileSync(archivePath);
    assertReleaseGateArchive(bytes);
    return archivePath;
  } catch (error) {
    if (error instanceof MonitorError) {
      rmSync(archivePath, { force: true });
    }
    return null;
  }
}

function writeArchive(cacheDir, body) {
  mkdirSync(cacheDir, { recursive: true });
  const archivePath = path.join(cacheDir, ARCHIVE_NAME);
  const temporary = path.join(cacheDir, `.${ARCHIVE_NAME}.${process.pid}.${randomBytes(4).toString("hex")}.partial`);
  try {
    writeFileSync(temporary, body, { flag: "wx" });
    renameSync(temporary, archivePath);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  return archivePath;
}

let shared = null;

export async function acquireReleaseGate(options = {}) {
  const cacheDir = path.resolve(options.cacheDir || defaultCacheDir());
  const refresh = options.refresh === true || options.bytes != null || typeof options.fetchImpl === "function";
  if (!refresh && shared && !options.cacheDir) return shared;
  const run = loadReleaseGate({ ...options, cacheDir });
  if (!options.cacheDir && !options.bytes && typeof options.fetchImpl !== "function" && options.refresh !== true) {
    const tracked = run.catch((error) => {
      if (shared === tracked) shared = null;
      throw error;
    });
    shared = tracked;
    return tracked;
  }
  return run;
}

async function loadReleaseGate({ cacheDir, bytes = null, fetchImpl = globalThis.fetch, refresh = false, timeoutMs = 15000 }) {
  mkdirSync(cacheDir, { recursive: true });
  let acquiredFrom = "verified-cache";
  let httpStatus = null;
  let archivePath = refresh ? null : cachedArchive(cacheDir);
  if (!archivePath) {
    let body;
    if (bytes != null) {
      assertReleaseGateArchive(bytes);
      body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      acquiredFrom = "supplied-bytes";
      httpStatus = null;
    } else {
      const downloaded = await fetchArchive(fetchImpl, timeoutMs);
      body = downloaded.body;
      acquiredFrom = "public-get";
      httpStatus = downloaded.httpStatus;
    }
    archivePath = writeArchive(cacheDir, body);
    assertReleaseGateArchive(readFileSync(archivePath));
  }
  const tree = acquireExecutableTree(cacheDir, archivePath);
  const loaded = await loadUnpacked(tree.root, acquiredFrom, httpStatus, tree);
  writeFileSync(path.join(cacheDir, "identity.json"), `${JSON.stringify(loaded.identity, null, 2)}\n`);
  return loaded;
}
