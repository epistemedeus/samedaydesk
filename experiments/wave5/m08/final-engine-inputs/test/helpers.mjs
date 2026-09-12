import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveKit } from "../lib/resolve-kit.mjs";
import { parseStdout, runShipped } from "../lib/run-shipped.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = join(here, "..");
export const INPUTS = join(MODULE_ROOT, "inputs");

export function input(name) {
  return join(INPUTS, name);
}

export function tmpOut() {
  return mkdtempSync(join(tmpdir(), "w5-m08-final-out-"));
}

export function kit() {
  return resolveKit();
}

export function run(args) {
  return runShipped({ kit: kit(), ...args });
}

export { parseStdout };
