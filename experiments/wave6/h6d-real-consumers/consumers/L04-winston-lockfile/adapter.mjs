#!/usr/bin/env node
/**
 * Cold CLI adapter for useful-jobs 1.4.0 lockfile-pin-delta.
 * Spawns the published kit; never networks on the job path.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONSUMER_ROOT = HERE;
export const KIT_ROOT = join(HERE, "vendor", "useful-jobs-1.4.0");
export const KIT_CLI = join(KIT_ROOT, "bin", "useful-jobs.mjs");
export const JOB_ID = "lockfile-pin-delta";

export const PUBLISHED_KIT = Object.freeze({
  version: "1.4.0",
  archive: "/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz",
  sha256: "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f",
  bytes: 2575215,
});

export const OFFICIAL_BEFORE = join(HERE, "fixtures/official/before/package-lock.json");
export const OFFICIAL_AFTER = join(HERE, "fixtures/official/after/package-lock.json");

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

export function ensureKit() {
  if (existsSync(KIT_CLI)) return { root: KIT_ROOT, cli: KIT_CLI, extracted: false };
  const archive = PUBLISHED_KIT.archive;
  if (!existsSync(archive)) {
    const err = new Error(`missing published kit archive ${archive}`);
    err.code = "missing-archive";
    throw err;
  }
  const st = statSync(archive);
  if (st.size !== PUBLISHED_KIT.bytes) {
    const err = new Error(`kit archive bytes ${st.size} != ${PUBLISHED_KIT.bytes}`);
    err.code = "archive-size-mismatch";
    throw err;
  }
  const digest = sha256File(archive);
  if (digest !== PUBLISHED_KIT.sha256) {
    const err = new Error(`kit archive sha256 ${digest} != ${PUBLISHED_KIT.sha256}`);
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
  if (!existsSync(KIT_CLI)) {
    const err = new Error(`extracted kit missing ${KIT_CLI}`);
    err.code = "extract-incomplete";
    throw err;
  }
  return { root: KIT_ROOT, cli: KIT_CLI, extracted: true };
}

function resolveInput(p) {
  if (!p) return p;
  return isAbsolute(p) ? p : resolve(HERE, p);
}

function parseStdoutJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function readOutputFile(outDir, name) {
  if (!outDir) return null;
  const path = join(outDir, name);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  return { path, text, json: name.endsWith(".json") ? JSON.parse(text) : null };
}

/**
 * Spawn useful-jobs 1.4.0 lockfile-pin-delta with exact flags.
 * @param {{before?:string, after?:string, outDir?:string, extraArgs?:string[], timeoutMs?:number}} [opts]
 */
export function runLockfilePinDelta(opts = {}) {
  const kit = ensureKit();
  const before = resolveInput(opts.before);
  const after = resolveInput(opts.after);
  const outDir = opts.outDir ? resolve(opts.outDir) : null;
  const extraArgs = Array.isArray(opts.extraArgs) ? opts.extraArgs : [];
  const args = ["run", JOB_ID];
  if (opts.example === true) args.push("--example");
  if (before) args.push("--before", before);
  if (after) args.push("--after", after);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    args.push("--out-dir", outDir);
  }
  args.push(...extraArgs);

  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" };
  const spawned = spawnSync(process.execPath, [kit.cli, ...args], {
    cwd: kit.root,
    env,
    encoding: "utf8",
    timeout: opts.timeoutMs || 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  const stdoutJson = parseStdoutJson(spawned.stdout);
  const pinDelta = outDir ? readOutputFile(outDir, "pin-delta.json") : null;
  const pinDeltaMd = outDir ? readOutputFile(outDir, "pin-delta.md") : null;

  return {
    ok: spawned.status === 0 && stdoutJson?.ok === true,
    status: spawned.status == null ? 1 : spawned.status,
    stdout: spawned.stdout || "",
    stderr: spawned.stderr || "",
    stdoutJson,
    timedOut: spawned.error?.code === "ETIMEDOUT",
    error: spawned.error ? String(spawned.error.message || spawned.error) : null,
    args,
    kitRoot: kit.root,
    cli: kit.cli,
    inputs: { before, after, outDir },
    outputs: {
      jsonPath: pinDelta?.path || null,
      mdPath: pinDeltaMd?.path || null,
      report: pinDelta?.json || null,
      markdown: pinDeltaMd?.text || null,
    },
    purchaseAuthority: false,
  };
}

export function usage() {
  return `L04 winston lockfile adapter — useful-jobs 1.4.0 ${JOB_ID}

Usage:
  node adapter.mjs [--before <lock>] [--after <lock>] [--out-dir <dir>]
  node adapter.mjs --example

Defaults to the official winstonjs/winston package-lock pair stored under fixtures/official/.
Never fetches. purchaseAuthority=false.
`;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const example = args.example === true || args.example === "true";
  const before = example ? undefined : args.before || OFFICIAL_BEFORE;
  const after = example ? undefined : args.after || OFFICIAL_AFTER;
  const outDir = args["out-dir"] || join(HERE, "out", "lockfile-pin-delta");
  const result = runLockfilePinDelta({ before, after, outDir, example });
  if (result.stdout) process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  if (result.stderr) process.stderr.write(result.stderr);
  if (!result.stdoutJson) {
    writeFileSync(
      join(outDir, "adapter-stderr.json"),
      `${JSON.stringify({ ok: false, status: result.status, error: result.error, stderr: result.stderr }, null, 2)}\n`,
    );
  }
  process.exit(result.status);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
