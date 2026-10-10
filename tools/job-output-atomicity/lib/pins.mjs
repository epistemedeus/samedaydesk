import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

export const PIN = JSON.parse(readFileSync(join(MODULE_DIR, "PIN.json"), "utf8"));

export const F08_NAMED_SHA = PIN.f08.namedSha;
export const F08_TESTED_SHA = PIN.f08.testedSha;
export const F08_REF = PIN.f08.ref;
export const F08_CLI_REL = PIN.f08.cli;

export const CATALOG_REL = PIN.catalog;
export const KIT_REL = PIN.kit;
export const CATALOG_PATH = join(REPO_ROOT, CATALOG_REL);
export const KIT_PATH = join(REPO_ROOT, KIT_REL);

export const RECEIPT_SCHEMA = "samedaydesk.paid-useful-jobs.receipt.v1";
export const IDENTITY_SCHEMA = "samedaydesk.job-output-atomicity.identity.v1";
export const RECEIPT_NAME = "receipt.json";

export const USEFUL_JOBS_ARCHIVE_SHA256 = PIN.archive.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = PIN.archive.bytes;
