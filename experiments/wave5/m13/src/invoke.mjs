import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { classifySpawn } from "./classify.mjs";

const TIMEOUT_MS = 120_000;

function spawnWrapper(cli, args, repoRoot) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
    timeout: TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function listCurrentJobs({ repoRoot, cli }) {
  if (!existsSync(cli)) {
    return {
      failureClass: "transport",
      outcome: "start-failure",
      code: "cli-missing",
      error: `wrapper CLI missing at ${cli}`,
      status: null,
      signal: null,
    };
  }
  return classifySpawn(spawnWrapper(cli, ["list"], repoRoot));
}

export function invokeCurrentJob({
  repoRoot,
  cli,
  jobId,
  inputs = {},
  outDir,
  funding,
  payment,
  example = false,
}) {
  if (!existsSync(cli)) {
    return {
      failureClass: "transport",
      outcome: "start-failure",
      code: "cli-missing",
      error: `wrapper CLI missing at ${cli}`,
      status: null,
      signal: null,
    };
  }
  if (!jobId) {
    return {
      failureClass: "analysis",
      outcome: "refusal",
      code: "missing-job",
      error: "jobId is required",
      status: 2,
      signal: null,
      body: { ok: false, refused: true, code: "missing-job" },
    };
  }
  const args = ["run", jobId];
  for (const [key, value] of Object.entries(inputs)) {
    if (value == null || value === false) continue;
    args.push(`--${key}`, String(value));
  }
  if (example) args.push("--example");
  if (funding) args.push("--funding", String(funding));
  if (payment) args.push("--payment", String(payment));
  if (outDir) args.push("--out-dir", String(outDir));
  return classifySpawn(spawnWrapper(cli, args, repoRoot));
}
