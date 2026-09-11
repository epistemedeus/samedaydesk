import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { REPO_ROOT, WRAPPER_CLI } from "./paths.mjs";

export function parseJsonStdout(text) {
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

export function runWrapperCli(args, { timeoutMs = 120_000, cwd = REPO_ROOT } = {}) {
  const result = spawnSync(process.execPath, [WRAPPER_CLI, ...args], {
    encoding: "utf8",
    cwd,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const json = parseJsonStdout(result.stdout);
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    json,
    timedOut: result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM",
    error: result.error ? result.error.message : null,
  };
}

export function loadResultFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}
