/**
 * Pins for the paid-batch ledger. Live catalog prices are read-only.
 * Fixture amounts match F08 labelled non-live 0.02 USDC and are not published.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

const kit = JSON.parse(
  readFileSync(join(REPO_ROOT, "client/src/data/usefulJobsKit.json"), "utf8"),
);

export const USEFUL_JOBS_PACKAGE = kit.packageId;
export const USEFUL_JOBS_VERSION = kit.version;
export const USEFUL_JOBS_ROOT_NAME = kit.rootName;
export const USEFUL_JOBS_CLI = kit.cli;
export const USEFUL_JOBS_ARCHIVE_SHA256 = kit.sha256;
export const USEFUL_JOBS_ARCHIVE_BYTES = kit.bytes;
export const USEFUL_JOBS_PURCHASE_AUTHORITY = kit.purchaseAuthority;
export const USEFUL_JOBS_ARCHIVE_REL = kit.archive.replace(/^\//, "");
export const USEFUL_JOBS_ARCHIVE_PATH = join(REPO_ROOT, "client/public", USEFUL_JOBS_ARCHIVE_REL);
export const USEFUL_JOBS_CATALOG_PATH = join(
  REPO_ROOT,
  "client/public/for-agents/useful-jobs/catalog.json",
);

export const SDS_MAIN_SHA = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const F08_PIN_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";
export const CURRENT_RUNTIME_PIN = "c6f1464222169f2d32247c978dc5007d82a2aa03";
export const CURRENT_ARCHIVE_PIN = "e9528c3b1195f5ab5d388b73465c31bd422f5d3d";
export const PREVIOUS_ARCHIVE_PIN_143 = "8a811bbadba7edc6c926b319b0839cd2f01e5896";
export const F08_PIN_REF = "codex/vendor-temp-lifecycle-20260912";
export const F08_PIN_PR = 52;
export const FALLBACK_RUNNERS = Object.freeze(["useful-jobs", "engines", "local-engine"]);
export const KNOWN_RUNNERS = Object.freeze(["paid-useful-jobs", "f08", `paid-useful-jobs@${CURRENT_RUNTIME_PIN}`, `paid-useful-jobs@${F08_PIN_SHA}`]);
export const I01_NEO_PR = 54;
export const I01_NEO_SHA = "819fa637ecf5e5177c84efc16fcaa18d57017631";
export const I01_GOLDEN_TERMS_VERSION =
  "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f";

export const LIVE_EXTRACT_PRICE_USDC = "0.005";
export const LIVE_EXTRACT_PRICE_ATOMIC = "5000";
export const LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC = "0.01";
export const LIVE_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
export const LIVE_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const LIVE_NETWORK = "eip155:8453";

export const FIXTURE_PRICE_USDC = "0.02";
export const FIXTURE_PRICE_ATOMIC = "20000";
export const FIXTURE_PAY_TO = "0x0000000000000000000000000000000000000F08";

export const MAX_INPUT_BYTES = 1_048_576;

export const LEDGER_SCHEMA = "samedaydesk.paid-batch-reconciler.ledger.v1";
export const REQUEST_SCHEMA = "samedaydesk.paid-batch-reconciler.request.v1";
export const TERMS_SCHEMA = "samedaydesk.paid-batch-reconciler.terms.v1";
export const TERMS_SHAPE_VERSION = 1;

export const FUNDING_STATES = Object.freeze(["unfunded", "reserved-fixture", "rejected"]);
export const OUTCOMES = Object.freeze(["completed", "rejected"]);
export const BATCH_STATUSES = Object.freeze(["completed", "partial", "rejected"]);

export const LIVE_CATALOG_PATHS = Object.freeze([
  "fixtures/buyer-runtimes/catalog.json",
  "client/src/pages/Mcp.tsx",
  "fixtures/presence/catalog/openapi.json",
  "server/pricing.js",
]);
