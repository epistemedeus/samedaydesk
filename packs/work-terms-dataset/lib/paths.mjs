import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = join(here, "..");
export const REPO_ROOT = join(PACK_ROOT, "..", "..");
export const DATA_ROOT = join(REPO_ROOT, "data", "work-terms");
export const FIXTURES_ROOT = join(PACK_ROOT, "fixtures");
export const SEEDED_FAILURES_DIR = join(FIXTURES_ROOT, "seeded-failures");
export const PIN_PATH = join(PACK_ROOT, "PIN.json");

export function loadPin() {
  return JSON.parse(readFileSync(PIN_PATH, "utf8"));
}

export function recordsDir(root = DATA_ROOT) {
  return join(root, "records");
}

export function catalogPath(root = DATA_ROOT) {
  return join(root, "catalog.json");
}

export function versionsPath(root = DATA_ROOT) {
  return join(root, "versions.json");
}

export function invalidationsPath(root = DATA_ROOT) {
  return join(root, "invalidations.jsonl");
}

export function coveragePath(root = DATA_ROOT) {
  return join(root, "COVERAGE.txt");
}
