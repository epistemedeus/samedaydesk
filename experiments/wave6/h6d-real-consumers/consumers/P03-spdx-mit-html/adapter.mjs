#!/usr/bin/env node
/**
 * Cold CLI adapter: spawn useful-jobs 1.4.0 page-change-offline-job.
 * Never networks on the job path. --example is refused by the engine.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const CONSUMER_ROOT = here;
export const JOB_ID = "page-change-offline-job";
export const KIT_VERSION = "1.4.0";
export const KIT_SHA256 = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
export const KIT_BYTES = 2575215;
export const DEFAULT_JOB = join(here, "fixtures/jobs/positive.json");

const REPO_ROOT = resolve(here, "../../../../..");
const ARCHIVE = join(REPO_ROOT, "client/public/kit/useful-jobs-1.4.0.tar.gz");
const VENDOR_ROOT = join(here, "vendor/useful-jobs-1.4.0");
const CLI = join(VENDOR_ROOT, "bin/useful-jobs.mjs");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function ensureKit() {
  if (!existsSync(CLI)) {
    if (!existsSync(ARCHIVE)) {
      const err = new Error(`missing published archive ${ARCHIVE}`);
      err.code = "missing-archive";
      throw err;
    }
    const st = statSync(ARCHIVE);
    if (st.size !== KIT_BYTES) {
      const err = new Error(`archive bytes ${st.size} != ${KIT_BYTES}`);
      err.code = "archive-size-mismatch";
      throw err;
    }
    const digest = sha256File(ARCHIVE);
    if (digest !== KIT_SHA256) {
      const err = new Error(`archive sha256 ${digest} != ${KIT_SHA256}`);
      err.code = "archive-digest-mismatch";
      throw err;
    }
    mkdirSync(join(here, "vendor"), { recursive: true });
    const tar = spawnSync("tar", ["-xzf", ARCHIVE, "-C", join(here, "vendor")], { encoding: "utf8" });
    if (tar.status !== 0) {
      const err = new Error(`tar extract failed: ${tar.stderr || tar.status}`);
      err.code = "extract-failed";
      throw err;
    }
  }
  if (!existsSync(CLI)) {
    const err = new Error(`extracted kit missing ${CLI}`);
    err.code = "extract-incomplete";
    throw err;
  }
  return { root: VENDOR_ROOT, cli: CLI };
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

function parseStderrJson(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .find((row) => row.startsWith("{"));
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Spawn useful-jobs 1.4.0 with exact flags. Does not fetch.
 * @param {{job?: string, outDir: string, extraArgs?: string[], example?: boolean}} opts
 */
export function runPageChange({
  job = DEFAULT_JOB,
  outDir,
  extraArgs = [],
  example = false,
} = {}) {
  if (!outDir && !example) {
    const err = new Error("adapter requires --out-dir");
    err.code = "usage";
    throw err;
  }
  const { cli } = ensureKit();
  const args = ["run", JOB_ID];
  const extra = [...extraArgs];
  const wantsExample = example || extra.includes("--example") || extra.includes("--sample");
  if (wantsExample) {
    if (!extra.includes("--example") && !extra.includes("--sample")) extra.unshift("--example");
  } else {
    const jobPath = isAbsolute(job) ? job : resolve(here, job);
    args.push("--job", jobPath);
    args.push("--out-dir", isAbsolute(outDir) ? outDir : resolve(here, outDir));
  }
  if (outDir && wantsExample && !extra.includes("--out-dir")) {
    extra.push("--out-dir", isAbsolute(outDir) ? outDir : resolve(here, outDir));
  }
  args.push(...extra);
  if (outDir) mkdirSync(isAbsolute(outDir) ? outDir : resolve(here, outDir), { recursive: true });

  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: VENDOR_ROOT,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdoutJson = parseStdoutJson(r.stdout);
  const stderrJson = parseStderrJson(r.stderr);
  return {
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    stdoutJson,
    stderrJson,
    report: stdoutJson?.report ?? null,
    written: stdoutJson?.written ?? null,
    code: stderrJson?.code ?? stdoutJson?.code ?? null,
    timedOut: r.error?.code === "ETIMEDOUT",
    args,
    cli,
    networkUsed: false,
  };
}

function parseCli(argv) {
  const out = { extraArgs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--job") {
      out.job = argv[++i];
      continue;
    }
    if (token === "--out-dir") {
      out.outDir = argv[++i];
      continue;
    }
    if (token === "--example" || token === "--sample") {
      out.example = true;
      continue;
    }
    out.extraArgs.push(token);
  }
  return out;
}

function main(argv) {
  const parsed = parseCli(argv);
  const outDir = parsed.outDir || join(here, "tmp-out", "adapter");
  const result = runPageChange({
    job: parsed.job || DEFAULT_JOB,
    outDir,
    extraArgs: parsed.extraArgs,
    example: parsed.example === true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status == null ? 1 : result.status);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
