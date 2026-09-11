/**
 * Frozen merchant PR54 indexing-continuity rules, encoded as presence-only
 * diagnostics. This pack does not install ResourceServer hooks and does not
 * copy the merchant module into SDS.
 *
 * Pin: epistemedeus/x402-url-extractor @ a143898dd1ec35c097ca7eb0b472f30dad1ee319
 * Module (read-only, merchant repo): indexing-payload-continuity.mjs
 */

export const MERCHANT_PIN = "a143898dd1ec35c097ca7eb0b472f30dad1ee319";
export const MERCHANT_REPO = "epistemedeus/x402-url-extractor";
export const MERCHANT_MODULE = "indexing-payload-continuity.mjs";
export const MERCHANT_PR = 54;

export const BAZAAR_INDEX_FIELDS = Object.freeze(["resource", "extensions.bazaar"]);
export const BAZAAR_INDEX_PATHS = Object.freeze([
  "paymentPayload.resource",
  "paymentPayload.extensions.bazaar",
]);
export const NOT_BAZAAR_INDEX = Object.freeze(["paymentRequirements"]);
export const SIGNED_AUTHORITY = "payload";
export const UNSIGNED_HINTS = Object.freeze(["resource", "extensions.bazaar"]);

export const LIVE_PRICES = Object.freeze({
  extract: Object.freeze({
    route: "/extract",
    display: "$0.005",
    amountAtomic: "5000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: "eip155:8453",
  }),
  "seller-integrity-audit": Object.freeze({
    route: "/commerce/seller-integrity-audit",
    display: "$0.01",
    amountAtomic: "10000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: "eip155:8453",
  }),
});

export const PR54_RULES = Object.freeze({
  merchantPin: MERCHANT_PIN,
  merchantRepo: MERCHANT_REPO,
  merchantModule: MERCHANT_MODULE,
  merchantPr: MERCHANT_PR,
  bazaarIndexes: BAZAAR_INDEX_PATHS,
  bazaarIndexFields: BAZAAR_INDEX_FIELDS,
  doesNotIndex: NOT_BAZAAR_INDEX,
  signedAuthority: SIGNED_AUTHORITY,
  unsignedHints: UNSIGNED_HINTS,
  neverAbortVerifySettleForHintMismatch: true,
  fillOmittedRouteOwnedHintsDoesNotChangeSignedAuthority: true,
  installLiveResourceServerHooks: false,
  reassignVerifyOrSettle: false,
  presenceOnlyDiagnostics: true,
});

export const DEFAULT_REQUIREMENTS = Object.freeze({
  scheme: "exact",
  network: "eip155:8453",
});
