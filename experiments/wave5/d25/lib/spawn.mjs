import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./repo.mjs";

export function runNode(args, { cwd = REPO_ROOT, timeoutMs = 120_000, env } = {}) {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : process.env,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
  };
}

export function parseJsonStdout(result) {
  const text = String(result.stdout || "").trim();
  if (!text) return { ok: false, parseable: false, body: null, error: "empty-stdout" };
  try {
    return { ok: true, parseable: true, body: JSON.parse(text) };
  } catch (err) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return { ok: true, parseable: true, body: JSON.parse(text.slice(start, end + 1)) };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, parseable: false, body: null, error: err.message };
  }
}
