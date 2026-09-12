/**
 * Pins for the in-repo useful-jobs engines (PR51 archive) and live prices
 * this wrapper must not change. Fixture wrapper prices are labelled non-live.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const archiveMeta = JSON.parse(
  readFileSync(
    join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.sha256.json"),
    "utf8",
  ),
);

/** SDS52 / PR51 wrapper extract stays on 1.0.0. Current public download is 1.1.0. */
export const USEFUL_JOBS_PACKAGE = "useful-jobs";
export const USEFUL_JOBS_VERSION = "1.0.0";
export const USEFUL_JOBS_ROOT_NAME = archiveMeta.name;
export const USEFUL_JOBS_CLI = "bin/useful-jobs.mjs";
export const USEFUL_JOBS_ARCHIVE_SHA256 = archiveMeta.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = archiveMeta.bytes;
export const USEFUL_JOBS_PURCHASE_AUTHORITY = false;
export const USEFUL_JOBS_ARCHIVE_REL = "for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz";
export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, "client/public", USEFUL_JOBS_ARCHIVE_REL);
export const USEFUL_JOBS_SOURCE_REPO = "epistemedeus/pilot";
export const USEFUL_JOBS_SOURCE_COMMIT = archiveMeta.sourceCommit;
export const USEFUL_JOBS_ARCHIVE_FREEZE = archiveMeta.archiveFreeze;
export const USEFUL_JOBS_REVIEWED_SOURCE = "318130daaf19490e2f8af7c23131b42fe20e6cde";
export const USEFUL_JOBS_NODE = ">=22";

/** Existing live offers. Do not modify these files or values from this feature. */
export const LIVE_EXTRACT_PRICE_USDC = "0.005";
export const LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC = "0.01";
export const LIVE_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
export const LIVE_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const LIVE_NETWORK = "eip155:8453";

/** Merchant continuity reference (read-only; SDS has no ResourceServer). */
export const MERCHANT_CONTINUITY_COMMIT = "a143898dd1ec35c097ca7eb0b472f30dad1ee319";
export const MERCHANT_CONTINUITY_MODULE = "indexing-payload-continuity.mjs";

/**
 * Canonical public origin for declared indexing hints.
 * These paths are not published to the live catalog.
 */
export const DECLARED_PUBLIC_ORIGIN = "https://samedaydesk.com";
export const DECLARED_PATH_PREFIX = "/paid-useful-jobs";

/** Per-input size cap (matches SDS express.json 1mb). */
export const MAX_INPUT_BYTES = 1_048_576;

/**
 * Non-live labelled fixture prices. Not a catalog publication.
 * Deliberately not 0.005 / 0.01 so they cannot be confused with live extract / SIA.
 */
export const FIXTURE_PRICE_USDC = "0.02";
export const FIXTURE_PRICE_ATOMIC = "20000";
export const FIXTURE_PAY_TO = "0x0000000000000000000000000000000000000F08";
