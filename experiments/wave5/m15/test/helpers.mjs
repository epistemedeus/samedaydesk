import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BIN = join(KIT_ROOT, "bin", "schema-change-trial.mjs");

export function tempDir(prefix = "m15-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function stageDest(dir) {
  const dest = join(dir, ".engine");
  mkdirSync(dest, { recursive: true });
  return dest;
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

export function assertFile(path, message) {
  if (!existsSync(path)) throw new Error(message || `missing ${path}`);
}
