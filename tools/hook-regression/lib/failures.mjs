export const UNSIGNED_HINT_NOT_AUTHORITY = Object.freeze({
  code: "unsigned-hint-is-not-authority",
  rejected: true,
  signedAuthority: "payload",
  unsignedHints: Object.freeze(["resource", "extensions.bazaar"]),
  reason:
    "resource and extensions.bazaar are unsigned indexing hints; only payload carries payment-signature authority",
});

export const REWRITE_PAYLOAD_TO_FIX_DISCOVERY = Object.freeze({
  code: "rewrite-payload-to-fix-discovery",
  rejected: true,
  signedAuthority: "payload",
  mutatedSignedPayload: false,
  reason:
    "Discovery-hint repair must not rewrite paymentPayload.payload; filling omitted route-owned hints is unsigned and must leave signed authority unchanged",
});

export const INSTALL_LIVE_HOOKS = Object.freeze({
  code: "install-live-resource-server-hooks",
  rejected: true,
  installLiveHooks: false,
  onBeforeVerify: false,
  onBeforeSettle: false,
  reason:
    "G02 asserts PR54 hook rules in fixtures; it must not install live ResourceServer onBeforeVerify/onBeforeSettle hooks",
});

export const CHANGE_LIVE_PRICES = Object.freeze({
  code: "change-live-prices",
  rejected: true,
  livePrices: Object.freeze({
    extract: "$0.005",
    "seller-integrity-audit": "$0.01",
  }),
  verifyPaymentReassigned: false,
  settlePaymentReassigned: false,
  reason: "Must not change live prices or reassign verifyPayment / settlePayment",
});

export const EDIT_H4_DIRECTORY = Object.freeze({
  code: "edit-h4-directory",
  rejected: true,
  ownedBy: "H4",
  path: "experiments/cursor-wave-20260911/h4-precise-repairs/",
  reason: "H4 owns experiments/cursor-wave-20260911/h4-precise-repairs/; G02 may import, never edit",
});

export const SEEDED_FAILURES = Object.freeze({
  unsignedHintAsAuthority: UNSIGNED_HINT_NOT_AUTHORITY,
  rewritePayloadToFixDiscovery: REWRITE_PAYLOAD_TO_FIX_DISCOVERY,
  installLiveHooks: INSTALL_LIVE_HOOKS,
  changeLivePrices: CHANGE_LIVE_PRICES,
  editH4Directory: EDIT_H4_DIRECTORY,
});

export const ATTEMPT_TO_FAILURE = Object.freeze({
  "unsigned-hint-as-authority": UNSIGNED_HINT_NOT_AUTHORITY,
  "rewrite-payload-to-fix-discovery": REWRITE_PAYLOAD_TO_FIX_DISCOVERY,
  "install-live-resource-server-hooks": INSTALL_LIVE_HOOKS,
  "change-live-prices": CHANGE_LIVE_PRICES,
  "edit-h4-directory": EDIT_H4_DIRECTORY,
});
