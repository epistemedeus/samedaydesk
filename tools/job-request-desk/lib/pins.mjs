import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const kit = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const USEFUL_JOBS_PACKAGE = kit.packageId;
export const USEFUL_JOBS_VERSION = kit.version;
export const USEFUL_JOBS_ROOT_NAME = kit.rootName;
export const USEFUL_JOBS_CLI = kit.cli;
export const USEFUL_JOBS_ARCHIVE_SHA256 = kit.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = kit.bytes;
export const USEFUL_JOBS_PURCHASE_AUTHORITY = kit.purchaseAuthority === true;
export const USEFUL_JOBS_ARCHIVE_REL = "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz";
export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, USEFUL_JOBS_ARCHIVE_REL);
export const CATALOG_PATH = join(REPO_ROOT, "client/public/for-agents/useful-jobs/catalog.json");
export const OUTCOMES_PATH = join(REPO_ROOT, "client/public/for-agents/useful-jobs/jobs-outcomes.json");

export const TICKET_SCHEMA = "samedaydesk.job-request-desk.ticket.v1";
export const TERMS_SCHEMA = "samedaydesk.job-request-desk.terms.v1";
export const SCHEMA_VERSION = 1;
export const STATUSES = Object.freeze(["queued", "running", "completed", "rejected", "sample"]);
export const REQUEST_ID_RE = /^[0-9a-f]{64}$/;
export const MAX_INPUT_BYTES = 1_048_576;

export const I01_HASHER_PIN = "819fa637ecf5e5177c84efc16fcaa18d57017631";
export const I01_GOLDEN_TERMS_VERSION =
  "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f";
export const F08_FIXTURE_PIN = "bae3e7cd5034b21019fb272a99d88db964b831ee";
export const SDS_MAIN_PIN = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const SDS52_PIN = "aeef964fa188443078958d9d6d393afae1d542ee";
export const CONSUMER_CONTRACT_PIN = "c621646897e6fe1dccf0e5993aea63b5bc1f6bd3";

export function enginePin() {
  return {
    package: USEFUL_JOBS_PACKAGE,
    version: USEFUL_JOBS_VERSION,
    sha256: USEFUL_JOBS_ARCHIVE_SHA256,
    bytes: USEFUL_JOBS_ARCHIVE_BYTES,
    cli: USEFUL_JOBS_CLI,
    purchaseAuthority: false,
    schedulerDaemon: false,
  };
}
