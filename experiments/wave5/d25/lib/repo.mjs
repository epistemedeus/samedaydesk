import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const D25_ROOT = join(here, "..");
export const REPO_ROOT = join(D25_ROOT, "../../..");
export const PUBLIC_DIR = join(REPO_ROOT, "client/public");
export const D01_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");
export const D01_INDEX = join(REPO_ROOT, "server/paid-useful-jobs/index.mjs");
export const D01_PAYMENT = join(
  REPO_ROOT,
  "server/paid-useful-jobs/fixtures/payment/reserved-fixture.json",
);
export const PUBLIC_CATALOG_REL = "/for-agents/useful-jobs/catalog.json";
export const PUBLIC_DISCOVERY_REL = "/discovery/useful-jobs.json";
export const PUBLIC_OUTCOMES_REL = "/for-agents/useful-jobs/jobs-outcomes.json";
export const FIRST_OFFER = "vendor-budget-impact";
export const D09_SHA = "7c55738cc5730985b709282af6c24e10f0a8442f";
export const D01_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
export const QA = Object.freeze({
  label: "owner-qa",
  customer: false,
  recruited: false,
  independentDemand: false,
  settlement: false,
});

export const PINS = JSON.parse(readFileSync(join(D25_ROOT, "PINS.json"), "utf8"));
