/**
 * Exact pins for this isolated module. Do not treat later sibling branches as
 * this package's runtime. F08 is read-only; I01/Neo earned-work is not copied.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const kit = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const SDS_MAIN_SHA = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const F08_PIN_REF = "fable/f08-paid-wrappers";
export const F08_PIN_SHA = "bae3e7cd5034b21019fb272a99d88db964b831ee";
export const F08_RECEIPT_SCHEMA = "samedaydesk.paid-useful-jobs.receipt.v1";
export const F08_FUNDING_STATES = Object.freeze(["unfunded", "reserved-fixture", "rejected"]);

export const USEFUL_JOBS_PACKAGE = kit.packageId;
export const USEFUL_JOBS_VERSION = kit.version;
export const USEFUL_JOBS_CLI = kit.cli;
export const USEFUL_JOBS_ROOT_NAME = kit.rootName;
export const USEFUL_JOBS_ARCHIVE_SHA256 = kit.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = kit.bytes;
export const USEFUL_JOBS_ARCHIVE_REL = String(kit.archive).replace(/^\//, "");
export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, "client/public", USEFUL_JOBS_ARCHIVE_REL);
export const USEFUL_JOBS_PURCHASE_AUTHORITY = kit.purchaseAuthority === true;

/** I01/W4-I02 archive identity: sha+bytes, not the version string. */
export function engineArchiveIdentity(engine = {}) {
  const sha = engine.archiveSha256 || USEFUL_JOBS_ARCHIVE_SHA256;
  const bytes = engine.archiveBytes ?? USEFUL_JOBS_ARCHIVE_BYTES;
  return `${sha}:${bytes}`;
}

export const CALLBACK_SCHEMA = "samedaydesk.job-delivery-outbox.callback.v1";
export const ACK_SCHEMA = "samedaydesk.job-delivery-outbox.ack.v1";
export const STORE_SCHEMA = "samedaydesk.job-delivery-outbox.store.v1";
export const TERMS_SCHEMA = "samedaydesk.job-delivery-outbox.terms.v1";

export const DELIVERY_STATES = Object.freeze(["queued", "unknown", "failed", "delivered"]);

export const LATER_BINDINGS = Object.freeze({
  resultMailbox: null,
  repeatJobBinder: null,
  paidBatchReconciler: null,
  earnedWorkI01: "Neo PR54 / services/earned-work termsVersion + canonical terms hash; not imported here",
});
