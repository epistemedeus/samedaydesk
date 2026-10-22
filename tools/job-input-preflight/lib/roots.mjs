import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = path.resolve(HERE, "..");
export const REPO_ROOT = path.resolve(MODULE_ROOT, "../..");
export const DEFAULT_CATALOG = path.join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/catalog.json",
);
export const DEFAULT_ARCHIVE = path.join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz",
);
export const DEFAULT_KIT_JSON = path.join(REPO_ROOT, "client/src/data/usefulJobsKit.json");
export const BIN = path.join(MODULE_ROOT, "bin/preflight.mjs");
export const FIXTURES = path.join(MODULE_ROOT, "fixtures");
