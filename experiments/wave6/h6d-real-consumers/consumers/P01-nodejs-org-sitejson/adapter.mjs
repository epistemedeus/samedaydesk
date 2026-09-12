#!/usr/bin/env node
/**
 * Cold CLI adapter: spawn useful-jobs 1.4.0 page-change-offline-job.
 * Never networks on the job path. --example is refused by the engine.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureKitAt } from "../../lib/ensure-kit.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const JOB_ID = "page-change-offline-job";
const DEFAULT_JOB = join(ROOT, "fixtures/jobs/positive.json");

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

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function resolveLocal(value) {
  if (!value || isHttpUrl(value)) return value;
  return resolve(ROOT, value);
}

function withAbsolutePaths(argv) {
  const pathFlags = new Set(["job", "out-dir", "before", "after"]);
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--") && pathFlags.has(token.slice(2))) {
      const value = argv[i + 1];
      out.push(token);
      if (value !== undefined) {
        out.push(resolveLocal(value));
        i += 1;
      }
      continue;
    }
    out.push(token);
  }
  return out;
}

export function kitCli() {
  return ensureKitAt(join(ROOT, "vendor")).cli;
}

export function runPageChange({
  job = DEFAULT_JOB,
  outDir,
  extraArgs = [],
  timeoutMs = 60_000,
} = {}) {
  const CLI = kitCli();

  const forwarded = withAbsolutePaths(extraArgs);
  const args = [CLI, "run", JOB_ID, ...forwarded];
  const hasJobFlag = forwarded.includes("--job");
  const hasOutDirFlag = forwarded.includes("--out-dir");
  const example = forwarded.includes("--example") || forwarded.includes("--sample");
  if (!example && !hasJobFlag && job) {
    args.push("--job", resolveLocal(job));
  }
  if (!hasOutDirFlag && outDir) {
    const absOut = resolveLocal(outDir);
    mkdirSync(absOut, { recursive: true });
    args.push("--out-dir", absOut);
  } else if (hasOutDirFlag) {
    const idx = forwarded.indexOf("--out-dir");
    if (idx >= 0 && forwarded[idx + 1] && !isHttpUrl(forwarded[idx + 1])) {
      mkdirSync(forwarded[idx + 1], { recursive: true });
    }
  }

  const r = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });

  const stdoutJson = parseJsonMaybe(r.stdout);
  const stderrJson = parseJsonMaybe(r.stderr);
  const report = stdoutJson?.report ?? null;
  const written = stdoutJson?.written ?? null;
  const code = stderrJson?.code ?? (r.status === 0 ? null : "error");
  return {
    ok: r.status === 0 && stdoutJson?.ok === true,
    status: r.status == null ? 1 : r.status,
    timedOut: r.error?.code === "ETIMEDOUT",
    code,
    message: stderrJson?.message ?? r.error?.message ?? null,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    stdoutJson,
    stderrJson,
    report,
    written,
    claims: report?.claims ?? null,
    verdict: report?.verdict ?? null,
    purchaseAuthority: false,
    networkUsed: report?.provenance?.networkUsed === true,
    args,
  };
}

export function readOutputJson(outDir) {
  const path = join(outDir, "page-change.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgv(argv) {
  const extraArgs = [];
  let job = DEFAULT_JOB;
  let outDir = join(ROOT, "tmp-out/positive");
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--job") {
      job = argv[i + 1];
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
  }
  return { job, outDir, extraArgs };
}

export function main(argv = process.argv.slice(2)) {
  const parsed = parseArgv(argv);
  const result = runPageChange(parsed);
  const body = {
    ok: result.ok,
    status: result.status,
    code: result.code,
    message: result.message,
    verdict: result.verdict,
    claims: result.claims,
    written: result.written,
    purchaseAuthority: false,
    networkUsed: result.networkUsed,
    job: parsed.extraArgs.includes("--example") ? null : parsed.job,
    outDir: parsed.outDir,
    stdoutJson: result.stdoutJson,
    stderrJson: result.stderrJson,
  };
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  process.exit(result.status);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main();
}
