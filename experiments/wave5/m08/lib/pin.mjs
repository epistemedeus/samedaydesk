import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_ROOT = join(here, "..");
export const REPO_ROOT = join(MODULE_ROOT, "../../..");
export const PIN_PATH = join(MODULE_ROOT, "PIN.json");

export const PIN = Object.freeze(JSON.parse(readFileSync(PIN_PATH, "utf8")));

export const ENGINE_SHA = PIN.engine.sha;
export const ENGINE_PATH = PIN.engine.path;
export const ENGINE_CLI = PIN.engine.cli;
export const SITE_ORIGIN = "https://samedaydesk.com";

export const CLAIMED_SUPPORTED_FORMATS = Object.freeze([...PIN.claimedSupportedFormats]);
