/**
 * Pins for PR51 listing-repair-packet (free engine) and live SDS surfaces
 * this tool must not change. F08 paid wrappers are out of scope.
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

/** PR51 merge on SDS main (assignment pin). */
export const PR51_MERGE = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const ENGINE_JOB = "listing-repair-packet";

export const PR51_PACKAGE_ID = usefulKit.packageId;
export const PR51_VERSION = usefulKit.version;
export const PR51_ROOT_NAME = usefulKit.rootName;
export const PR51_CLI = usefulKit.cli;
export const PR51_ARCHIVE_SHA256 = usefulKit.sha256;
export const PR51_ARCHIVE_BYTES = usefulKit.bytes;
export const PR51_ARCHIVE_REL = usefulKit.archive.replace(/^\//, "");
export const PR51_ARCHIVE_PATH = join(REPO_ROOT, "client/public", PR51_ARCHIVE_REL);
export const PR51_PURCHASE_AUTHORITY = usefulKit.purchaseAuthority;
export const PR51_KIT_ARCHIVE_PATH = join(
  REPO_ROOT,
  "client/public",
  usefulKit.kitArchive.replace(/^\//, ""),
);

export const F08_OWNED_PREFIX = "server/paid-useful-jobs/";
export const WAVE1_F07_PREFIX = "packs/outside-operator-journey-harness/";

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
  "client/src/pages/Landing",
]);

export const CLOCK_ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const OK_FIXTURE_REL = "fixtures/ok.json";
export const EXAMPLE_SAMPLE_REL = "fixtures/invalid/sample-as-accepted.json";
