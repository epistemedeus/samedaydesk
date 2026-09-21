export const PRODUCT = "samedaydesk-receipt-forge-w823";
export const PACK = "w823-receipt-forge";
export const SCHEMA_VERSION = "samedaydesk.receipt-forge.claim.v1";
export const CATALOG_SCHEMA_VERSION = "samedaydesk.receipt-forge.catalog.v1";
export const SEEDED_FAILURE = "forged-digest";
export const SEEDED_CODE = "receipt_forged";
export const EXTRACT_AMOUNT = "5000";

export const SDS_PIN = Object.freeze({
  origin: "https://agents.samedaydesk.com",
  scheme: "exact",
  network: "eip155:8453",
  payTo: "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
});

export const KNOWN_SETTLEMENT = Object.freeze({
  transaction: "0x2916cfe2c5200fca2a21f8b854fe963ef70d4ed90d59c7444cef16dd21056ef7",
  operationId: "agent402-external-validation-purchase-2026-08-29",
  amountUsdc: "0.010",
  boundReceiptId: "agent402-external-validation-purchase-2026-08-29",
  boundResource: "https://agents.samedaydesk.com/commerce/seller-integrity-audit",
  boundRoute: "/commerce/seller-integrity-audit",
  facilitatorOrPayoutRef: "x402_v2_coinbase_cdp",
});

export const SPENT_RECEIPT_ID = "cr_spent_replay_w823";

export const COMMITTED = Object.freeze({
  x402Catalog: "fixtures/presence/catalog/x402.json",
  extractObservation: "fixtures/verified-feed/observations/extract-current.json",
  settlement: "tools/evidence-records/fixtures/settlements/agent402-external-validation-purchase-2026-08-29.json",
  buyerStop: "fixtures/buyer-runtimes/coinbase-x402/states/stop.json",
});

export const KINDS = Object.freeze([
  "unpaid_payment_required",
  "unpaid_offer",
  "unpaid_probe",
  "unpaid_buyer_stop",
]);

export const HTTP_CHALLENGE_KINDS = Object.freeze([
  "unpaid_payment_required",
  "unpaid_offer",
  "unpaid_probe",
]);

export const COMPLETENESS = Object.freeze(["complete", "sampled", "truncated", "unknown"]);

export const AUTHORITY_CLASSES = Object.freeze([
  "seller_observed",
  "provider_returned",
]);

export const SOURCE_KINDS = Object.freeze([
  "live_unpaid_402",
  "buyer_runtime_fixture",
  "catalog_x402",
  "lqdist1_followup_probe",
]);

export const REQUIRED_JOIN_KEYS = Object.freeze(["receipt_id", "resource", "amount", "pay_to"]);

export const REQUIRED_PROHIBITED_INFERENCES = Object.freeze([
  "receipt_forged",
  "copied_settlement",
  "fabricated_settlement",
  "receipt_replay",
  "payment_header_forge",
  "http_402_is_delivery",
]);

export const PROHIBITED_INFERENCES = Object.freeze([
  ...REQUIRED_PROHIBITED_INFERENCES,
  "offer_is_settlement",
  "paid_as_unpaid",
]);

export const REFUSED_FLAGS = Object.freeze([
  "live",
  "pay",
  "checkout",
  "publish",
  "registry",
  "refresh",
  "settle",
  "neo",
  "payment",
]);

export const PAYMENT_HEADER_RE = /^(PAYMENT-SIGNATURE|X-PAYMENT|X-PAYMENT-RESPONSE|PAYMENT-RESPONSE)$/i;

export const RECEIPT_ID_RE = /^[a-z][a-z0-9_-]{2,95}$/;
export const TOKEN_RE = /^[a-z][a-z0-9_]{1,95}$/;
export const UNKNOWN_RE = /^[\x20-\x7E]{1,160}$/;
export const SURFACE_RE = /^[\x20-\x7E]{1,400}$/;
export const ROUTE_RE = /^\/[^?#]*$/;
export const AMOUNT_RE = /^[1-9][0-9]{0,20}$/;
export const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
export const TX_RE = /^0x[a-f0-9]{64}$/;
export const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
export const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
export const RESOURCE_PREFIX = "https://agents.samedaydesk.com/";

export const HTTP_METHODS = Object.freeze(["GET", "POST"]);

export const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "claimId",
  "receiptId",
  "kind",
  "statusClass",
  "origin",
  "resource",
  "route",
  "method",
  "httpStatus",
  "charged",
  "paymentSent",
  "observedAt",
  "completeness",
  "authorityClass",
  "request",
  "accepts",
  "offerReceipt",
  "settlement",
  "joinKeys",
  "source",
  "unknownWhenAbsent",
  "prohibitedInferences",
  "integrity",
]);

export const INTEGRITY_KEYS = Object.freeze(["alg", "claimedDigest"]);
export const REQUEST_KEYS = Object.freeze(["method", "url", "headers"]);
export const ACCEPT_KEYS = Object.freeze([
  "scheme",
  "network",
  "amount",
  "asset",
  "payTo",
  "maxTimeoutSeconds",
  "extra",
]);
export const EXTRA_KEYS = Object.freeze(["name", "version", "verifyingContract"]);
export const SOURCE_KEYS = Object.freeze(["kind", "capturedAt", "path", "note"]);
export const SETTLEMENT_KEYS = Object.freeze([
  "operationId",
  "amountUsdc",
  "transaction",
  "facilitatorOrPayoutRef",
]);
export const OFFER_RECEIPT_KEYS = Object.freeze(["offers", "receipt"]);
export const OFFER_KEYS = Object.freeze(["format", "acceptIndex", "payload"]);
export const PAYLOAD_KEYS = Object.freeze([
  "version",
  "resourceUrl",
  "scheme",
  "network",
  "asset",
  "payTo",
  "amount",
]);

export const FORBIDDEN_KEYS = Object.freeze(["__proto__", "prototype", "constructor"]);
