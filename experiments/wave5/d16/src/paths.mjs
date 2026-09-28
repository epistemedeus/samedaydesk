import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(OWNED_DIR, "../../..");
export const WRAPPER_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");
export const WRAPPER_LIB = join(REPO_ROOT, "server/paid-useful-jobs/lib/wrapper.mjs");
export const ENGINE_LIB = join(REPO_ROOT, "server/paid-useful-jobs/lib/engine.mjs");
export const PINS_LIB = join(REPO_ROOT, "server/paid-useful-jobs/lib/pins.mjs");
export const CALLER_BUDGET_BEFORE = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json",
);
export const CALLER_BUDGET_AFTER = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json",
);
export const CALLER_EVIDENCE = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/evidence-ci-annotation/input.json",
);
export const BROKEN_DIR = join(OWNED_DIR, "fixtures/broken-engines");
