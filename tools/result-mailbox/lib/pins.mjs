import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const archiveMeta = JSON.parse(
  readFileSync(
    join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.sha256.json"),
    "utf8",
  ),
);

/** SDS52 extract stays on 1.0.0. Public current download is useful-jobs 1.1.0. */
export const USEFUL_JOBS_PACKAGE = "useful-jobs";
export const USEFUL_JOBS_VERSION = "1.0.0";
export const USEFUL_JOBS_ROOT_NAME = archiveMeta.name;
export const USEFUL_JOBS_CLI = "bin/useful-jobs.mjs";
export const USEFUL_JOBS_ARCHIVE_SHA256 = archiveMeta.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = archiveMeta.bytes;
export const USEFUL_JOBS_PURCHASE_AUTHORITY = false;
export const USEFUL_JOBS_ARCHIVE_REL = "for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz";
export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, "client/public", USEFUL_JOBS_ARCHIVE_REL);
export const USEFUL_JOBS_CATALOG_PATH = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/catalog.json",
);

export const ENVELOPE_SCHEMA = "samedaydesk.result-mailbox.envelope.v1";
export const PICKUP_SCHEMA = "samedaydesk.result-mailbox.pickup.v1";
export const ACK_SCHEMA = "samedaydesk.result-mailbox.ack.v1";
export const MAILBOX_TERMS_SCHEMA = "samedaydesk.result-mailbox.terms.v1";
export const SCHEMA_VERSION = 1;
export const I01_HASHER_PIN = "819fa637ecf5e5177c84efc16fcaa18d57017631";
export const I01_HASHER_PR = 54;
export const F08_PIN = "bae3e7cd5034b21019fb272a99d88db964b831ee";
export const D01_EXECUTION_CONTRACT = "samedaydesk.paid-useful-jobs.execution.v1";
export const D01_RECEIPT_SCHEMA = "samedaydesk.paid-useful-jobs.receipt.v1";
export function d01ReceiptPin() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" });
  return String(r.stdout || "").trim();
}
export const D01_RECEIPT_PIN = d01ReceiptPin();
export const D01_RECEIPT_PR = 74;
export const STARTING_REF = "baf09dc591c83aec94e0cf42c5c64076fc5b98e3";

export const REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
export const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
export const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export const DEFAULT_TTL_SECONDS = 86400;
export const MAX_ARTIFACT_BYTES = 1_048_576;
export const MAX_ENVELOPE_BYTES = 1_048_576;
export const ENGINE_TIMEOUT_MS = 120_000;

export const VENDOR_BUDGET_OUTPUTS = Object.freeze(["budget-impact.json", "budget-impact.md"]);

export function kitEngineProvenance() {
  return {
    package: USEFUL_JOBS_PACKAGE,
    version: USEFUL_JOBS_VERSION,
    cli: USEFUL_JOBS_CLI,
    archiveSha256: USEFUL_JOBS_ARCHIVE_SHA256,
    archiveBytes: USEFUL_JOBS_ARCHIVE_BYTES,
    purchaseAuthority: USEFUL_JOBS_PURCHASE_AUTHORITY,
  };
}
