import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const H04_ROOT = join(here, "..");
export const SRC_DIR = here;
export const BIN_DIR = join(H04_ROOT, "bin");
export const EXAMPLES_DIR = join(H04_ROOT, "examples");
export const INVENTORY_PATH = join(H04_ROOT, "inventory", "ENGINES.json");
export const RUNS_DIR = join(H04_ROOT, "runs");
export const ENGINE_SMOKE_DIR = join(RUNS_DIR, "engine-smoke");
export const ALT_RUNS_DIR = "/tmp/w5-h04/h04-runs";

export const FAMILIES = Object.freeze([
  "schema-webhook",
  "lockfile",
  "api-routes",
  "page-facts",
]);
