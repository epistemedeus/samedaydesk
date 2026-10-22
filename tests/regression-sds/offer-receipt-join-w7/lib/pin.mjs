/** SDS offer-receipt join pin (W7). Cite committed catalog + buyer-runtime contract. */

export const FEATURE = "offer-receipt-join-w7";

export const JOIN_SCHEMA = "samedaydesk.offer-receipt-join.w7.v1";

export const ORIGIN = "https://agents.samedaydesk.com";
export const NETWORK = "eip155:8453";
export const SCHEME = "exact";
export const ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const PAY_TO = "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee";
export const EXTRACT_AMOUNT = "5000";
export const READ_AMOUNT = "5000";
export const SCAN_AMOUNT = "200000";
export const EXTRACT_ROUTE = `${ORIGIN}/extract`;
export const READ_ROUTE = `${ORIGIN}/read`;
export const SCAN_ROUTE = `${ORIGIN}/scan`;
export const EXTRACT_DIGEST =
  "04c1554d7a4471803f05781245df70cb0ae3dc73b9df78c555c7324c3b1ca60e";

export const LIVE_PAYLOAD_KEYS = Object.freeze([
  "version",
  "resourceUrl",
  "scheme",
  "network",
  "asset",
  "payTo",
  "amount",
  "validUntil",
]);

export const EXACT_JOIN_KEYS = Object.freeze([
  "origin_pathname",
  "amount",
  "network",
  "asset",
  "scheme",
  "payTo",
]);

export const INVENTED_FIELDS = Object.freeze([
  "loyaltyPoints",
  "throughBlock",
  "buyerEmail",
  "npsScore",
  "tipAmount",
  "uniqueVisitors",
  "paidCustomers",
]);

export const BOUNDARY = Object.freeze({
  paymentSent: false,
  stripeOrX402: false,
  neoPublish: false,
  liveFetch: false,
  write: "tests/regression-sds/offer-receipt-join-w7/**",
});

export const PRINCIPLE = Object.freeze({
  id: "offer-receipt-exact-join",
  statement:
    "An SDS catalog/402 accept joins an unsigned offer-receipt payload only on exact keys (origin+pathname, amount string, network, asset, scheme, payTo). A join is not settlement. Amounts are never unit-converted.",
});

export const SEEDED_MISMATCH_ID = "amount-mismatch";
