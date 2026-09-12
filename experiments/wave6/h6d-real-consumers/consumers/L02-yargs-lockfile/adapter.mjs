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
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_VERSION = "1.4.0";
const KIT_ROOT_NAME = "useful-jobs-1.4.0";
const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
const KIT_BYTES = 2575215;
const JOB_ID = "lockfile-pin-delta";
const OUTPUTS = Object.freeze(["pin-delta.json", "pin-delta.md"]);

export const DEFAULT_BEFORE = join(HERE, "fixtures/official/package-lock.before.json");
export const DEFAULT_AFTER = join(HERE, "fixtures/official/package-lock.after.json");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function repoRoot() {
  return resolve(HERE, "../../../../..");
}

function publishedArchive() {
  return join(repoRoot(), "client/public/kit/useful-jobs-1.4.0.tar.gz");
}

export function ensureKit() {
  const vendorRoot = join(HERE, "vendor", KIT_ROOT_NAME);
  const cli = join(vendorRoot, "bin/useful-jobs.mjs");
  if (existsSync(cli)) {
    return { root: vendorRoot, cli, extracted: false, version: KIT_VERSION };
  }
  const archive = publishedArchive();
  if (!existsSync(archive)) {
    const err = new Error(`missing published kit archive ${archive}`);
    err.code = "missing-archive";
    throw err;
  }
  const st = statSync(archive);
  if (st.size !== KIT_BYTES) {
    const err = new Error(`kit archive size ${st.size} != ${KIT_BYTES}`);
    err.code = "archive-size-mismatch";
    throw err;
  }
  const digest = sha256File(archive);
  if (digest !== KIT_SHA256) {
    const err = new Error(`kit archive sha256 ${digest} != ${KIT_SHA256}`);
    err.code = "archive-digest-mismatch";
    throw err;
  }
  mkdirSync(join(HERE, "vendor"), { recursive: true });
  const tar = spawnSync("tar", ["-xzf", archive, "-C", join(HERE, "vendor")], { encoding: "utf8" });
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
  return { root: vendorRoot, cli, extracted: true, version: KIT_VERSION, digest };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
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

function parseStdoutJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(lines[i]);
      } catch {
        /* continue */
      }
    }
    return null;
  }
}

function readOutput(outDir, name) {
  const path = join(outDir, name);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  if (name.endsWith(".json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * Spawn useful-jobs 1.4.0 lockfile-pin-delta with exact flags.
 * @param {{before?: string, after?: string, outDir?: string}} [options]
 */
export function runLockfilePinDelta(options = {}) {
  const kit = ensureKit();
  const before = resolve(String(options.before || DEFAULT_BEFORE));
  const after = resolve(String(options.after || DEFAULT_AFTER));
  const outDir = resolve(String(options.outDir || join(HERE, "out", "lockfile-pin-delta")));
  mkdirSync(outDir, { recursive: true });

  const args = [
    kit.cli,
    "run",
    JOB_ID,
    "--before",
    before,
    "--after",
    after,
    "--out-dir",
    outDir,
  ];
  const r = spawnSync(process.execPath, args, {
    cwd: kit.root,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
    encoding: "utf8",
    timeout: options.timeoutMs || 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdoutJson = parseStdoutJson(r.stdout);
  const files = {};
  for (const name of OUTPUTS) files[name] = readOutput(outDir, name);
  return {
    ok: r.status === 0 && stdoutJson?.ok === true,
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    stdoutJson,
    outDir,
    outputs: OUTPUTS,
    files,
    kit: { root: kit.root, cli: kit.cli, version: kit.version },
    inputs: { before, after },
    timedOut: r.error?.code === "ETIMEDOUT",
    error: r.error ? String(r.error.message || r.error) : null,
    purchaseAuthority: false,
  };
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function main(argv) {
  const args = parseArgs(argv);
  const result = runLockfilePinDelta({
    before: args.before,
    after: args.after,
    outDir: args["out-dir"],
  });
  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    jobId: JOB_ID,
    status: result.stdoutJson?.status ?? null,
    exit: result.status,
    stdoutJson: result.stdoutJson,
    outDir: result.outDir,
    outputs: result.outputs,
    purchaseAuthority: false,
    network: false,
  }, null, 2)}\n`);
  process.exit(result.status == null ? 1 : result.status);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
