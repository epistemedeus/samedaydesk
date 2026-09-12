#!/usr/bin/env node
/**
 * Cold CLI adapter: spawn useful-jobs 1.4.0 lockfile-pin-delta.
 * Never networks on the job path. Does not reimplement pin equality.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONSUMER_DIR = HERE;
export const JOB_ID = "lockfile-pin-delta";
export const KIT_VERSION = "1.4.0";
export const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
export const KIT_BYTES = 2575215;
export const PUBLISHED_ARCHIVE = "/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz";
export const OFFICIAL_BEFORE = join(HERE, "fixtures/official/package-lock.before.json");
export const OFFICIAL_AFTER = join(HERE, "fixtures/official/package-lock.after.json");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

export function verifyPublishedArchive(archive = PUBLISHED_ARCHIVE) {
  if (!existsSync(archive)) {
    const err = new Error(`missing published archive ${archive}`);
    err.code = "missing-archive";
    throw err;
  }
  const bytes = statSync(archive).size;
  if (bytes !== KIT_BYTES) {
    const err = new Error(`archive bytes ${bytes} != ${KIT_BYTES}`);
    err.code = "archive-size-mismatch";
    throw err;
  }
  const digest = sha256File(archive);
  if (digest !== KIT_SHA256) {
    const err = new Error(`archive sha256 ${digest} != ${KIT_SHA256}`);
    err.code = "archive-digest-mismatch";
    throw err;
  }
  return { archive, bytes, digest, version: KIT_VERSION };
}

export function ensureKit({ destDir = join(HERE, "vendor") } = {}) {
  const cli = join(destDir, "useful-jobs-1.4.0/bin/useful-jobs.mjs");
  if (existsSync(cli)) {
    return { root: join(destDir, "useful-jobs-1.4.0"), cli, extracted: false, ...verifyPublishedArchive() };
  }
  const verified = verifyPublishedArchive();
  mkdirSync(destDir, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", verified.archive, "-C", destDir], { encoding: "utf8" });
  if (tar.status !== 0) {
    const err = new Error(`tar extract failed: ${tar.stderr || tar.status}`);
    err.code = "extract-failed";
    throw err;
  }
  if (!existsSync(cli)) {
    const err = new Error(`extracted kit missing ${cli}`);
    err.code = "extract-incomplete";
    throw err;
  }
  return { root: join(destDir, "useful-jobs-1.4.0"), cli, extracted: true, ...verified };
}

function resolveInputPath(inputPath) {
  if (inputPath == null || inputPath === false) return null;
  const text = String(inputPath);
  // Pass URLs through unchanged so the engine can refuse locally. Never fetch.
  if (/^https?:\/\//i.test(text) || /^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  return isAbsolute(text) ? text : resolve(HERE, text);
}

function parseStdoutJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function readOutputFile(outDir, name) {
  const p = join(outDir, name);
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf8");
  if (name.endsWith(".json")) {
    try {
      return { path: p, text, json: JSON.parse(text) };
    } catch {
      return { path: p, text, json: null };
    }
  }
  return { path: p, text, json: null };
}

/**
 * Spawn useful-jobs 1.4.0 lockfile-pin-delta. Offline. No purchase.
 */
export function runLockfilePinDelta({
  before = OFFICIAL_BEFORE,
  after = OFFICIAL_AFTER,
  outDir,
  extraArgs = [],
  timeoutMs = 60_000,
} = {}) {
  const kit = ensureKit();
  const args = ["run", JOB_ID];
  const beforePath = resolveInputPath(before);
  const afterPath = resolveInputPath(after);
  if (beforePath) args.push("--before", beforePath);
  if (afterPath) args.push("--after", afterPath);
  let resolvedOut = null;
  if (outDir) {
    resolvedOut = resolve(outDir);
    mkdirSync(resolvedOut, { recursive: true });
    args.push("--out-dir", resolvedOut);
  }
  for (const a of extraArgs) args.push(a);

  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" };
  const spawned = spawnSync(process.execPath, [kit.cli, ...args], {
    cwd: kit.root,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });

  const stdoutJson = parseStdoutJson(spawned.stdout);
  const pinDeltaJson = resolvedOut ? readOutputFile(resolvedOut, "pin-delta.json") : null;
  const pinDeltaMd = resolvedOut ? readOutputFile(resolvedOut, "pin-delta.md") : null;

  return {
    ok: spawned.status === 0 && stdoutJson?.ok === true,
    status: spawned.status,
    stdout: spawned.stdout || "",
    stderr: spawned.stderr || "",
    stdoutJson,
    outDir: resolvedOut,
    outputs: {
      json: pinDeltaJson,
      md: pinDeltaMd,
    },
    report: pinDeltaJson?.json || null,
    kit: { version: KIT_VERSION, sha256: KIT_SHA256, cli: kit.cli },
    args,
    purchaseAuthority: false,
    timedOut: spawned.error?.code === "ETIMEDOUT",
    error: spawned.error ? String(spawned.error.message || spawned.error) : null,
  };
}

export function runMissingInputs({ outDir, timeoutMs = 30_000 } = {}) {
  const kit = ensureKit();
  const args = ["run", JOB_ID];
  if (outDir) args.push("--out-dir", resolve(outDir));
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" };
  const spawned = spawnSync(process.execPath, [kit.cli, ...args], {
    cwd: kit.root,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    ok: false,
    status: spawned.status,
    stdout: spawned.stdout || "",
    stderr: spawned.stderr || "",
    stdoutJson: parseStdoutJson(spawned.stdout) || parseStdoutJson(spawned.stderr),
    purchaseAuthority: false,
  };
}

function usage() {
  return `L03-glob-lockfile adapter — useful-jobs 1.4.0 ${JOB_ID}

Usage:
  node adapter.mjs [--before <lock>] [--after <lock>] [--out-dir <dir>]

Defaults to the stored isaacs/node-glob official pair.
Does not fetch. purchaseAuthority=false.
`;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const result = runLockfilePinDelta({
    before: args.before || OFFICIAL_BEFORE,
    after: args.after || OFFICIAL_AFTER,
    outDir: args["out-dir"] || join(HERE, "fixtures/out/adapter-default"),
  });
  process.stdout.write(`${JSON.stringify(result.stdoutJson || { ok: false, status: result.status, error: result.error }, null, 2)}\n`);
  process.exit(result.status == null ? 1 : result.status);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
