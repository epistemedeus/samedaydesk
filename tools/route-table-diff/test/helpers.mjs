import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = join(here, "..");
export const REPO_ROOT = join(MODULE_ROOT, "../..");
export const CLI = join(MODULE_ROOT, "bin", "route-diff.mjs");

export function tmpOut() {
  return mkdtempSync(join(tmpdir(), "route-table-diff-"));
}

export function runCli(args, cwd = REPO_ROOT) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

export function parseStdout(result) {
  const text = (result.stdout || "").trim();
  if (!text) {
    throw new Error(`CLI produced no stdout. status=${result.status} stderr=${result.stderr}`);
  }
  return JSON.parse(text);
}
