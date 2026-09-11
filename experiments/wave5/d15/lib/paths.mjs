import { join } from "node:path";
import { REPO_ROOT } from "../../../../server/paid-useful-jobs/lib/pins.mjs";

export { REPO_ROOT };

export const PAID_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");

export const CALLER_BUDGET_BEFORE = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json",
);

export const CALLER_BUDGET_AFTER = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/after.json",
);

export const CALLER_REPEAT_NEXT_ROOT = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/repeat-job-record/next-run-with-root.json",
);

export const CALLER_REPEAT_INPUT_ROOT = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/caller/repeat-job-record/input-root",
);

