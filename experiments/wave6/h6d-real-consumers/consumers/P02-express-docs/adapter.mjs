#!/usr/bin/env node
/**
 * Cold CLI adapter: spawn useful-jobs 1.4.0 page-change-offline-job.
 * Never networks on the job path. --example is forwarded and must be refused.
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

const here = dirname(fileURLToPath(import.meta.url));
export const CONSUMER_ROOT = here;
export const JOB_ID = "page-change-offline-job";
export const KIT_VERSION = "1.4.0";
export const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
export const KIT_BYTES = 2_575_215;
export const DEFAULT_JOB = join(here, "fixtures/held/job.json");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function publishedArchive() {
  const repoRoot = resolve(here, "../../../../..");
  const archive = join(repoRoot, "client/public/kit/useful-jobs-1.4.0.tar.gz");
  const mirror = join(repoRoot, "client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz");
  return { archive, mirror, repoRoot };
}

export function ensureKit() {
  const vendorRoot = join(here, "vendor/useful-jobs-1.4.0");
  const cli = join(vendorRoot, "bin/useful-jobs.mjs");
  if (existsSync(cli)) return { root: vendorRoot, cli, extracted: false };
  const { archive } = publishedArchive();
  if (!existsSync(archive)) {
    const error = new Error(`missing published kit archive ${archive}`);
    error.code = "missing-archive";
    throw error;
  }
  const st = statSync(archive);
  if (st.size !== KIT_BYTES) {
    const error = new Error(`archive bytes ${st.size} != ${KIT_BYTES}`);
    error.code = "archive-size-mismatch";
    throw error;
  }
  const digest = sha256File(archive);
  if (digest !== KIT_SHA256) {
    const error = new Error(`archive sha256 mismatch`);
    error.code = "archive-digest-mismatch";
    throw error;
  }
  mkdirSync(join(here, "vendor"), { recursive: true });
  const tar = spawnSync("tar", ["-xzf", archive, "-C", join(here, "vendor")], { encoding: "utf8" });
  if (tar.status !== 0) {
    const error = new Error(`tar extract failed: ${tar.stderr || tar.status}`);
    error.code = "extract-failed";
    throw error;
  }
  if (!existsSync(cli)) {
    const error = new Error(`extracted kit missing ${cli}`);
    error.code = "extract-incomplete";
    throw error;
  }
  return { root: vendorRoot, cli, extracted: true };
}

function parseJsonMaybe(text) {
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

export function runPageChangeJob({
  jobPath = DEFAULT_JOB,
  outDir,
  extraArgs = [],
  timeoutMs = 60_000,
} = {}) {
  const kit = ensureKit();
  const resolvedOut = outDir ? (isAbsolute(outDir) ? outDir : resolve(here, outDir)) : join(here, "tmp/out");
  mkdirSync(resolvedOut, { recursive: true });
  const args = [kit.cli, "run", JOB_ID, ...extraArgs];
  const skipDefaultJob =
    extraArgs.includes("--job")
    || extraArgs.includes("--example")
    || extraArgs.includes("--sample")
    || extraArgs.includes("compare")
    || extraArgs.includes("--before")
    || extraArgs.includes("--fetch")
    || extraArgs.includes("--live-url")
    || extraArgs.includes("--live");
  const hasOut = extraArgs.includes("--out-dir");
  if (!skipDefaultJob && jobPath) args.push("--job", jobPath);
  if (!hasOut) args.push("--out-dir", resolvedOut);

  const result = spawnSync(process.execPath, args, {
    cwd: here,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
  });

  const stdoutJson = parseJsonMaybe(result.stdout);
  const stderrJson = parseJsonMaybe(result.stderr);
  const jsonPath = join(resolvedOut, "page-change.json");
  const mdPath = join(resolvedOut, "page-change.md");
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    stdoutJson,
    stderrJson,
    outDir: resolvedOut,
    written: {
      jsonPath: existsSync(jsonPath) ? jsonPath : null,
      mdPath: existsSync(mdPath) ? mdPath : null,
    },
    timedOut: result.error?.code === "ETIMEDOUT",
    error: result.error ? String(result.error.message || result.error) : null,
    kitCli: kit.cli,
  };
}

function parseCli(argv) {
  const extraArgs = [];
  let jobPath = DEFAULT_JOB;
  let outDir = join(here, "tmp/out");
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--job") {
      jobPath = argv[i + 1];
      extraArgs.push(token, argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--out-dir") {
      outDir = argv[i + 1];
      extraArgs.push(token, argv[i + 1]);
      i += 1;
      continue;
    }
    extraArgs.push(token);
    if (token.startsWith("--") && argv[i + 1] && !String(argv[i + 1]).startsWith("--")) {
      extraArgs.push(argv[i + 1]);
      i += 1;
    }
  }
  return { jobPath, outDir, extraArgs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { jobPath, outDir, extraArgs } = parseCli(process.argv.slice(2));
  const result = runPageChangeJob({ jobPath, outDir, extraArgs });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status == null ? 1 : result.status);
}
