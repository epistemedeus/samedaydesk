import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const kit = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const SDS_MAIN_PIN = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const CURRENT_RUNTIME_PIN = "c6f1464222169f2d32247c978dc5007d82a2aa03";
export const CURRENT_ARCHIVE_PIN = "8a811bbadba7edc6c926b319b0839cd2f01e5896";
export const CURRENT_CATALOG_VERSION = "1.4.3";
export const SCHEMA_LEDGER = "samedaydesk.buyer-value-ledger.v1";
export const SCHEMA_ROW = "samedaydesk.buyer-value-ledger.row.v1";

export const USEFUL_JOBS_PACKAGE = kit.packageId;
export const USEFUL_JOBS_VERSION = kit.version;
export const USEFUL_JOBS_ROOT_NAME = kit.rootName;
export const USEFUL_JOBS_CLI = kit.cli;
export const USEFUL_JOBS_ARCHIVE_SHA256 = kit.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = kit.bytes;
export const USEFUL_JOBS_ARCHIVE_REL = kit.archive.replace(/^\//, "");
export const USEFUL_JOBS_ARCHIVE_PATH = join(
  REPO_ROOT,
  "client/public",
  USEFUL_JOBS_ARCHIVE_REL,
);
export const USEFUL_JOBS_CATALOG_PATH = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/catalog.json",
);
export const USEFUL_JOBS_PURCHASE_AUTHORITY = kit.purchaseAuthority === true;
export const USEFUL_JOBS_SOURCE_COMMIT = kit.sourceCommit;
export const USEFUL_JOBS_ARCHIVE_FREEZE = kit.archiveFreeze;

/** Evidence-records closed settlement buyer classes. Not this module's run labels. */
export const SETTLEMENT_BUYER_CLASSES = Object.freeze([
  "independent",
  "owner",
  "sponsored",
  "unknown",
]);

/** Labelled useful-job run classes. Required on every request. Never inferred. */
export const RUN_BUYER_CLASSES = Object.freeze(["owner-qa", "fixture-buyer", "unknown"]);

export const PROHIBITED_INFERENCES = Object.freeze([
  "analytics_count_is_independent_demand",
  "catalog_presence_is_demand",
  "cross_source_join_without_exact_key",
]);

/** Banked seller-ledger observation. Not this job's revenue. */
export const CITED_BANKED_USDC = "8.105";
export const EARLY_X402_OPERATION_ID = "early-x402-revenue";
export const EARLY_X402_AMOUNT_USDC = "0.040";

/** F10 proposed Pilot portfolio envelope. Not a posted offer and not this job's price. */
export const PROPOSED_ENVELOPE_USDC = "2";

export const I01_OWNER = "Neo PR54 fable/integration-earned-work";
export const I01_PIN_NOTE =
  "Neo PR54 819fa637 owns earned-work core; this checkout does not attach that repo. Hash terms follow published S275 crypto.hashRequest (stable JSON SHA-256).";
export const S275_HASH_TERMS_PIN = "5de66179a551a76c7ea6be5a0de8a6918ca3c528";
export const S275_HASH_TERMS_PATH = "services/earned-work/src/crypto.ts";

export const EVIDENCE_RECORDS_LIB = join(REPO_ROOT, "tools/evidence-records/lib.mjs");
export const SETTLEMENT_FIXTURE_EARLY_X402 = join(
  REPO_ROOT,
  "tools/evidence-records/fixtures/settlements/early-x402-revenue.json",
);

export const ERROR_CODES = Object.freeze({
  MISSING_BUYER_CLASS: "missing_buyer_class",
  UNKNOWN_BUYER_CLASS: "unknown_buyer_class",
  FIXTURE_BUYER_IS_NOT_INDEPENDENT: "fixture_buyer_is_not_independent",
  INDEPENDENT_DEMAND_PROHIBITED: "analytics_count_is_independent_demand",
  ORGANIC_DEMAND_PROHIBITED: "organic_demand_prohibited",
  SETTLEMENT_IS_NOT_JOB_REVENUE: "settlement_is_not_job_revenue",
  CITED_BANKED_USDC_IS_NOT_JOB_REVENUE: "cited_banked_usdc_is_not_job_revenue",
  MISSING_REQUIRED_INPUTS: "missing_required_inputs",
  UNKNOWN_JOB: "unknown_job",
  UNKNOWN_COMMAND: "unknown_command",
  JOIN_WITHOUT_EXACT_OPERATION_ID: "cross_source_join_without_exact_key",
  ARCHIVE_PIN_MISMATCH: "archive_pin_mismatch",
  ENGINE_SPAWN_FAILED: "engine_spawn_failed",
  UNRELATED_PAYMENT: "unrelated_or_unbound_payment",
});
