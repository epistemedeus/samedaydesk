import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODULE_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

export const PIN = JSON.parse(readFileSync(join(MODULE_DIR, "PIN.json"), "utf8"));

export function producerSha(cwd = REPO_ROOT) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  return String(r.stdout || "").trim() || PIN.producer.testedSha;
}

export const F08_NAMED_SHA = PIN.f08.namedSha;
export const F08_HISTORICAL_SHA = PIN.f08.historicalSha;
export const F08_TESTED_SHA = producerSha();
export const F08_REF = PIN.producer.ref;
export const F08_CLI_REL = PIN.producer.cli;

export const CATALOG_REL = PIN.catalog;
export const KIT_REL = PIN.kit;
export const CATALOG_PATH = join(REPO_ROOT, CATALOG_REL);
export const KIT_PATH = join(REPO_ROOT, KIT_REL);

export const RECEIPT_SCHEMA = "samedaydesk.paid-useful-jobs.receipt.v1";
export const IDENTITY_SCHEMA = "samedaydesk.job-output-atomicity.identity.v1";
export const RECEIPT_NAME = "receipt.json";

export const USEFUL_JOBS_ARCHIVE_SHA256 = PIN.archive.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = PIN.archive.bytes;
