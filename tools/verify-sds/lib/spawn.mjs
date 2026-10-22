import { spawnSync } from "node:child_process";

export function runNode(script, args = [], { cwd, timeoutMs = 60_000 } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    env: process.env,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
    argv: [process.execPath, script, ...args],
  };
}

export function parseStdoutJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { ok: false, error: "empty_stdout" };
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line.startsWith("{") && !line.startsWith("[")) continue;
    try {
      return { ok: true, value: JSON.parse(line) };
    } catch {
      // try a previous line
    }
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
