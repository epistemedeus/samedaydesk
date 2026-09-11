import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { USEFUL_JOBS_CLI, USEFUL_JOBS_JOB } from "./pins.mjs";
import { parseEngineJson } from "./parse-json.mjs";

export function spawnUsefulJob({
  kit,
  jobId = USEFUL_JOBS_JOB,
  example = true,
  input = null,
  outDir = null,
  env = process.env,
  timeoutMs = 120_000,
} = {}) {
  const cli = join(kit, USEFUL_JOBS_CLI);
  const args = ["run", jobId];
  if (example) args.push("--example");
  else {
    if (!input) throw new Error("caller run requires --input");
    args.push("--input", input);
  }
  const dest = outDir || mkdtempSync(join(tmpdir(), "honesty-job-"));
  args.push("--out-dir", dest);

  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: kit,
    env,
  });

  return {
    jobId,
    example,
    input,
    outDir: dest,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    json: parseEngineJson(result.stdout),
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

export function spawnNodeScript({ script, args = [], env = process.env, cwd, timeoutMs = 30_000 } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    cwd,
    env,
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

export function spawnNodeScriptAsync({ script, args = [], env = process.env, cwd, timeoutMs = 15_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      env,
      cwd,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (status, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status,
        stdout,
        stderr,
        error,
      });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null, "timeout");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => finish(null, String(error.message || error)));
    child.on("close", (status) => finish(status, null));
  });
}
