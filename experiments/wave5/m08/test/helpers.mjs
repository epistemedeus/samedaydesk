import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = join(here, "..");
export const REPO_ROOT = join(MODULE_ROOT, "../../..");
export const CLI = join(MODULE_ROOT, "bin", "route-consumer.mjs");
export const FIXTURES = join(MODULE_ROOT, "fixtures");

export function tmpOut() {
  return mkdtempSync(join(tmpdir(), "w5-m08-out-"));
}

export function runConsumer(args, extra = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: extra.cwd || REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, ...(extra.env || {}) },
    timeout: extra.timeout || 30000,
  });
}

export function parseStdout(result) {
  const text = String(result.stdout || "").trim();
  if (!text) {
    throw new Error(`consumer produced no stdout. status=${result.status} stderr=${result.stderr}`);
  }
  const line = text.split("\n").filter(Boolean).pop();
  return JSON.parse(line);
}

export function fixture(kind, name) {
  return join(FIXTURES, kind, name);
}
