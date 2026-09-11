import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = join(here, "..");
export const CATALOG_PATH = join(MODULE_ROOT, "catalog.json");
export const CACHE_ROOT = join(MODULE_ROOT, ".cache", "engines");
export const REPO_ROOT = join(MODULE_ROOT, "../../..");
export const WRAPPER_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");
export const LIVE_CATALOG_PATH = join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json");
