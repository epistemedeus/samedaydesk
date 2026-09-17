import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const CORPUS_DIR = join(here, "..");
export const CASES_DIR = join(CORPUS_DIR, "cases");
export const CATALOG_PATH = join(CORPUS_DIR, "catalog.json");
export const SCHEMA_PATH = join(CORPUS_DIR, "schema.json");
export const RUNNER_PATH = join(CORPUS_DIR, "run.mjs");

export function repoRoot() {
  return join(CORPUS_DIR, "../..");
}
