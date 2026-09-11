import { spawnSync } from "node:child_process";
import { WRAPPER_CLI, REPO_ROOT, expectedOutputsFor } from "./pins.mjs";
import { classifySpawnFailure, classifyWrapperResult } from "./classify.mjs";

function parseJson(text) {
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

export function spawnWrapper(args, { timeoutMs = 120_000, cli = WRAPPER_CLI } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: REPO_ROOT,
  });
  const timedOut = result.error?.code === "ETIMEDOUT" || result.error?.killed === true;
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    timedOut,
    error: result.error || null,
  };
}

export function listJobs({ cli = WRAPPER_CLI } = {}) {
  const spawn = spawnWrapper(["list"], { cli });
  const json = parseJson(spawn.stdout);
  if (!json || json.ok !== true || !Array.isArray(json.jobs)) {
    return { ok: false, spawn, json, jobs: [] };
  }
  return { ok: true, jobs: json.jobs, liveSettlement: json.liveSettlement, spawn };
}

export function runWrapperJob({
  jobId,
  inputs = {},
  funding = "unfunded",
  payment = null,
  example = false,
  outDir,
  cli = WRAPPER_CLI,
} = {}) {
  const args = ["run", jobId];
  if (example) args.push("--example");
  for (const [key, value] of Object.entries(inputs)) {
    if (value == null || value === false || value === "") continue;
    args.push(`--${key}`, String(value));
  }
  if (funding) {
    args.push("--funding", String(funding));
  }
  if (payment) {
    args.push("--payment", String(payment));
  }
  if (outDir) args.push("--out-dir", outDir);

  const spawn = spawnWrapper(args, { cli });
  const json = parseJson(spawn.stdout);
  if (!json) {
    const failed = classifySpawnFailure(spawn);
    return { ...failed, spawn, classified: failed._classified };
  }
  const classified = classifyWrapperResult(json, {
    expectedOutputs: expectedOutputsFor(jobId),
    outDir,
    spawn,
  });
  return { ...json, spawn, classified };
}
