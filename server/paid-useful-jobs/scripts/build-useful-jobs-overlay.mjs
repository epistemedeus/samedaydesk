#!/usr/bin/env node
/**
 * Parameterized useful-jobs overlay packer.
 * Copies an immutable previous archive, overlays SDS runtime at repo-relative
 * paths, and writes catalog/kit copies. Does not vendor node_modules.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const own = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(own, "../..");
const pub = join(repo, "client/public/for-agents/useful-jobs");
const mirror = join(repo, "client/public/kit");
const sha = (data) => createHash("sha256").update(data).digest("hex");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");

const PIN100_SHA = "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51";
const PIN100_BYTES = 2522418;

const DEFAULT_OVERLAY_DIRS = [
  "server/paid-useful-jobs/lib",
  "server/paid-useful-jobs/bin",
  "server/paid-useful-jobs/fixtures",
  "experiments/wave5/m01/lib",
  "tools/managed-useful-jobs-order/lib",
  "tools/managed-useful-jobs-order/fixtures",
  "tools/managed-useful-jobs-order/sql",
  "tools/managed-useful-jobs-order/bin",
  "tools/job-input-preflight/lib",
  "tools/job-output-atomicity/lib",
  "tools/job-output-atomicity/vendor",
  "tools/result-mailbox/lib",
  "tools/result-mailbox/vendor",
];
const DEFAULT_OVERLAY_FILES = [
  "server/paid-useful-jobs/index.mjs",
  "experiments/wave5/m01/catalog.json",
  "tools/job-output-atomicity/index.mjs",
  "tools/job-output-atomicity/PIN.json",
  "tools/managed-useful-jobs-order/package.json",
  "tools/managed-useful-jobs-order/package-lock.json",
];

export function packUsefulJobsOverlay({
  version,
  prevVersion,
  prevSha,
  prevBytes,
  immutableVersions,
  refuseWrapperInPrev = false,
  freezeExistingSha = null,
  rewriteReadmeVersions = true,
  notes = {},
} = {}) {
  if (!version || !prevVersion || !prevSha || !prevBytes) {
    throw new Error("packUsefulJobsOverlay requires version, prevVersion, prevSha, prevBytes");
  }
  const prevName = "useful-jobs-" + prevVersion;
  const name = "useful-jobs-" + version;
  const existing = join(pub, name + ".tar.gz");
  if (freezeExistingSha && existsSync(existing)) {
    const current = readFileSync(existing);
    if (sha(current) === freezeExistingSha) {
      process.stdout.write(`${JSON.stringify({ ok: true, frozen: true, name, sha256: freezeExistingSha, bytes: current.length }, null, 2)}\n`);
      return { frozen: true, sha256: freezeExistingSha, bytes: current.length };
    }
    throw new Error(`${name} exists but sha256 is not the frozen pin ${freezeExistingSha}`);
  }

  const immutable = [];
  for (const v of immutableVersions) {
    const archive = "useful-jobs-" + v + ".tar.gz";
    const pin = json(join(pub, "useful-jobs-" + v + ".sha256.json"));
    for (const dir of [pub, mirror]) {
      const bytes = readFileSync(join(dir, archive));
      if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256) throw new Error("Old archive pin mismatch: " + archive);
      immutable.push({ path: join(dir, archive), sha256: sha(bytes) });
      const pinPath = join(dir, "useful-jobs-" + v + ".sha256.json");
      immutable.push({ path: pinPath, sha256: sha(readFileSync(pinPath)) });
    }
  }
  const previous = json(join(pub, prevName + ".sha256.json"));
  if (previous.bytes !== prevBytes || previous.sha256 !== prevSha) throw new Error(prevVersion + " base mismatch");

  const work = mkdtempSync(join(repo, `tmp-useful-jobs-${version}-stage-`));
  const cleanup = () => rmSync(work, { recursive: true, force: true });
  process.once("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const onSignal = () => {
      const applicationHandlesSignal = process.listeners(signal).some((listener) => listener !== onSignal);
      cleanup();
      if (!applicationHandlesSignal) {
        process.removeListener(signal, onSignal);
        process.kill(process.pid, signal);
      }
    };
    process.prependListener(signal, onSignal);
  }

  function exec(command, args) {
    const r = spawnSync(command, args, { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr || command + " failed");
    return r.stdout.trim();
  }

  exec("tar", ["-xzf", join(pub, prevName + ".tar.gz"), "-C", work]);
  const stage = join(work, name);
  renameSync(join(work, prevName), stage);

  const listing = exec("tar", ["-tzf", join(pub, prevName + ".tar.gz")]);
  const prevHasWrapper = listing.split("\n").some((row) => /wrapper\.mjs$/.test(row));
  if (refuseWrapperInPrev && prevHasWrapper) {
    throw new Error("refusing to pack: " + prevVersion + " archive unexpectedly contains wrapper.mjs");
  }

  const sourceFiles = {};
  function copyTree(source, destination) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source).sort()) {
      if (entry === "node_modules" || entry === ".cache" || entry === ".git") continue;
      const src = join(source, entry);
      const dest = join(destination, entry);
      const st = lstatSync(src);
      if (st.isSymbolicLink()) throw new Error("overlay refuses symlinks: " + src);
      if (st.isDirectory()) copyTree(src, dest);
      else if (st.isFile()) {
        copyFileSync(src, dest);
        sourceFiles[src.slice(repo.length + 1)] = sha(readFileSync(src));
      } else throw new Error("overlay requires regular files: " + src);
    }
  }
  function copyFile(rel) {
    const source = join(repo, rel);
    if (!existsSync(source)) throw new Error("missing overlay file " + rel);
    const dest = join(stage, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(source, dest);
    sourceFiles[rel] = sha(readFileSync(source));
  }

  for (const rel of DEFAULT_OVERLAY_DIRS) copyTree(join(repo, rel), join(stage, rel));
  for (const rel of DEFAULT_OVERLAY_FILES) copyFile(rel);

  const wrapperSrc = readFileSync(join(stage, "server/paid-useful-jobs/lib/wrapper.mjs"), "utf8");
  if (!wrapperSrc.includes("export function publishCompleteOutputs") || !wrapperSrc.includes("rollback-incomplete")) {
    throw new Error(version + " overlay missing publication rollback in wrapper.mjs");
  }
  const orderSrc = readFileSync(join(stage, "tools/managed-useful-jobs-order/lib/create-order.mjs"), "utf8");
  if (!orderSrc.includes("interrupted-incomplete")) {
    throw new Error(version + " overlay missing interrupted-run guard in create-order.mjs");
  }
  const engineRootSrc = readFileSync(join(stage, "experiments/wave5/m01/lib/engine-root.mjs"), "utf8");
  if (!engineRootSrc.includes("packagedEngineRoot") || !engineRootSrc.includes("packaged-engines")) {
    throw new Error(version + " overlay missing packaged engines/<id> resolution");
  }
  const orderPkg = json(join(stage, "tools/managed-useful-jobs-order/package.json"));
  if (orderPkg?.dependencies?.pg !== "8.23.0") {
    throw new Error(version + " overlay missing declared pg 8.23.0");
  }
  if (existsSync(join(stage, "tools/managed-useful-jobs-order/node_modules"))) {
    throw new Error("refusing to pack node_modules into the overlay");
  }
  for (const id of ["lockfile-pin-delta", "json-schema-webhook-drift", "route-table-diff", "page-change-offline-job"]) {
    const binName = id === "lockfile-pin-delta" ? "lockfile-delta.mjs"
      : id === "json-schema-webhook-drift" ? "webhook-drift.mjs"
        : id === "route-table-diff" ? "route-diff.mjs"
          : "page-change.mjs";
    if (!existsSync(join(stage, "engines", id, "bin", binName))) {
      throw new Error("packaged engines/" + id + " missing " + binName);
    }
  }

  const pin100 = json(join(pub, "useful-jobs-1.0.0.sha256.json"));
  const nestedArchive = readFileSync(join(pub, "useful-jobs-1.0.0.tar.gz"));
  if (nestedArchive.length !== PIN100_BYTES || sha(nestedArchive) !== PIN100_SHA) {
    throw new Error("refusing to nest mutated 1.0.0 identity archive");
  }
  if (pin100.sha256 !== PIN100_SHA || pin100.bytes !== PIN100_BYTES) {
    throw new Error("1.0.0 sha256.json disagrees with archive bytes");
  }
  const nestedDir = join(stage, "client/public/for-agents/useful-jobs");
  mkdirSync(nestedDir, { recursive: true });
  copyFileSync(join(pub, "useful-jobs-1.0.0.tar.gz"), join(nestedDir, "useful-jobs-1.0.0.tar.gz"));
  copyFileSync(join(pub, "useful-jobs-1.0.0.sha256.json"), join(nestedDir, "useful-jobs-1.0.0.sha256.json"));
  sourceFiles["client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz"] = PIN100_SHA;
  sourceFiles["client/public/for-agents/useful-jobs/useful-jobs-1.0.0.sha256.json"] = sha(readFileSync(join(pub, "useful-jobs-1.0.0.sha256.json")));

  const catalog = json(join(stage, "catalog.json"));
  catalog.version = version;
  writeJson(join(stage, "catalog.json"), catalog);
  const outcomes = json(join(stage, "jobs-outcomes.json"));
  outcomes.version = version;
  writeJson(join(stage, "jobs-outcomes.json"), outcomes);
  copyFileSync(join(stage, "catalog.json"), join(nestedDir, "catalog.json"));
  copyFileSync(join(stage, "jobs-outcomes.json"), join(nestedDir, "jobs-outcomes.json"));
  const pkg = json(join(stage, "package.json"));
  pkg.version = version;
  writeJson(join(stage, "package.json"), pkg);

  let readme = readFileSync(join(stage, "README.md"), "utf8");
  if (rewriteReadmeVersions) readme = readme.replaceAll(prevVersion, version);
  if (notes.readme) readme += notes.readme.startsWith("\n") ? notes.readme : "\n" + notes.readme;
  writeFileSync(join(stage, "README.md"), readme);
  if (notes.notice) writeFileSync(join(stage, "NOTICE"), readFileSync(join(stage, "NOTICE"), "utf8") + notes.notice);
  if (notes.allowlist) {
    writeFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), readFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), "utf8") + notes.allowlist);
  }

  const archivePath = join(work, name + ".tar.gz");
  exec("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf", archivePath, "-C", work, name]);
  const packedListing = exec("tar", ["-tzf", archivePath]);
  if (packedListing.split("\n").some((row) => /(^|\/)node_modules\//.test(row))) {
    throw new Error("refusing to publish archive that contains node_modules");
  }
  const bytes = readFileSync(archivePath);
  const pin = {
    schema: "useful-jobs.release-archive.v1",
    name,
    archive: name + ".tar.gz",
    bytes: bytes.length,
    sha256: sha(bytes),
    node: ">=22",
    builtAt: new Date().toISOString(),
    sourceRepo: "epistemedeus/samedaydesk",
    sourceCommit: exec("git", ["rev-parse", "HEAD"]),
    sourceFiles,
    nestedPinsVerified: true,
    nestedIdentityArchive: {
      name: "useful-jobs-1.0.0",
      archive: "useful-jobs-1.0.0.tar.gz",
      bytes: PIN100_BYTES,
      sha256: PIN100_SHA,
      reason: "SDS wrapper vendor-budget-impact extract identity; not the current public download",
    },
    overlayContains: {
      wrapper: "server/paid-useful-jobs/lib/wrapper.mjs",
      publicationRollback: true,
      interruptGuard: "tools/managed-useful-jobs-order/lib/create-order.mjs",
      packagedEngineResolution: "experiments/wave5/m01/lib/engine-root.mjs",
      postgresDriver: "tools/managed-useful-jobs-order/package.json#dependencies.pg",
    },
    previous: { name: prevName, archive: prevName + ".tar.gz", bytes: prevBytes, sha256: prevSha },
    immutable: immutableVersions.map((v) => {
      const p = json(join(pub, "useful-jobs-" + v + ".sha256.json"));
      return { name: p.name, archive: "useful-jobs-" + v + ".tar.gz", bytes: p.bytes, sha256: p.sha256 };
    }),
  };
  for (const dir of [pub, mirror]) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(archivePath, join(dir, pin.archive));
    writeJson(join(dir, name + ".sha256.json"), pin);
  }
  writeJson(join(pub, "catalog.json"), catalog);
  writeJson(join(pub, "jobs-outcomes.json"), outcomes);
  for (const relative of ["client/public/discovery/useful-jobs.json", "client/src/data/usefulJobsKit.json"]) {
    const file = join(repo, relative);
    const current = json(file);
    const replaced = readFileSync(file, "utf8")
      .replaceAll(current.version, version)
      .replaceAll(current.sha256, pin.sha256)
      .replaceAll(String(current.bytes), String(pin.bytes));
    const value = JSON.parse(replaced);
    value.sourceRepo = pin.sourceRepo;
    value.sourceCommit = pin.sourceCommit;
    value.archiveFreeze = pin.sourceCommit;
    value.overlaySourceFiles = sourceFiles;
    value.purchaseAuthority = false;
    const oldPrev = {
      version: prevVersion,
      archive: "/for-agents/useful-jobs/" + prevName + ".tar.gz",
      kitArchive: "/kit/" + prevName + ".tar.gz",
      sha256: prevSha,
      bytes: prevBytes,
      rootName: prevName,
    };
    value.previous = oldPrev;
    if (Array.isArray(value.immutableArchives)) {
      value.immutableArchives = value.immutableArchives.filter((a) => a.version !== prevVersion && a.version !== version);
      value.immutableArchives.push(oldPrev);
    }
    if (relative.includes("/discovery/")) {
      value.vendorPricingScope = { billCalculation: false, unitsConverted: false, liveQuote: false, sourceCoverageVerified: false };
    }
    writeJson(file, value);
  }
  for (const old of immutable) if (sha(readFileSync(old.path)) !== old.sha256) throw new Error("Old archive changed: " + old.path);
  const stillPrev = readFileSync(join(pub, prevName + ".tar.gz"));
  if (stillPrev.length !== prevBytes || sha(stillPrev) !== prevSha) throw new Error(prevVersion + " public archive was mutated");
  const stillPrevKit = readFileSync(join(mirror, prevName + ".tar.gz"));
  if (stillPrevKit.length !== prevBytes || sha(stillPrevKit) !== prevSha) throw new Error(prevVersion + " kit archive was mutated");

  process.stdout.write(`${JSON.stringify({ ok: true, ...pin, stageRemovedOnExit: true, immutableFilesVerified: immutable.length }, null, 2)}\n`);
  return pin;
}
