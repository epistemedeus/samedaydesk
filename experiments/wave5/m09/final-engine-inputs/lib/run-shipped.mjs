import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseFirstJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  if (start < 0) return null;
  const slice = trimmed.slice(start);
  try {
    return JSON.parse(slice.split("\n")[0]);
  } catch {
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
}

export function runShipped(kit, args, { timeoutMs = 60_000, cwd } = {}) {
  const bin = kit.bin;
  const argv = ["run", "page-change-offline-job", ...args];
  const command = [process.execPath, bin, ...argv];
  const spawned = spawnSync(process.execPath, [bin, ...argv], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    cwd: cwd ?? kit.root,
  });
  const body = parseFirstJson(spawned.stdout);
  const errBody = parseFirstJson(spawned.stderr);
  return {
    command: command.join(" "),
    argv,
    exitCode: spawned.status ?? 1,
    stdout: spawned.stdout,
    stderr: spawned.stderr,
    body,
    errBody,
    signal: spawned.signal,
    error: spawned.error ? spawned.error.message : null,
  };
}

export function runJob(kit, { jobPath, outDir, extraArgs = [] }) {
  return runShipped(kit, ["--job", jobPath, "--out-dir", outDir, ...extraArgs]);
}

export function readWrittenReport(outDir) {
  const jsonPath = join(outDir, "page-change.json");
  if (!existsSync(jsonPath)) return null;
  return JSON.parse(readFileSync(jsonPath, "utf8"));
}
