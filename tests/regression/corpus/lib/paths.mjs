import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const CORPUS_DIR = join(here, "..");
export const CASES_DIR = join(CORPUS_DIR, "cases");
export const CATALOG_PATH = join(CORPUS_DIR, "catalog.json");
export const SCHEMA_PATH = join(CORPUS_DIR, "schema.json");
export const RUNNER_PATH = join(CORPUS_DIR, "run.mjs");

export function repoRoot() {
  return join(CORPUS_DIR, "../../..");
}

export const USEFUL_JOBS_PIN = Object.freeze({
  version: "1.4.7",
  rootName: "useful-jobs-1.4.7",
  archive: "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  sha256: "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec",
  bytes: 5255824,
});

export const USEFUL_JOBS_NEGATIVE_110 = Object.freeze({
  version: "1.1.0",
  archive: "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz",
  sha256: "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534",
  bytes: 2577606,
});
