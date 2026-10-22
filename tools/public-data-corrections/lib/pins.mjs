import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = join(here, "..");
export const REPO_ROOT = join(here, "..", "..", "..");

export const WAVE_ID = "W3-14";
export const FEATURE_ID = "H03";
export const SCHEMA = "samedaydesk.public-data-correction.v1";

export const RIGHTS = Object.freeze(["cleared", "unknown", "forbidden"]);

export const PUBLIC_HOST = "samedaydesk.com";
export const PUBLIC_PATH_PREFIXES = Object.freeze([
  "/for-agents/",
  "/discovery/",
  "/kit/",
  "/guides/",
]);
export const PUBLIC_EXACT_PATHS = Object.freeze(["/llms.txt"]);

export const MAX_PACKET_BYTES = 256 * 1024;

export const RFC3339_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

export const CODES = Object.freeze({
  ACCEPTED: "accepted",
  PRIVATE_DATA: "private-data",
  PRIVATE_DATA_FLAG_REQUIRED: "private-data-flag-required",
  UNKNOWN_RIGHTS_LABELLED_CLEARED: "unknown-rights-labelled-cleared",
  SAMPLE_AS_CUSTOMER_OWNED: "sample-as-customer-owned",
  AUTO_PUBLISH: "auto-publish",
  INVENTED_PAYING_RIGHTS_HOLDER: "invented-paying-rights-holder",
  UNKNOWN_RIGHTS_CANNOT_PUBLISH: "unknown-rights-cannot-publish",
  FORBIDDEN_RIGHTS: "forbidden-rights",
  INVALID_RIGHTS: "invalid-rights",
  MISSING_RIGHTS: "missing-rights",
  MISSING_CITATION: "missing-citation",
  CITATION_NOT_PUBLIC: "citation-not-public",
  DIGEST_MISMATCH: "digest-mismatch",
  H3_NEO_OUT_OF_DIRECTORY: "h3-neo-out-of-directory",
  INPUT_MALFORMED: "input-malformed",
  INPUT_OVERSIZE: "input-oversize",
  REMOTE_SCRAPE_FORBIDDEN: "remote-scrape-forbidden",
  MISSING_CORRECTION: "missing-correction",
  MISSING_DOCUMENT: "missing-document",
  UNSUPPORTED_SCHEMA: "unsupported-schema",
  PRIVATE_PROBE_NOT_REJECTED: "private-data-probe-not-rejected",
  FIXTURE_REQUIRED: "fixture-required",
});
