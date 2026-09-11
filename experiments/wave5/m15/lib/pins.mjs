import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const KIT_ROOT = join(HERE, "..");
export const PINS_PATH = join(KIT_ROOT, "PINS.json");

export function loadPins() {
  return JSON.parse(readFileSync(PINS_PATH, "utf8"));
}

export const TRIAL_SCHEMA = "samedaydesk.wave5.m15.schema-change-trial.v1";
export const TRIAL_SCHEMA_VERSION = 1;
export const REPORT_JSON = "trial-report.json";
export const ENGINE_TREE_PATH = "tools/json-schema-webhook-drift";
export const ENGINE_BIN_REL = "bin/webhook-drift.mjs";
export const ENGINE_OUTPUTS = Object.freeze(["drift-brief.json", "drift-brief.md"]);
