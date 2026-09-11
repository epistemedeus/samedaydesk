import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "../../..");
export const WRAPPER_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");

function parseStdout(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function runWrapperCli(args, { cwd = REPO_ROOT, timeoutMs = 180_000 } = {}) {
  const result = spawnSync(process.execPath, [WRAPPER_CLI, ...args], {
    encoding: "utf8",
    cwd,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    body: parseStdout(result.stdout),
  };
}
