import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
export const KIT_ROOT = join(here, "..");
export const SDS_ROOT = join(KIT_ROOT, "../../..");
export const TRIAL_CLI = join(KIT_ROOT, "bin/trial.mjs");

export function tmpDir(prefix = "w5-m17-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeJson(dir, name, value) {
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

export function runTrial(args, cwd = SDS_ROOT) {
  return spawnSync(process.execPath, [TRIAL_CLI, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

export function parseJsonLine(stdout) {
  const text = String(stdout || "").trim();
  if (!text) throw new Error("no stdout");
  return JSON.parse(text);
}
