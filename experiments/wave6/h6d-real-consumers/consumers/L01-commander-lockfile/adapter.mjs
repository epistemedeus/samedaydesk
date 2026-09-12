#!/usr/bin/env node
/**
 * Cold CLI adapter: spawn useful-jobs 1.4.0 lockfile-pin-delta.
 * Never networks on the job path. Does not import kit compare/oracle modules.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  mkdtempSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const USEFUL_JOBS = Object.freeze({
  version: "1.4.0",
  jobId: "lockfile-pin-delta",
  sha256: "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f",
  bytes: 2575215,
  archiveCandidates: Object.freeze([
    "/tmp/h6d/wt/client/public/kit/useful-jobs-1.4.0.tar.gz",
    join(HERE, "../../../../../client/public/kit/useful-jobs-1.4.0.tar.gz"),
    join(HERE, "../../../../../client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz"),
  ]),
  vendorRoot: join(HERE, "vendor/useful-jobs-1.4.0"),
  cliRel: "bin/useful-jobs.mjs",
});

export const DEFAULT_INPUTS = Object.freeze({
  before: join(HERE, "fixtures/official/before.package-lock.json"),
  after: join(HERE, "fixtures/official/after.package-lock.json"),
});

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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

export function findArchive() {
  for (const candidate of USEFUL_JOBS.archiveCandidates) {
    const path = resolve(candidate);
    if (existsSync(path)) return path;
  }
  return null;
}

export function ensureKit() {
  const cli = join(USEFUL_JOBS.vendorRoot, USEFUL_JOBS.cliRel);
  if (existsSync(cli)) {
    return { root: USEFUL_JOBS.vendorRoot, cli, extracted: false };
  }
  const archive = findArchive();
  if (!archive) {
    const err = new Error("useful-jobs 1.4.0 archive not found");
    err.code = "missing-archive";
    throw err;
  }
  const st = statSync(archive);
  if (st.size !== USEFUL_JOBS.bytes) {
    const err = new Error(`archive bytes ${st.size} != ${USEFUL_JOBS.bytes}`);
    err.code = "archive-size-mismatch";
    throw err;
  }
  const digest = sha256File(archive);
  if (digest !== USEFUL_JOBS.sha256) {
    const err = new Error(`archive sha256 ${digest} != ${USEFUL_JOBS.sha256}`);
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
  return { root: USEFUL_JOBS.vendorRoot, cli, extracted: true, digest, bytes: st.size };
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Cold-spawn lockfile-pin-delta. Job path is local files only.
 * @param {{before?: string, after?: string, outDir?: string, extra?: string[]}} [opts]
 */
export function runLockfilePinDelta(opts = {}) {
  const kit = ensureKit();
  const before = resolve(String(opts.before || DEFAULT_INPUTS.before));
  const after = resolve(String(opts.after || DEFAULT_INPUTS.after));
  mkdirSync(join(HERE, "tmp"), { recursive: true });
  const outDir = resolve(String(opts.outDir || mkdtempSync(join(HERE, "tmp", "run-"))));
  mkdirSync(outDir, { recursive: true });

  const args = [
    kit.cli,
    "run",
    USEFUL_JOBS.jobId,
    "--before",
    before,
    "--after",
    after,
    "--out-dir",
    outDir,
    ...(opts.extra || []),
  ];
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" };
  const spawned = spawnSync(process.execPath, args, {
    cwd: kit.root,
    env,
    encoding: "utf8",
    timeout: opts.timeoutMs || 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  let stdoutJson = null;
  const text = String(spawned.stdout || "").trim();
  if (text) {
    try {
      stdoutJson = JSON.parse(text);
    } catch {
      const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
          stdoutJson = JSON.parse(lines[i]);
          break;
        } catch {
          // continue
        }
      }
    }
  }

  const reportPath = join(outDir, "pin-delta.json");
  const mdPath = join(outDir, "pin-delta.md");
  const report = readJsonIfExists(reportPath);
  const markdown = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : null;

  return {
    ok: spawned.status === 0 && stdoutJson?.ok === true,
    status: spawned.status == null ? 1 : spawned.status,
    stdout: spawned.stdout || "",
    stderr: spawned.stderr || "",
    stdoutJson,
    report,
    markdown,
    outDir,
    outputs: {
      json: existsSync(reportPath) ? reportPath : null,
      md: existsSync(mdPath) ? mdPath : null,
    },
    timedOut: spawned.error?.code === "ETIMEDOUT",
    kit: { root: kit.root, cli: kit.cli, version: USEFUL_JOBS.version },
    inputs: { before, after },
    purchaseAuthority: false,
    jobId: USEFUL_JOBS.jobId,
  };
}

export function run(opts) {
  return runLockfilePinDelta(opts);
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help || args.h) {
    process.stdout.write(
      "adapter: cold useful-jobs 1.4.0 lockfile-pin-delta\n" +
        "  node adapter.mjs [--before lock] [--after lock] [--out-dir dir]\n",
    );
    process.exit(0);
  }
  const result = runLockfilePinDelta({
    before: args.before,
    after: args.after,
    outDir: args["out-dir"],
  });
  const body = {
    ok: result.ok,
    jobId: result.jobId,
    status: result.stdoutJson?.status || (result.ok ? "ok" : "refused"),
    exit: result.status,
    counts: result.stdoutJson?.counts || result.report?.counts || null,
    outDir: result.outDir,
    outputs: result.outputs,
    stdoutJson: result.stdoutJson,
    purchaseAuthority: false,
    settlement: "nonsettling-prototype",
    code: result.stdoutJson?.code || null,
    error: result.stdoutJson?.error || null,
  };
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  process.exit(result.status);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2));
}
