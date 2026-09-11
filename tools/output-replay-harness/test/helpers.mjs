import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export const here = dirname(fileURLToPath(import.meta.url));
export const harnessRoot = join(here, "..");
export const replayBin = join(harnessRoot, "bin/replay.mjs");

export function tmpDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function spawnNode(args, opts = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: opts.cwd || harnessRoot,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => resolveP({ status, stdout, stderr }));
  });
}

export function parseJsonStdout(r) {
  const text = String(r.stdout || "").trim();
  if (!text) throw new Error(`empty stdout; stderr=${r.stderr}`);
  return JSON.parse(text);
}

export function writePair(dir, name, body) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`);
  return path;
}
