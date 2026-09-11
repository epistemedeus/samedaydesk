/**
 * Pins for PR50 consumer-repeat evidence packages and live SDS prices
 * this tool must not change. Vendor-budget is an optional PR51 input class.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const pr50Receipt = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/public/kit/s178-consumer-repeat-archive.sha256.json"), "utf8"),
);
const usefulKit = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const CASE_SCHEMA = "samedaydesk.consumer-evidence-refresh.case.v1";
export const BUNDLE_SCHEMA = "samedaydesk.consumer-evidence-refresh.bundle.v1";

/** PR50 merge on SDS main (assignment pin). */
export const PR50_MERGE = "5913534f7a850c8346e5f95b912a3eb3777d3517";
export const PR50_PACKAGE_ID = pr50Receipt.packageId;
export const PR50_ARCHIVE_REL = `kit/${pr50Receipt.archive}`;
export const PR50_ARCHIVE_PATH = join(REPO_ROOT, "client/public", PR50_ARCHIVE_REL);
export const PR50_ARCHIVE_BYTES = pr50Receipt.bytes;
export const PR50_ARCHIVE_SHA256 = pr50Receipt.sha256;
export const PR50_ROOT_NAME = "s178-consumer-repeat-kit";
export const PR50_CLI = "bin/s178-cli.mjs";
export const PR50_RESULT_SCHEMA = "s178.consumer-repeat.result.v1";

export const PR51_PACKAGE_ID = usefulKit.packageId;
export const PR51_VERSION = usefulKit.version;
export const PR51_ROOT_NAME = usefulKit.rootName;
export const PR51_CLI = usefulKit.cli;
export const PR51_ARCHIVE_SHA256 = usefulKit.sha256;
export const PR51_ARCHIVE_BYTES = usefulKit.bytes;
export const PR51_ARCHIVE_REL = usefulKit.archive.replace(/^\//, "");
export const PR51_ARCHIVE_PATH = join(REPO_ROOT, "client/public", PR51_ARCHIVE_REL);
export const PR51_PURCHASE_AUTHORITY = usefulKit.purchaseAuthority;
export const VENDOR_BUDGET_JOB = "vendor-budget-impact";

export const PR50_JOBS = Object.freeze([
  "migration-checklist",
  "release-brief",
  "table-reconcile",
  "link-index",
  "replay-pack",
  "freshness-receipt",
  "procurement-brief",
  "customer-result-package",
  "acquisition-status",
]);

export const COMPLETENESS = Object.freeze(["complete", "sampled", "truncated", "unknown"]);
export const FRESHNESS_STATUS = Object.freeze(["current", "stale", "unknown"]);

export const REQUIRED_PROHIBITED_INFERENCES = Object.freeze([
  "cross_source_join_without_exact_key",
  "sum_across_authority_classes",
  "organic_label_for_controlled_or_incentivized_traffic",
  "collapsed_provider_scope",
  "local_observation_is_provider_billing",
]);

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
  "client/public/discovery/consumer-repeat.json",
]);

export const PUBLIC_CATALOG_PREFIXES = Object.freeze([
  "client/public/",
  "client/src/data/",
  "tools/evidence-records/catalog.json",
  "tools/evidence-records/fixtures/",
]);

export const CLOCK_ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const EXAMPLE_CASE_REL = "fixtures/example-sample.json";
export const CUSTOMER_CASE_REL = "fixtures/customer-owned-redacted.json";
