/** SDS HTTP 402 amount matrix pin (w1041). Write only this pack. */

export const FEATURE = "w1041-402-matrix";
export const PACK = "w1041-402-matrix";
export const WAVE = "w1041";
export const MATRIX_SCHEMA_VERSION = "samedaydesk.w1041-402-matrix.v1";
export const RECORD_SCHEMA_VERSION = "samedaydesk.w1041-402-matrix.unpaid.v1";

export const PIN = Object.freeze({
  origin: "https://agents.samedaydesk.com",
  originHost: "agents.samedaydesk.com",
  scheme: "exact",
  network: "eip155:8453",
  payTo: "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  decimals: 6,
  assetSymbol: "USDC",
  x402Version: 2,
  catalogLastUpdated: 1788454976,
  catalogItemCount: 23,
  uniqueAmountCount: 8,
});

export const IN_TREE = Object.freeze({
  catalog: "fixtures/presence/catalog/x402.json",
  openapi: "fixtures/presence/catalog/openapi.json",
  bazaar: "fixtures/presence/listings/bazaar-merchant.json",
  meta: "fixtures/presence/meta.json",
});

/** Compact route pin: method+route → catalog atomic amount. */
export const EXPECTED_ROUTES = Object.freeze([
  Object.freeze({ route: "/extract", method: "GET", amountAtomic: "5000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/read", method: "GET", amountAtomic: "5000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/scan", method: "GET", amountAtomic: "200000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/schemaforge", method: "GET", amountAtomic: "250000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/enrich", method: "GET", amountAtomic: "50000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/wallet-enrich", method: "GET", amountAtomic: "50000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/deep-audit", method: "GET", amountAtomic: "250000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/defi/morpho-position", method: "GET", amountAtomic: "20000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/defi/morpho-protection", method: "GET", amountAtomic: "100000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/defi/morpho-market-underwrite", method: "GET", amountAtomic: "250000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/defi/morpho-preliquidation-replay", method: "GET", amountAtomic: "100000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/work/opportunity-preflight", method: "GET", amountAtomic: "50000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/distribution/agent-discoverability-audit", method: "GET", amountAtomic: "50000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/commerce/payment-offer-preflight", method: "GET", amountAtomic: "5000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/commerce/settlement-proof", method: "GET", amountAtomic: "5000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/chain/transaction-receipt", method: "GET", amountAtomic: "2000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/chain/solana-transaction-receipt", method: "GET", amountAtomic: "2000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/security/wallet-policy-conformance", method: "POST", amountAtomic: "10000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/security/stateful-wallet-policy-conformance", method: "POST", amountAtomic: "10000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/commerce/seller-integrity-audit", method: "GET", amountAtomic: "10000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/commerce/contract-qualified-search", method: "GET", amountAtomic: "10000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({ route: "/distribution/agent-surface-budget-audit", method: "GET", amountAtomic: "10000", extraName: "USD Coin", maxTimeoutSeconds: 300 }),
  Object.freeze({
    route: "/gateway/commerce/payment-offer-preflight",
    method: "GET",
    amountAtomic: "5000",
    extraName: "GatewayWalletBatched",
    maxTimeoutSeconds: 604900,
  }),
]);

export const UNIQUE_AMOUNTS = Object.freeze([
  Object.freeze({ amountAtomic: "2000", amountDisplayUsd: "0.002", routeCount: 2 }),
  Object.freeze({ amountAtomic: "5000", amountDisplayUsd: "0.005", routeCount: 5 }),
  Object.freeze({ amountAtomic: "10000", amountDisplayUsd: "0.01", routeCount: 5 }),
  Object.freeze({ amountAtomic: "20000", amountDisplayUsd: "0.02", routeCount: 1 }),
  Object.freeze({ amountAtomic: "50000", amountDisplayUsd: "0.05", routeCount: 4 }),
  Object.freeze({ amountAtomic: "100000", amountDisplayUsd: "0.1", routeCount: 2 }),
  Object.freeze({ amountAtomic: "200000", amountDisplayUsd: "0.2", routeCount: 1 }),
  Object.freeze({ amountAtomic: "250000", amountDisplayUsd: "0.25", routeCount: 3 }),
]);

export const KNOWN_STALE_LISTINGS = Object.freeze([
  Object.freeze({
    id: "stale-listed-amount",
    surface: "bazaar",
    host: "agents.samedaydesk.com",
    route: "/read",
    method: "GET",
    listedAmountAtomic: "50000",
    catalogAmountAtomic: "5000",
    listedAmountDisplayUsd: "0.05",
    catalogAmountDisplayUsd: "0.005",
    note: "Bazaar listed origin /read amount 50000 vs catalog 5000.",
  }),
  Object.freeze({
    id: "stale-alias-extract",
    surface: "bazaar",
    host: "x402-url-extractor-production.up.railway.app",
    route: "/extract",
    method: "GET",
    listedAmountAtomic: "50000",
    catalogAmountAtomic: "5000",
    listedAmountDisplayUsd: "0.05",
    catalogAmountDisplayUsd: "0.005",
    note: "Bazaar Railway alias /extract listed 50000 vs origin catalog 5000.",
  }),
]);

export const SEEDED_FAILURE = "stale-listed-amount";

export const SEEDED = Object.freeze({
  "stale-listed-amount": Object.freeze({
    id: "stale-listed-amount",
    file: "seeded/stale-listed-amount.json",
    code: "stale_listed_amount",
    naiveRule: "statusClass-unpaid",
  }),
  "wrong-units": Object.freeze({
    id: "wrong-units",
    file: "seeded/wrong-units-5000-as-dollars.json",
    code: "wrong_units",
    naiveRule: "statusClass-unpaid",
  }),
  "paid-as-unpaid": Object.freeze({
    id: "paid-as-unpaid",
    file: "seeded/paid-as-unpaid.json",
    code: "paid_as_unpaid",
    naiveRule: "statusClass-unpaid",
  }),
  "http-200-as-unpaid": Object.freeze({
    id: "http-200-as-unpaid",
    file: "seeded/http-200-as-unpaid.json",
    code: "paid_as_unpaid",
    naiveRule: "statusClass-unpaid",
  }),
  "extract-amount-drift": Object.freeze({
    id: "extract-amount-drift",
    file: "seeded/extract-amount-drift.json",
    code: "amount_mismatch",
    naiveRule: "statusClass-unpaid",
  }),
  "live-price-edit": Object.freeze({
    id: "live-price-edit",
    file: "seeded/live-price-edit.json",
    code: "live_price_edit",
    naiveRule: "statusClass-unpaid",
  }),
});

export const PROHIBITED_INFERENCES = Object.freeze([
  "paid_as_unpaid",
  "stale_listed_amount_is_catalog",
  "atomic_is_display_usd",
  "http_402_is_delivery",
  "amount_mismatch_is_unpaid_match",
]);

export const W7_CITE = Object.freeze({
  pr: 179,
  branch: "heavy/w0-x140",
  pack: "tools/commerce-receipts/amount-matrix-w7",
  note: "cite-only W7 unpaid amount-matrix; this pack is the verify-sds 402 matrix. Do not edit that tree.",
});
