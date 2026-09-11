import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const moduleRoot = resolve(here, "..");
export const repoRoot = resolve(moduleRoot, "../..");
export const joinBin = join(moduleRoot, "bin/join.mjs");

export function runJoin(args, env = {}) {
  return spawnSync(process.execPath, [joinBin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

export function parseStdout(result) {
  const text = String(result.stdout || "").trim();
  if (!text) {
    throw new Error(`empty stdout status=${result.status} stderr=${result.stderr}`);
  }
  return JSON.parse(text);
}

export function parseStderr(result) {
  const text = String(result.stderr || "").trim();
  if (!text) {
    throw new Error(`empty stderr status=${result.status} stdout=${result.stdout}`);
  }
  return JSON.parse(text);
}
