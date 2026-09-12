import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ARCHIVE_100, ARCHIVE_110 } from "./pins.mjs";
import { cli110, coldEnv, ensureCold100, ensureCold110 } from "./cold-root.mjs";

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

function packResult({ argv, cwd, kit, command, result, stdout, stderr, error, timedOut, status, signal }) {
  return {
    command: command || ["node", ...ARCHIVE_110.command.slice(1), ...argv],
    cwd,
    kit,
    status: status == null ? (result?.status ?? null) : status,
    signal: signal || result?.signal || null,
    timedOut: Boolean(timedOut || (error && error.code === "ETIMEDOUT") || result?.signal === "SIGTERM"),
    spawnError: error?.message || result?.error?.message || null,
    stdout: stdout || "",
    stderr: stderr || "",
    json: parseJson(stdout) || parseJson(stderr),
  };
}

export function invokeUsefulJobs({
  argv,
  cwd,
  timeoutMs = 60_000,
  root,
} = {}) {
  const kit = root || ensureCold110();
  const cli = cli110(kit);
  const workCwd = cwd || kit;
  mkdirSync(workCwd, { recursive: true });
  const result = spawnSync(process.execPath, [cli, ...argv], {
    cwd: workCwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: coldEnv(),
  });
  return packResult({
    argv,
    cwd: workCwd,
    kit,
    result,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
  });
}

export function invokeUsefulJobs100({ argv, cwd, timeoutMs = 60_000 } = {}) {
  const kit = ensureCold100();
  const cli = join(kit, "bin/useful-jobs.mjs");
  const workCwd = cwd || kit;
  mkdirSync(workCwd, { recursive: true });
  const result = spawnSync(process.execPath, [cli, ...argv], {
    cwd: workCwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: coldEnv(),
  });
  return packResult({
    argv,
    cwd: workCwd,
    kit,
    command: ["node", "bin/useful-jobs.mjs", ...argv],
    result,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
  });
}

export function invokeUsefulJobsAsync({ argv, cwd, timeoutMs = 60_000, root } = {}) {
  const kit = root || ensureCold110();
  const cli = cli110(kit);
  const workCwd = cwd || kit;
  mkdirSync(workCwd, { recursive: true });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...argv], {
      cwd: workCwd,
      env: coldEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve(
        packResult({
          argv,
          cwd: workCwd,
          kit,
          stdout,
          stderr,
          error,
          status: null,
          timedOut: error.code === "ETIMEDOUT",
        }),
      );
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve(
        packResult({
          argv,
          cwd: workCwd,
          kit,
          stdout,
          stderr,
          status,
          signal,
          timedOut: signal === "SIGTERM",
        }),
      );
    });
  });
}

export function runJob(jobId, flags, opts = {}) {
  return invokeUsefulJobs({
    argv: ["run", jobId, ...flags],
    ...opts,
  });
}

export function runJobAsync(jobId, flags, opts = {}) {
  return invokeUsefulJobsAsync({
    argv: ["run", jobId, ...flags],
    ...opts,
  });
}

export { ARCHIVE_100, ARCHIVE_110 };
