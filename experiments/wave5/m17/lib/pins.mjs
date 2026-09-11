import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const KIT_ROOT = join(here, "..");
export const SDS_ROOT = join(KIT_ROOT, "../../..");
export const PINS = JSON.parse(readFileSync(join(KIT_ROOT, "PINS.json"), "utf8"));

export const SDS52_SHA = PINS.sds52.sha;
export const M04_SHA = PINS.m04.sha;
export const M04_CLI_REL = PINS.m04.cli;
export const SITE_ORIGIN = "https://samedaydesk.com";
export const SCHEMA_SPA = "samedaydesk.route-table.v1";
export const SCHEMA_API = "samedaydesk.api-route-table.v1";
export const SCHEMA_TRIAL = "samedaydesk.w5-m17.trial.v1";

export const QUERY_PROBE = "w5-m17-not-a-license";
