#!/usr/bin/env node
/**
 * Cold CLI adapter for useful-jobs 1.4.0 route-table-diff (primary)
 * and optional api-upgrade-brief (secondary). No network on the job path.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const KIT_VERSION = "1.4.0";
export const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
export const KIT_BYTES = 2575215;
export const PRIMARY_JOB = "route-table-diff";
export const SECONDARY_JOB = "api-upgrade-brief";

const REPO_ROOT = resolve(HERE, "../../../../..");
const PUBLISHED_ARCHIVE = join(REPO_ROOT, "client/public/kit/useful-jobs-1.4.0.tar.gz");
const VENDOR_ROOT = join(HERE, "vendor/useful-jobs-1.4.0");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else out._.push(a);
  }
  return out;
}

export function resolveKit({ destDir = join(HERE, "vendor") } = {}) {
  const cli = join(VENDOR_ROOT, "bin/useful-jobs.mjs");
  if (existsSync(cli)) {
    return { root: VENDOR_ROOT, cli, extracted: false };
  }
  if (!existsSync(PUBLISHED_ARCHIVE)) {
    const err = new Error(`missing published kit ${PUBLISHED_ARCHIVE}`);
    err.code = "missing-archive";
    throw err;
  }
  const st = statSync(PUBLISHED_ARCHIVE);
  if (st.size !== KIT_BYTES) {
    const err = new Error(`kit bytes ${st.size} != ${KIT_BYTES}`);
    err.code = "archive-size-mismatch";
    throw err;
  }
  const digest = sha256File(PUBLISHED_ARCHIVE);
  if (digest !== KIT_SHA256) {
    const err = new Error(`kit sha256 ${digest} != ${KIT_SHA256}`);
    err.code = "archive-digest-mismatch";
    throw err;
  }
  mkdirSync(destDir, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", PUBLISHED_ARCHIVE, "-C", destDir], { encoding: "utf8" });
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
  return { root: VENDOR_ROOT, cli, extracted: true, digest };
}

function parseStdoutJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      /* keep looking */
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function runUsefulJob({
  jobId,
  args = [],
  cwd = HERE,
  timeoutMs = 90_000,
} = {}) {
  const kit = resolveKit();
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" };
  const r = spawnSync(process.execPath, [kit.cli, "run", jobId, ...args], {
    cwd: kit.root,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    jobId,
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    stdoutJson: parseStdoutJson(r.stdout),
    timedOut: r.error?.code === "ETIMEDOUT",
    error: r.error ? String(r.error.message || r.error) : null,
    cli: kit.cli,
    cwd: kit.root,
    callerCwd: cwd,
  };
}

export function runRouteTableDiff({ before, after, outDir, extra = [] } = {}) {
  if (!outDir) {
    return {
      jobId: PRIMARY_JOB,
      status: 2,
      stdoutJson: {
        ok: false,
        refused: true,
        code: "missing_out_dir",
        error: "--out-dir is required",
      },
      stdout: "",
      stderr: "",
    };
  }
  const args = ["--before", resolve(before), "--after", resolve(after), "--out-dir", resolve(outDir), ...extra];
  return runUsefulJob({ jobId: PRIMARY_JOB, args });
}

export function runApiUpgradeBrief({ before, after, used, outDir, extra = [] } = {}) {
  const args = [
    "--before",
    resolve(before),
    "--after",
    resolve(after),
    "--used",
    resolve(used),
    ...(outDir ? ["--out-dir", resolve(outDir)] : []),
    ...extra,
  ];
  return runUsefulJob({ jobId: SECONDARY_JOB, args, timeoutMs: 120_000 });
}

function main(argv) {
  const args = parseArgs(argv);
  const job = args.job || args._[0] || PRIMARY_JOB;
  let result;
  if (job === SECONDARY_JOB || job === "api-upgrade-brief") {
    result = runApiUpgradeBrief({
      before: args.before,
      after: args.after,
      used: args.used,
      outDir: args["out-dir"],
    });
  } else {
    result = runRouteTableDiff({
      before: args.before,
      after: args.after,
      outDir: args["out-dir"],
    });
  }
  const body = result.stdoutJson || {
    ok: false,
    refused: true,
    code: result.timedOut ? "engine-timeout" : "error",
    error: result.error || "no stdout json",
    status: result.status,
  };
  process.stdout.write(`${JSON.stringify(body)}\n`);
  process.exit(result.status == null ? 1 : result.status);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
