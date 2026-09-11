import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = join(here, "..");
export const SDS_ROOT = join(PACKAGE_ROOT, "../../..");
export const PINS = JSON.parse(readFileSync(join(PACKAGE_ROOT, "PINS.json"), "utf8"));
export const TRIAL_SCHEMA = "samedaydesk.wave5.m18.changed-page-trial.v0";
export const ENGINE_SHA = PINS.engine.sha;
export const ENGINE_REL_PATH = PINS.engine.path.replace(/\/$/, "");
export const CLOCK_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function publishedCustomerJobPaths(sdsRoot = SDS_ROOT) {
  const dir = join(sdsRoot, PINS.publishedCustomerJob.path);
  return {
    dir,
    before: join(dir, "before.json"),
    after: join(dir, "after.json"),
    job: join(dir, "job.json"),
  };
}
