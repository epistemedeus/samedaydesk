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
  "lockfile-public",
]);

export const M01_WORKTREE = "/tmp/w5-h04/ro-m01";
export const M01_COMPOSITION_SHA = "a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e";
export const M01_RUN_JOB = "experiments/wave5/m01/bin/run-job.mjs";
export const M01_CATALOG_CLI = "experiments/wave5/m01/bin/catalog.mjs";
export const M01_INDEX = "experiments/wave5/m01/index.mjs";
export const ORACLES_DIR = join(H04_ROOT, "oracles");
export const M01_REPLAY_DIR = join(RUNS_DIR, "m01-replay");
export const MEASUREMENTS_PATH = join(RUNS_DIR, "measurements", "m01-replay.json");
