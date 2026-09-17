import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = join(TEST_DIR, "..");
export const REPO = join(TOOL_DIR, "../..");
export const CLI = join(TOOL_DIR, "bin/managed-listing-repair.mjs");
export const OK_FIXTURE = join(TOOL_DIR, "fixtures/ok.json");

export function tmpOut(name = "journey.json") {
  const dir = mkdtempSync(join(tmpdir(), "mlr-test-"));
  return join(dir, name);
}

export function runCli(args, { cwd = REPO } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}
