/**
 * SDS price-drift verifier pins.
 *
 * Own directory only: packs/verifiers/price-drift/
 * Records live SameDayDesk x402 amounts. Does not rewrite them.
 * Does not touch neomorphic-io, checkout, payment, or publish.
 */

export const PACK_ID = "price-drift";
export const PACK_DIR = "packs/verifiers/price-drift";
export const SDS_REPO = "epistemedeus/samedaydesk";

export const PIN_SCHEMA = "samedaydesk.price-drift.pin.v1";
export const OBSERVATION_SCHEMA = "samedaydesk.price-drift.observation.v1";
export const RESULT_SCHEMA = "samedaydesk.price-drift.result.v1";

/** USDC on Base. Six decimals. Atomic 5000 = 0.005 USDC. */
export const USDC_DECIMALS = 6;
export const LIVE_NETWORK = "eip155:8453";
export const LIVE_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const LIVE_PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
export const LIVE_CURRENCY = "USDC";
export const LIVE_ORIGIN = "https://agents.samedaydesk.com";

/**
 * Recorded live SDS route prices. This pack compares observations against
 * these pins. It never writes catalog, well-known, or server/pricing.js.
 */
export const LIVE_ROUTES = Object.freeze({
  extract: Object.freeze({
    id: "extract",
    aliases: Object.freeze(["extract", "extractUrl", "/extract"]),
    route: "/extract",
    method: "GET",
    amount: "0.005",
    amountAtomic: "5000",
    required: true,
    note: "Live SDS extract unpaid 402. Recorded, not rewritten.",
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
    method: "GET",
    amount: "0.01",
    amountAtomic: "10000",
    required: true,
    note: "Live SDS seller-integrity-audit unpaid 402. Recorded, not rewritten.",
  }),
  read: Object.freeze({
    id: "read",
    aliases: Object.freeze(["read", "/read"]),
    route: "/read",
    method: "GET",
    amount: "0.005",
    amountAtomic: "5000",
    required: false,
    note: "Committed catalog /read unpaid 402. Recorded, not rewritten.",
  }),
  "payment-offer-preflight": Object.freeze({
    id: "payment-offer-preflight",
    aliases: Object.freeze([
      "payment-offer-preflight",
      "/commerce/payment-offer-preflight",
    ]),
    route: "/commerce/payment-offer-preflight",
    method: "GET",
    amount: "0.005",
    amountAtomic: "5000",
    required: false,
    note: "Committed catalog payment-offer-preflight unpaid 402. Recorded, not rewritten.",
  }),
});

export const REQUIRED_ROUTE_IDS = Object.freeze(
  Object.values(LIVE_ROUTES)
    .filter((row) => row.required)
    .map((row) => row.id),
);

export const SAMPLE_MARKERS = Object.freeze([
  "SAMPLE",
  "labelled_sample",
  "labeled_sample",
  "labelled_fixture",
  "explicit-example",
  "--example",
]);

export const FORBIDDEN_FLAGS = Object.freeze([
  "live",
  "publish",
  "checkout",
  "pay",
  "payment",
  "settle",
  "prepare",
  "write",
  "deploy",
  "sku-write",
  "edit-prices",
]);

export const ERROR_CODES = Object.freeze({
  MISSING_REQUIRED_INPUTS: "missing_required_inputs",
  INVALID_JSON: "invalid_json",
  FLOAT_MONEY: "float_money",
  NONCANONICAL_MONEY: "noncanonical_money",
  ATOMIC_DECIMAL_MISMATCH: "atomic_decimal_mismatch",
  AMOUNT_DRIFT: "amount_drift",
  NETWORK_DRIFT: "network_drift",
  ASSET_DRIFT: "asset_drift",
  PAYTO_DRIFT: "payto_drift",
  MISSING_REQUIRED_ROUTE: "missing_required_route",
  EXTRA_SKU: "extra_sku",
  EDIT_LIVE_PRICES: "edit_live_prices",
  PURCHASE_AUTHORITY: "purchase_authority",
  LIVE_HTTP_REFUSED: "live_http_refused",
  PUBLISH_ATTEMPTED: "publish_attempted",
  CHECKOUT_ATTEMPTED: "checkout_attempted",
  PAYMENT_ATTEMPTED: "payment_attempted",
  SAMPLE_AS_LIVE: "sample_as_live",
  FORBIDDEN_CLAIM: "forbidden_claim",
  HTTP_402_AS_SUCCESS: "http_402_as_success",
  WRONG_UNITS: "wrong_units",
});

export const HONESTY_NOTES = Object.freeze([
  "This pack records live SDS extract $0.005 and seller-integrity-audit $0.01. It does not rewrite them.",
  "Decimal-string money only. JS numbers / IEEE-754 floats are not money.",
  "Atomic 5000 is 0.005 USDC, not 5000 dollars.",
  "HTTP 402 is an unpaid paywall, never success or a paid observation.",
  "SAMPLE / labelled fixtures are not live catalog writes.",
  "purchaseAuthority is always false. No checkout, payment, publish, or SKU edit.",
  "Missing pin evidence stays unknown. Drift is reported, not repaired.",
  "readyForRelease stays false. Cold fixture run only.",
]);

export const MUTATION_BOUNDARY =
  "Write boundary packs/verifiers/price-drift/** only. No neo, no publish, no payment, no checkout, no live SDS price change.";

export const MAX_INPUT_BYTES = 1_048_576;
