import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = resolve(HERE, "..");
export const REPO_ROOT = resolve(PACK_ROOT, "../..");
export const CLI = join(PACK_ROOT, "bin/useful-job-desk.mjs");

export function runDesk(args, opts = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: opts.cwd || REPO_ROOT,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ...(opts.env || {}) },
  });
}

export function parseReceipt(r) {
  const text = String(r.stdout || "").trim();
  if (!text) {
    throw new Error(`empty stdout; status=${r.status} stderr=${r.stderr}`);
  }
  return JSON.parse(text);
}
