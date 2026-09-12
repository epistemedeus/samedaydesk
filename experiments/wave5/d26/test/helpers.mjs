import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { OWNED_DIR, REPO_ROOT } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const CLI = join(here, "../bin/price-floor.mjs");

export function runCli(args, { timeoutMs = 180_000 } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: join(OWNED_DIR),
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function parseOut(spawned) {
  const text = String(spawned.stdout || "").trim();
  return JSON.parse(text);
}

export { REPO_ROOT };
