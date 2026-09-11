/**
 * Pins for W3-13 H02 vendor price/API feed.
 * Engine is PR51 vendor-budget price facts as fixtures (subject, not F14 Pilot brief).
 * Live SDS catalog prices are read-only.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const kit = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const FEATURE_ID = "W3-13-H02";
export const FEATURE_DIR = "tools/vendor-price-feed";

export const ENGINE_JOB_ID = "vendor-budget-impact";
export const ENGINE_SUBJECT = "pr51-vendor-budget-price-facts";
export const ENGINE_NOT = "F14 Pilot brief";

export const USEFUL_JOBS_PACKAGE = kit.packageId;
export const USEFUL_JOBS_VERSION = kit.version;
export const USEFUL_JOBS_ARCHIVE_SHA256 = kit.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = kit.bytes;
export const USEFUL_JOBS_PURCHASE_AUTHORITY = kit.purchaseAuthority;
export const USEFUL_JOBS_ARCHIVE_REL = `client/public${kit.archive}`;
export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, USEFUL_JOBS_ARCHIVE_REL);
export const PR51_MERGE = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";

/** PR51 vendor-budget samples/pricing units. Exact match required. */
export const ALLOWED_UNITS = Object.freeze([
  "USD/1M-tokens",
  "USD/1K-images",
  "USD/1K-queries",
]);

/**
 * Case-changed unit from PR51 samples/pricing/a/after.json (grok-4.6-input).
 * Vendor-budget treats this as a unit change; this feed refuses it as wrong units.
 */
export const WRONG_UNIT_FROM_ENGINE_AFTER = "USD/1M-Tokens";

export const ENGINE_FIELD = "gpt-4.1-input";
export const ENGINE_AMOUNT_DECIMAL = "2.0";
export const ENGINE_UNIT = "USD/1M-tokens";
export const ENGINE_FACT_PATH_IN_ARCHIVE = "samples/pricing/a/before.json";

export const OK_SOURCE_URL =
  "https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz#samples/pricing/a/before.json?field=gpt-4.1-input";

export const PROVENANCE = Object.freeze(["fixture", "test", "upstream"]);

/** Existing live offers. This feed must not change these files or values. */
export const LIVE_EXTRACT_PRICE_USDC = "0.005";
export const LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC = "0.01";
export const LIVE_EXTRACT_ATOMIC = "5000";
export const LIVE_SELLER_INTEGRITY_AUDIT_ATOMIC = "10000";
export const LIVE_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";

export const LIVE_PRICE_FILES = Object.freeze([
  "client/src/pages/Mcp.tsx",
  "fixtures/buyer-runtimes/catalog.json",
  "client/public/x402/verified.json",
  "client/public/discovery/useful-jobs.json",
]);

export const LIVE_SDS_SOURCE_MARKERS = Object.freeze([
  "agents.samedaydesk.com/extract",
  "agents.samedaydesk.com/commerce/seller-integrity-audit",
  "seller-integrity-audit",
  "client/src/pages/mcp.tsx",
  "fixtures/buyer-runtimes/catalog.json",
  "client/public/x402/verified.json",
]);

export const OBSERVATION_FIELDS = Object.freeze([
  "sourceUrl",
  "observedAt",
  "unit",
  "amount",
  "effectiveDate",
  "priorObservationId",
  "provenance",
]);

export const STORE_FILENAME = "observations.json";

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function engineArchivePin() {
  if (!existsSync(USEFUL_JOBS_ARCHIVE_PATH)) {
    return { ok: false, error: "PR51 useful-jobs archive missing" };
  }
  const bytes = statSync(USEFUL_JOBS_ARCHIVE_PATH).size;
  const sha256 = sha256File(USEFUL_JOBS_ARCHIVE_PATH);
  return {
    ok: bytes === USEFUL_JOBS_ARCHIVE_BYTES && sha256 === USEFUL_JOBS_ARCHIVE_SHA256,
    bytes,
    sha256,
    path: USEFUL_JOBS_ARCHIVE_REL,
    purchaseAuthority: USEFUL_JOBS_PURCHASE_AUTHORITY,
  };
}

export function liveFileSnapshot() {
  const files = {};
  for (const rel of LIVE_PRICE_FILES) {
    const path = join(REPO_ROOT, rel);
    files[rel] = {
      exists: existsSync(path),
      sha256: existsSync(path) ? sha256File(path) : null,
    };
  }
  return files;
}
