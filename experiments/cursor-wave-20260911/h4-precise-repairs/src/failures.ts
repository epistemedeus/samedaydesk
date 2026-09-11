export const FIXTURE_BECOMES_SALE = Object.freeze({
  code: "fixture-becomes-sale",
  rejected: true,
  completed: false,
  saleState: "not_a_sale",
  allowedProvenance: Object.freeze(["fixture", "test"]),
  reason:
    "Fixture, SAMPLE, or --example input cannot enter provenance=customer or any paid/settled state",
});

export const LIVE_SETTLE_REFUSED = Object.freeze({
  code: "live-settle-refused",
  rejected: true,
  authorized: false,
  settleInvoked: false,
  purchaseInvoked: false,
  reason: "authorized=false canary design must not call live settle",
});

export const UNSIGNED_HINT_NOT_AUTHORITY = Object.freeze({
  code: "unsigned-hint-is-not-authority",
  rejected: true,
  signedAuthority: "payload",
  unsignedHints: Object.freeze(["resource", "extensions.bazaar"]),
  reason:
    "resource and extensions.bazaar are unsigned indexing hints; only payload carries payment-signature authority",
});

export const LIVE_PAYMENT_SURFACE_IMMUTABLE = Object.freeze({
  code: "live-payment-surface-immutable",
  rejected: true,
  livePrices: Object.freeze({
    extract: "$0.005",
    "seller-integrity-audit": "$0.01",
  }),
  verifyPaymentReassigned: false,
  settlePaymentReassigned: false,
  reason: "Must not change live prices or reassign verifyPayment / settlePayment",
});

export const MISSING_SUPPLIED_INPUT = Object.freeze({
  code: "missing-supplied-input",
  rejected: true,
  completed: false,
  required: Object.freeze(["digestSha256", "mediaType", "bytes"]),
  reason: "Completed repair requires suppliedInput digestSha256, mediaType, and bytes",
});

export const SEEDED_FAILURES = Object.freeze({
  fixtureBecomesSale: FIXTURE_BECOMES_SALE,
  liveSettleFromCanary: LIVE_SETTLE_REFUSED,
  unsignedHintAsAuthority: UNSIGNED_HINT_NOT_AUTHORITY,
  livePriceOrVerifyReassignment: LIVE_PAYMENT_SURFACE_IMMUTABLE,
  missingSuppliedInput: MISSING_SUPPLIED_INPUT,
});
