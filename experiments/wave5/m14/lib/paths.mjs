import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { REPO_ROOT } from "../../../../server/paid-useful-jobs/lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export const M14_ROOT = join(here, "..");
export { REPO_ROOT };

export const WRAPPER_CLI = join(REPO_ROOT, "server/paid-useful-jobs/bin/cli.mjs");
export const WRAPPER_INDEX = join(REPO_ROOT, "server/paid-useful-jobs/index.mjs");
export const CATALOG_PATH = join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json");
export const OUTCOMES_PATH = join(REPO_ROOT, "client/public/for-agents/useful-jobs/jobs-outcomes.json");
export const PIN_PATH = join(M14_ROOT, "PIN.json");
export const PREVIEW_CLI = join(M14_ROOT, "bin/preview.mjs");

export const PREVIEW_SCHEMA = "samedaydesk.wave5.m14.result-preview.v1";
export const QUICKSTART_SCHEMA = "samedaydesk.wave5.m14.machine-quickstart.v1";
export const CHOOSE_SCHEMA = "samedaydesk.wave5.m14.choose.v1";

export function loadPin() {
  return JSON.parse(readFileSync(PIN_PATH, "utf8"));
}

export function loadCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

export function loadOutcomes() {
  return JSON.parse(readFileSync(OUTCOMES_PATH, "utf8"));
}
