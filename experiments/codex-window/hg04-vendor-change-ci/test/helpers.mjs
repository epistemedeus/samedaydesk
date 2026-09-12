import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BIN = join(ROOT, "bin/vendor-change-ci.mjs");
export const PY = join(ROOT, "bin/vendor-change-ci.py");
export const OBTAIN = join(ROOT, "bin/obtain-kit.mjs");

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function tmpOut(prefix = "hg04-out-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function runNode(args, extra = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 60_000,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768", ...(extra.env || {}) },
  });
}

export function runPython(args) {
  return spawnSync("python3", [PY, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 60_000,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" },
  });
}

export function lastJson(stdout) {
  const text = String(stdout || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error(`no JSON in stdout: ${text.slice(0, 400)}`);
  }
}
