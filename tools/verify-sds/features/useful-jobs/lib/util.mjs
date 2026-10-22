import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

export function sha256Buffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

export function clip(text, max = 800) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export function parseJsonText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function runCommand(argv, { cwd, timeoutMs = 60_000, env } = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
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
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveP({ code: code ?? 1, signal, stdout, stderr, argv });
    });
  });
}

export function jobIdsFromList(list) {
  if (Array.isArray(list?.jobs)) {
    return list.jobs.map((j) => (typeof j === "string" ? j : j?.id)).filter(Boolean);
  }
  return [];
}
