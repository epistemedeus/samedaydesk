import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../../..");

export const PIN = JSON.parse(readFileSync(join(MODULE_DIR, "PIN.json"), "utf8"));

export const D01_TESTED_SHA = PIN.d01.testedSha;
export const D01_REF = PIN.d01.ref;
export const D01_CLI_REL = PIN.d01.cli;

export const D03_TESTED_SHA = PIN.d03.testedSha;
export const D03_REF = PIN.d03.ref;
export const D03_PATH = PIN.d03.path;
export const D03_CLI_REL = PIN.d03.cli;

export const CATALOG_REL = PIN.catalog;
export const CATALOG_PATH = join(REPO_ROOT, CATALOG_REL);

export const RECEIPT_NAME = "receipt.json";
export const RECEIPT_SCHEMA = "samedaydesk.paid-useful-jobs.receipt.v1";
