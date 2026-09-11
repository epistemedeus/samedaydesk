/**
 * W3-10 / E06 pins. Own directory only.
 * Live SDS extract $0.005 and seller-integrity-audit $0.01 are recorded, not changed.
 * F08 owns server/paid-useful-jobs/. B04 money is imported or fixtured.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED_DIR = join(here, "..");
export const REPO_ROOT = join(here, "../../..");

export const SCHEMA = "samedaydesk.pre-spend-cost-assurance.plan.v1";
export const JOURNEY_SCHEMA = "samedaydesk.pre-spend-cost-assurance.journey.v1";
export const RESULT_SCHEMA = "samedaydesk.pre-spend-cost-assurance.result.v1";

export const SDS_PR51_COMMIT = "5b97d1b02e786acd1895cfa1508087ae3f7a1545";
export const SDS_REPO = "epistemedeus/samedaydesk";
export const B04_PACK = "packs/price-arithmetic-verifier";
export const B04_REPO = "epistemedeus/neomorphic-io";
export const F08_DIR = "server/paid-useful-jobs/";

/** USDC on Base. Six decimals. Atomic 5000 = $0.005, atomic 10000 = $0.01. */
export const USDC_DECIMALS = 6;
export const LIVE_NETWORK = "eip155:8453";
export const LIVE_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const LIVE_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";

export const LIVE_ROUTES = Object.freeze({
  extract: Object.freeze({
    id: "extract",
    aliases: Object.freeze(["extract", "extractUrl", "/extract"]),
    route: "/extract",
    amount: "0.005",
    amountAtomic: "5000",
    note: "Live SDS extract unpaid 402. Not changed by this tool.",
  }),
  "seller-integrity-audit": Object.freeze({
    id: "seller-integrity-audit",
    aliases: Object.freeze([
      "seller-integrity-audit",
      "seller_integrity_audit",
      "integrity-audit",
      "auditSellerIntegrity",
      "/commerce/seller-integrity-audit",
    ]),
    route: "/commerce/seller-integrity-audit",
    amount: "0.01",
    amountAtomic: "10000",
    note: "Live SDS seller-integrity-audit unpaid 402. Not changed by this tool.",
  }),
});

export const LIVE_EXTRACT_PRICE_USDC = LIVE_ROUTES.extract.amount;
export const LIVE_EXTRACT_ATOMIC = LIVE_ROUTES.extract.amountAtomic;
export const LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC = LIVE_ROUTES["seller-integrity-audit"].amount;
export const LIVE_SELLER_INTEGRITY_AUDIT_ATOMIC = LIVE_ROUTES["seller-integrity-audit"].amountAtomic;

export const JOURNEY_CAP = "0.015";
export const JOURNEY_CAP_ATOMIC = "15000";

export const SAMPLE_MARKERS = Object.freeze([
  "SAMPLE",
  "labelled_sample",
  "labeled_sample",
  "labelled_fixture",
  "explicit-example",
  "--example",
]);

export const SETTLE_PREPARE_NAMES = Object.freeze([
  "settle",
  "settlePayment",
  "prepare",
  "preparePayment",
  "createPaymentPayload",
  "verifyAndSettle",
]);

export const PAYMENT_POST_HINTS = Object.freeze([
  "/settle",
  "/prepare",
  "/pay",
  "/x402/settle",
  "/facilitator/settle",
  "settlePayment",
  "preparePayment",
]);

export const ERROR_CODES = Object.freeze({
  MISSING_REQUIRED_INPUTS: "missing_required_inputs",
  INVALID_JSON: "invalid_json",
  FLOAT_MONEY: "float_money",
  DEFAULT_PURCHASE: "default_purchase",
  WRONG_UNITS: "wrong_units",
  HTTP_402_AS_SUCCESS: "http_402_as_success",
  SAMPLE_AS_PAID_ASSURANCE: "sample_as_paid_assurance",
  EDIT_LIVE_PRICES: "edit_live_prices",
  POST_PAYMENT: "post_payment",
  INVALID_DELIVERY_SPEND: "invalid_delivery_spend",
  SETTLE_REFUSED: "settle_refused",
  PREPARE_REFUSED: "prepare_refused",
  B04_IMPORT_MISSING: "b04_import_missing",
});

export const HONESTY_NOTES = Object.freeze([
  "purchaseAuthorized is always false in this assignment. Assurance is not a purchase.",
  "Decimal-string money via B04 import shape. Atomic 5000 is 0.005 USDC, not 5000 dollars.",
  "HTTP 402 is an unpaid paywall, never success or paid assurance.",
  "SAMPLE / labelled fixtures are not paid assurance.",
  "This tool does not change live SDS extract $0.005 or seller-integrity-audit $0.01.",
  "Invalid or failed delivery is not a reason to spend.",
  "settle / prepare are refused. F08 owns paid wrappers — not rewritten here.",
  "readyForRelease stays false. No deploy, payment, account, chain, queue, or secrets.",
]);

export const MUTATION_BOUNDARY =
  "Feature-branch tool only. No public release, payment, deploy, live SDS price change, or F08 rewrite.";

export const MAX_INPUT_BYTES = 1_048_576;
