import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const TOOL_ROOT = join(here, "..");
export const REPO_ROOT = join(TOOL_ROOT, "../..");

export const USEFUL_JOBS_PACKAGE = "useful-jobs";
export const USEFUL_JOBS_VERSION = "1.0.0";
export const USEFUL_JOBS_ROOT_NAME = "useful-jobs-1.0.0";
export const USEFUL_JOBS_CLI = "bin/useful-jobs.mjs";
export const USEFUL_JOBS_ARCHIVE_REL = "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz";
export const USEFUL_JOBS_ARCHIVE_SHA256 =
  "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51";
export const USEFUL_JOBS_ARCHIVE_BYTES = 2522418;
export const USEFUL_JOBS_JOB = "listing-repair-packet";

export const SDS_MAIN_SHA = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const F18_SHA = "5e9fd3fc5e13989ef2cd45cf08f01cfe60c296cb";
export const I01_HASH_TERMS_BINDING =
  "later: Neo PR54 / fable/integration-earned-work hashTermsVersion (sha256: + 64 hex). Integer F01 termsVersion is rejected here. Earned-work kernel is not copied.";

export const CATALOG_REL = "client/public/for-agents/useful-jobs/catalog.json";
export const DISCOVERY_REL = "client/public/discovery/useful-jobs.json";
export const BUYER_STOP_REL = "fixtures/buyer-runtimes/agent402/states/stop.json";
export const BUYER_CATALOG_REL = "fixtures/buyer-runtimes/catalog.json";
export const OFFER_MATRIX_REL = "tools/offer-routing/capability-limits-matrix.json";

export const EXTRACT_ORIGIN = "https://agents.samedaydesk.com";
export const EXTRACT_EXAMPLE_URL = "https://agents.samedaydesk.com/extract?url=https://example.com";
export const EXTRACT_BATCH_PATH = "/extract/batch";
export const SELLER_INTEGRITY_PATH = "/commerce/seller-integrity-audit";

export const FORBIDDEN_HEADER_NAMES = Object.freeze(["PAYMENT-SIGNATURE", "X-PAYMENT"]);

export const PAID_PRODUCTS = Object.freeze(["extract", "extract/batch", "seller-integrity-audit"]);
