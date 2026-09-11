import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "../lib/paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const M14 = join(here, "..");
export const PREVIEW_CLI = join(M14, "bin/preview.mjs");
export const FIXTURES = join(here, "fixtures");
export const PAID = join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller");

export function preview(args, { timeoutMs = 120_000 } = {}) {
  const result = spawnSync(process.execPath, [PREVIEW_CLI, ...args], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return result;
}

export function previewJson(args, opts) {
  const result = preview(args, opts);
  const text = String(result.stdout || "").trim();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { ...result, json };
}
