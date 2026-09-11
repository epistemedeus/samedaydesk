import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const kit = JSON.parse(readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"));

export const USEFUL_JOBS_PACKAGE = kit.packageId;
export const USEFUL_JOBS_VERSION = kit.version;
export const USEFUL_JOBS_ROOT_NAME = kit.rootName;
export const USEFUL_JOBS_CLI = kit.cli;
export const USEFUL_JOBS_ARCHIVE_SHA256 = kit.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = kit.bytes;
export const USEFUL_JOBS_PURCHASE_AUTHORITY = kit.purchaseAuthority;
export const USEFUL_JOBS_ARCHIVE_REL = `client/public${kit.archive}`;
export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, USEFUL_JOBS_ARCHIVE_REL);
export const USEFUL_JOBS_CATALOG_PATH = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/catalog.json",
);
export const USEFUL_JOBS_OUTCOMES_PATH = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/jobs-outcomes.json",
);
export const DISCOVERY_PATH = join(REPO_ROOT, "client/public/discovery/useful-jobs.json");

/** Live merchant prices this module must not change. Not this offer. */
export const LIVE_EXTRACT_PRICE_USDC = "0.005";
export const LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC = "0.01";
export const MAX_INPUT_BYTES = 1_048_576;
export const CONSUMER_CONTRACT_SCHEMA = "samedaydesk.useful-jobs-consumer.v1";
export const ORDER_TERMS_SCHEMA = "samedaydesk.useful-jobs-order-terms.v1";

export function loadPins() {
  return {
    package: USEFUL_JOBS_PACKAGE,
    version: USEFUL_JOBS_VERSION,
    rootName: USEFUL_JOBS_ROOT_NAME,
    cli: USEFUL_JOBS_CLI,
    archiveSha256: USEFUL_JOBS_ARCHIVE_SHA256,
    archiveBytes: USEFUL_JOBS_ARCHIVE_BYTES,
    purchaseAuthority: USEFUL_JOBS_PURCHASE_AUTHORITY,
    archivePath: USEFUL_JOBS_ARCHIVE_PATH,
    catalogPath: USEFUL_JOBS_CATALOG_PATH,
    outcomesPath: USEFUL_JOBS_OUTCOMES_PATH,
    discoveryPath: DISCOVERY_PATH,
  };
}
