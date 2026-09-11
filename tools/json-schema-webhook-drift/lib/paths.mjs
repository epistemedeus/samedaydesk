import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = path.resolve(HERE, "..");
export const FIXTURES_ROOT = path.join(MODULE_ROOT, "fixtures");
export const BIN_PATH = path.join(MODULE_ROOT, "bin", "webhook-drift.mjs");

export const SCHEMA = "samedaydesk.json-schema-webhook-drift.v1";
export const SCHEMA_VERSION = 2;
export const OUTPUT_JSON = "drift-brief.json";
export const OUTPUT_MD = "drift-brief.md";
export const APP_ID = "json-schema-webhook-drift";
export const NOT_OPENAPI = true;
export const NOT_API_UPGRADE_BRIEF = true;
