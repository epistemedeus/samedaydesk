import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const OWNED = join(here, "..");
export const REPO_ROOT = join(OWNED, "../../..");
export const PAID_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");
export const PYTHON_TRIAL = join(OWNED, "runtime/trial.py");
export const RUNTIME_OWNED = join(OWNED, "fixtures/runtime-owned/vendor-budget");
export const RUNTIME_BEFORE = join(RUNTIME_OWNED, "before.json");
export const RUNTIME_AFTER = join(RUNTIME_OWNED, "after.json");
export const RUNTIME_UNSUPPORTED = join(RUNTIME_OWNED, "unsupported.html");
export const TESTED_WRAPPER_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
export const SELECTED_JOB = "vendor-budget-impact";
export const EXPECTED_OUTPUTS = Object.freeze(["budget-impact.json", "budget-impact.md"]);
