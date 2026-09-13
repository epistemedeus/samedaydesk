import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { replayRefuse } from "./args.mjs";
import { ensureUsefulJobsKit } from "./kit.mjs";
import { USEFUL_JOBS_CLI } from "./pins.mjs";

function parseEngineJson(stdout) {
  const trimmed = String(stdout || "").trim();
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

export function defaultRunJob(jobId, { files = {}, example = false, outDir, kit, timeoutMs = 120_000 } = {}) {
  const resolvedKit = kit || ensureUsefulJobsKit();
  const cli = join(resolvedKit, USEFUL_JOBS_CLI);
  const args = ["run", jobId];
  if (example) args.push("--example");
  else {
    for (const [key, filePath] of Object.entries(files)) {
      if (!filePath) continue;
      args.push(`--${key}`, filePath);
    }
  }
  if (outDir) args.push("--out-dir", outDir);

  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: resolvedKit,
  });

  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    json: parseEngineJson(result.stdout),
    kit: resolvedKit,
    cli,
    args,
  };
}

export function assertEngineOk(run, label) {
  if (run.status !== 0 || !run.json || run.json.ok !== true) {
    throw replayRefuse("engine-refused", `useful-jobs ${label} did not succeed`, {
      status: run.status,
      stdout: run.stdout,
      stderr: run.stderr,
      json: run.json,
    });
  }
}
