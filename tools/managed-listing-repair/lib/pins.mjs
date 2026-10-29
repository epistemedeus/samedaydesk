/**
 * Pins for the current public useful-jobs kit's listing-repair-packet job
 * and live SDS surfaces this tool must not change.
 *
 * listing-repair-packet originated in SDS PR51 (useful-jobs 1.0.0). This
 * rebase invokes the current public kit, not the frozen 1.0.0 archive.
 * The job is not reimplemented here. F08 paid wrappers are out of scope.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const usefulKit = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const CASE_SCHEMA = "samedaydesk.managed-listing-repair.case.v1";
export const EVIDENCE_SCHEMA = "samedaydesk.managed-listing-repair.evidence.v1";
export const SUGGESTION_SCHEMA = "samedaydesk.managed-listing-repair.suggestion.v1";
export const JOURNEY_SCHEMA = "samedaydesk.managed-listing-repair.journey.v1";

/** SDS PR51 merge that first published listing-repair-packet. Historical origin only. */
export const PR51_ORIGIN_MERGE = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const ENGINE_JOB = "listing-repair-packet";
export const SUPPORTED_JOIN_PROVIDERS = Object.freeze(["grexal", "agensi"]);

if (usefulKit.purchaseAuthority !== false) {
  throw new Error("useful-jobs kit purchaseAuthority must be false");
}
if (usefulKit.paidHostedClaim !== false) {
  throw new Error("useful-jobs kit paidHostedClaim must be false");
}
if (!Array.isArray(usefulKit.jobs) || !usefulKit.jobs.includes(ENGINE_JOB)) {
  throw new Error("current useful-jobs kit does not advertise listing-repair-packet");
}

export const KIT_PACKAGE_ID = usefulKit.packageId;
export const KIT_VERSION = usefulKit.version;
export const KIT_ROOT_NAME = usefulKit.rootName;
export const KIT_CLI = usefulKit.cli;
export const KIT_ARCHIVE_SHA256 = usefulKit.sha256;
export const KIT_ARCHIVE_BYTES = usefulKit.bytes;
export const KIT_ARCHIVE_REL = usefulKit.archive.replace(/^\//, "");
export const KIT_ARCHIVE_PATH = join(REPO_ROOT, "client/public", KIT_ARCHIVE_REL);
export const KIT_PURCHASE_AUTHORITY = usefulKit.purchaseAuthority;
export const KIT_PAID_HOSTED_CLAIM = usefulKit.paidHostedClaim;
export const KIT_INHERITED_JOB = Array.isArray(usefulKit.inheritedJobIds)
  ? usefulKit.inheritedJobIds.includes(ENGINE_JOB)
  : false;
export const KIT_ARCHIVE_PATH_PUBLIC = join(
  REPO_ROOT,
  "client/public",
  usefulKit.kitArchive.replace(/^\//, ""),
);

export const F08_OWNED_PREFIX = "server/paid-useful-jobs/";
export const WAVE1_F07_PREFIX = "packs/outside-operator-journey-harness/";
export const R14_VERIFIER_PREFIX = "packs/verifiers/listing-repair/";

/** Existing live offers. Do not modify these files or values from this feature. */
export const LIVE_EXTRACT_PRICE_USDC = "0.005";
export const LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC = "0.01";
export const LIVE_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";

export const LIVE_PRICE_FILES = Object.freeze([
  "fixtures/buyer-runtimes/catalog.json",
  "fixtures/presence/catalog/openapi.json",
  "client/src/pages/Mcp.tsx",
  "client/public/x402/verified.json",
  "client/public/discovery/useful-jobs.json",
  "client/src/data/usefulJobsKit.json",
]);

export const PUBLIC_CATALOG_PREFIXES = Object.freeze([
  "client/public/",
  "client/src/data/",
  "client/src/pages/",
  "data/bazaar-tracker/",
]);

export const FORBIDDEN_WRITE_PREFIXES = Object.freeze([
  F08_OWNED_PREFIX,
  WAVE1_F07_PREFIX,
  R14_VERIFIER_PREFIX,
  "client/src/pages/Landing",
]);

export const CLOCK_ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const OK_FIXTURE_REL = "fixtures/ok.json";
export const EXAMPLE_SAMPLE_REL = "fixtures/invalid/sample-as-accepted.json";
export const WRITE_BOUNDARY_PREFIX = "tools/managed-listing-repair/";
