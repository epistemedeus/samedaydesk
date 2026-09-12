import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

/**
 * SDS52 extract stays on 1.0.0. Public current download is 1.1.0.
 * Do not follow client/src/data/usefulJobsKit.json for this pin.
 */
const archiveMeta = JSON.parse(
  readFileSync(
    join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.sha256.json"),
    "utf8",
  ),
);
const consumer = JSON.parse(
  readFileSync(join(OWNED_DIR, "fixtures/samedaydesk.useful-jobs-consumer.v1.json"), "utf8"),
);

if (
  consumer.enginePin.sha256 !== archiveMeta.sha256 ||
  consumer.enginePin.bytes !== archiveMeta.bytes ||
  consumer.enginePin.version !== "1.0.0"
) {
  throw new Error("D04 consumer fixture pin disagrees with useful-jobs 1.0.0 sha256.json");
}

export const USEFUL_JOBS_PACKAGE = consumer.enginePin.package;
export const USEFUL_JOBS_VERSION = consumer.enginePin.version;
export const USEFUL_JOBS_ROOT_NAME = archiveMeta.name;
export const USEFUL_JOBS_CLI = consumer.enginePin.cli;
export const USEFUL_JOBS_ARCHIVE_SHA256 = archiveMeta.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = archiveMeta.bytes;
export const USEFUL_JOBS_PURCHASE_AUTHORITY = consumer.enginePin.purchaseAuthority;
export const USEFUL_JOBS_ARCHIVE_REL = consumer.enginePin.archiveRel;
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
