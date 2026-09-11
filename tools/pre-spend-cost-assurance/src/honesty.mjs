import {
  B04_PACK,
  B04_REPO,
  F08_DIR,
  HONESTY_NOTES,
  LIVE_EXTRACT_ATOMIC,
  LIVE_EXTRACT_PRICE_USDC,
  LIVE_NETWORK,
  LIVE_ROUTES,
  LIVE_SELLER_INTEGRITY_AUDIT_ATOMIC,
  LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
  MUTATION_BOUNDARY,
  SDS_PR51_COMMIT,
} from "./pins.mjs";

export function honestyEnvelope(extra = {}) {
  return {
    purchaseAuthorized: false,
    purchaseAuthority: false,
    readyForRelease: false,
    claimAuthority: "none",
    missingEvidence: "unknown",
    money: "decimal-string",
    liveSdsPricesUnchanged: true,
    liveSdsRoutePrices: [
      {
        route: "extract",
        amount: LIVE_EXTRACT_PRICE_USDC,
        amountAtomic: LIVE_EXTRACT_ATOMIC,
        note: LIVE_ROUTES.extract.note,
      },
      {
        route: "seller-integrity-audit",
        amount: LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
        amountAtomic: LIVE_SELLER_INTEGRITY_AUDIT_ATOMIC,
        note: LIVE_ROUTES["seller-integrity-audit"].note,
      },
    ],
    network: LIVE_NETWORK,
    notes: [...HONESTY_NOTES],
    mutationBoundary: MUTATION_BOUNDARY,
    b04: { repo: B04_REPO, pack: B04_PACK },
    f08: { directory: F08_DIR, rewritten: false },
    sdsCommit: SDS_PR51_COMMIT,
    settleCalled: false,
    prepareCalled: false,
    ...extra,
  };
}
