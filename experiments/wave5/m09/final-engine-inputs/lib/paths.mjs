import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = resolve(here, "..");
export const PIN_PATH = resolve(PACKAGE_ROOT, "PIN.json");
export const SNAPSHOTS_ROOT = resolve(PACKAGE_ROOT, "snapshots");
export const CASES_ROOT = resolve(SNAPSHOTS_ROOT, "cases");
export const CLOCK = "2026-09-11T12:00:00.000Z";

export function loadPin() {
  return JSON.parse(readFileSync(PIN_PATH, "utf8"));
}
