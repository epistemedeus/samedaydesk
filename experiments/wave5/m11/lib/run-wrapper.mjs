import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { WRAPPER_CLI, REPO_ROOT } from "./pins.mjs";

function parseJsonStdout(stdout) {
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

/**
 * Actual PR52 wrapper CLI. Does not reimplement job engines.
 */
export function runWrapperCli({
  jobId,
  files = {},
  example = false,
  funding = "unfunded",
  outDir,
  timeoutMs = 120_000,
} = {}) {
  const args = [WRAPPER_CLI, "run", jobId];
  if (example) args.push("--example");
  else {
    for (const [key, filePath] of Object.entries(files)) {
      if (!filePath) continue;
      args.push(`--${key}`, filePath);
    }
  }
  if (funding) {
    args.push("--funding", funding);
  }
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    args.push("--out-dir", outDir);
  }

  const spawned = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: REPO_ROOT,
  });

  return {
    status: spawned.status,
    signal: spawned.signal,
    stdout: spawned.stdout || "",
    stderr: spawned.stderr || "",
    json: parseJsonStdout(spawned.stdout),
    args,
    cli: WRAPPER_CLI,
  };
}
