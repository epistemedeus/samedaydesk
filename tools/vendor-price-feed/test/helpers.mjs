import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = join(here, "..");
export const CLI = join(TOOL_DIR, "bin/vendor-price-feed.mjs");
export const FIXTURES = join(TOOL_DIR, "fixtures");

export function tmpStore(prefix = "vpf-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function fixture(name) {
  return join(FIXTURES, name);
}

export function runCli(args, { cwd = TOOL_DIR, storeDir } = {}) {
  const extra = storeDir ? ["--store", storeDir] : [];
  return spawnSync(process.execPath, [CLI, ...args, ...extra], {
    encoding: "utf8",
    cwd,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env },
  });
}

export function parseStdout(result) {
  const text = (result.stdout || "").trim();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `stdout not JSON (status=${result.status}): ${text}\nstderr=${result.stderr}\nparse=${err.message}`,
    );
  }
}

export { REPO_ROOT };
