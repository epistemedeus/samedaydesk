import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(MODULE_ROOT, "../..");

export const PUBLISHED = Object.freeze({
  catalog: join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json"),
  outcomes: join(REPO_ROOT, "client/public/for-agents/useful-jobs/jobs-outcomes.json"),
  recipeSpecsDir: join(REPO_ROOT, "tools/recurring-job-recipes/specs"),
  recipeReadme: join(REPO_ROOT, "tools/recurring-job-recipes/README.md"),
  recipeRunner: join(REPO_ROOT, "tools/recurring-job-recipes/lib/run.mjs"),
  familiesDoc: join(REPO_ROOT, "experiments/s176-record-repeat-package/docs/FAMILIES.md"),
  familyDiscovery: join(REPO_ROOT, "experiments/s176-record-repeat-package/discovery/record-repeat.json"),
  offerMatrix: join(REPO_ROOT, "tools/offer-routing/capability-limits-matrix.json"),
  offerRouter: join(REPO_ROOT, "tools/offer-routing/route-job.mjs"),
  pageChangeJob: join(REPO_ROOT, "tools/offer-routing/fixtures/page-change-evidence.job.json"),
});

export const WRITE_FORBIDDEN = Object.freeze([
  PUBLISHED.catalog,
  PUBLISHED.outcomes,
  PUBLISHED.recipeSpecsDir,
  PUBLISHED.recipeReadme,
  PUBLISHED.familiesDoc,
  PUBLISHED.familyDiscovery,
  PUBLISHED.offerMatrix,
  PUBLISHED.pageChangeJob,
]);
