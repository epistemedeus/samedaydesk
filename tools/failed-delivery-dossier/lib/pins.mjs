/**
 * W4-commerce-06 pins. Own directory only.
 * F08 receipt shape is pinned read-only. Checkout and extract fixtures are
 * copied from published SDS main. I01 owns earned-work termsVersion hashes.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

export const DOSSIER_SCHEMA = "samedaydesk.failed-delivery-dossier.v1";
export const WRAPPER_RECEIPT_SCHEMA = "samedaydesk.paid-useful-jobs.receipt.v1";

export const SDS_REPO = "epistemedeus/samedaydesk";
export const SDS_MAIN_SHA = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const F08_REPO = "epistemedeus/samedaydesk";
export const F08_REF = "fable/f08-paid-wrappers";
export const F08_SHA = "bae3e7cd5034b21019fb272a99d88db964b831ee";
export const F08_RECEIPT_PATH = "server/paid-useful-jobs/lib/receipt.mjs";
export const F08_SEEDED_PATH = "server/paid-useful-jobs/test/seeded-failures.test.mjs";
export const F08_DIR = "server/paid-useful-jobs/";

export const CHECKOUT_TEST_PATH = "server/scripts/test-checkout-http-lifecycle.js";
export const FULFILL_PATH = "server/lib/fulfill.js";
export const AGENT402_STOP_PATH = "fixtures/buyer-runtimes/agent402/states/stop.json";
export const EXTRACT_CATALOG_PATH = "fixtures/buyer-runtimes/catalog.json";
export const EVIDENCE_SETTLEMENT_PATH =
  "tools/evidence-records/fixtures/settlements/agent402-external-validation-purchase-2026-08-29.json";

/** I01 Neo PR54 content-hash terms. Integer termsVersion is invalid_input there. */
export const I01_REPO = "epistemedeus/neomorphic-io";
export const I01_PR = "https://github.com/epistemedeus/neomorphic-io/pull/54";
export const I01_HEAD = "819fa637ecf5e5177c84efc16fcaa18d57017631";
export const I01_TERMS_VERSION_RE = /^sha256:[0-9a-f]{64}$/;
export const I01_GOLDEN_TERMS_VERSION =
  "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f";

export const SOURCE_KINDS = Object.freeze(["wrapper-receipt", "checkout-intake", "extract-unpaid"]);

export const BUYER_CLASSES = Object.freeze(["independent", "owner", "sponsored", "unknown"]);

export const FUNDING_STATES_PACKABLE = Object.freeze(["rejected", "unfunded"]);

export const LIVE_EXTRACT_PRICE_USDC = "0.005";
export const LIVE_EXTRACT_ATOMIC = "5000";
export const LIVE_NETWORK = "eip155:8453";
export const LIVE_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";

export const MAX_INPUT_BYTES = 1_048_576;

export const ERROR_CODES = Object.freeze({
  MISSING_REQUIRED_INPUTS: "missing_required_inputs",
  INVALID_JSON: "invalid_json",
  UNKNOWN_SOURCE_KIND: "unknown_source_kind",
  SAMPLE_LABELLED_DELIVERED: "sample_labelled_delivered",
  BUYERCLASS_REVENUE_MIX: "buyerclass_revenue_mix",
  REFUND_REFUSED: "refund_refused",
  RETRY_PAYMENT_REFUSED: "retry_payment_refused",
  PAYMENT_SIGNATURE_REFUSED: "payment_signature_refused",
  STRIPE_CALL_REFUSED: "stripe_call_refused",
  INTEGER_TERMS_VERSION: "integer_terms_version",
  NOT_FAILED_DELIVERY: "not_failed_delivery",
  WRAPPER_SHAPE: "wrapper_receipt_shape",
  CHECKOUT_SHAPE: "checkout_intake_shape",
  EXTRACT_SHAPE: "extract_unpaid_shape",
  SOLD_CLAIM: "sold_claim_refused",
});

export const MUTATION_BOUNDARY =
  "Read-only packer. Feature-branch tool only. No refund, payment retry, Stripe call, PAYMENT-SIGNATURE, deploy, or live settlement.";
