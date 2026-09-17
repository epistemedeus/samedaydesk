import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(here, "../../..");
export const BIN = join(PACK_ROOT, "bin/discover.mjs");
export const FIXTURES = join(PACK_ROOT, "fixtures");

export function runDiscover(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
  });
}

export function parseStdout(result) {
  const text = String(result.stdout || "").trim();
  return { text, json: text ? JSON.parse(text) : null };
}
