import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = join(here, "..");
export const CLI = join(MODULE_ROOT, "bin/desk.mjs");
export const REPO_ROOT = join(MODULE_ROOT, "../..");
export const CALLER_BEFORE = join(
  MODULE_ROOT,
  "fixtures/caller/vendor-budget-impact/before.json",
);
export const CALLER_AFTER = join(
  MODULE_ROOT,
  "fixtures/caller/vendor-budget-impact/after.json",
);

export function tempStore(prefix = "job-request-desk-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function runDesk(args, { cwd = REPO_ROOT, timeout = 120_000 } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function parseJson(text) {
  const trimmed = String(text || "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`no JSON in: ${trimmed.slice(0, 400)}`);
  return JSON.parse(trimmed.slice(start, end + 1));
}
