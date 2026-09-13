/**
 * Exact pins for this isolated module. Do not treat later sibling branches as
 * this package's runtime. SDS52 is the current wrapper pin this outbox was
 * tested against. Historical F08 `bae3e7cd` is not an official pin. I01/Neo
 * earned-work is not copied.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { refuse } from "./errors.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const kit = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const SDS_MAIN_SHA = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const SDS52_PIN_REF = "fable/f08-paid-wrappers";
export const SDS52_PIN_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
export const F08_HISTORICAL_PIN_SHA = "bae3e7cd5034b21019fb272a99d88db964b831ee";
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

function hex64(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** Archive identity from the receipt engine. Kit constants are not a fallback pin. */
export function engineArchiveIdentity(engine = {}) {
  const sha = engine.archiveSha256;
  const bytes = engine.archiveBytes;
  if (!hex64(sha) || !Number.isInteger(bytes) || bytes < 0) {
    refuse("engine-archive-identity", "Receipt engine must bind archiveSha256 and archiveBytes; the kit pin is not invented", {
      archiveSha256: engine.archiveSha256 || null,
      archiveBytes: engine.archiveBytes ?? null,
    });
  }
  return `${sha}:${bytes}`;
}

export const CALLBACK_SCHEMA = "samedaydesk.job-delivery-outbox.callback.v1";
export const ACK_SCHEMA = "samedaydesk.job-delivery-outbox.ack.v1";
export const STORE_SCHEMA = "samedaydesk.job-delivery-outbox.store.v1";
export const TERMS_SCHEMA = "samedaydesk.job-delivery-outbox.terms.v1";
export const TERMS_MAPPING_ID = "samedaydesk.paid-useful-jobs.receipt.v1->job-delivery-outbox.terms.v1";
export const TERMS_MAPPING_VERSION = 1;

export const DELIVERY_STATES = Object.freeze(["queued", "unknown", "failed", "delivered"]);

export const LATER_BINDINGS = Object.freeze({
  resultMailbox: null,
  repeatJobBinder: null,
  paidBatchReconciler: null,
  d01ResultContract: "W5-D01 not published; consume SDS52 receipt.v1",
  earnedWorkI01: "Neo PR54 terms hash is a different schema; not imported and not forced equal",
});
