import {
  HONESTY_NOTES,
  LIVE_ASSET,
  LIVE_NETWORK,
  LIVE_PAY_TO,
  LIVE_ROUTES,
  MUTATION_BOUNDARY,
  PACK_DIR,
  SDS_REPO,
} from "./constants.mjs";

export function liveRouteRecords() {
  return Object.values(LIVE_ROUTES).map((row) => ({
    id: row.id,
    route: row.route,
    method: row.method,
    amount: row.amount,
    amountAtomic: row.amountAtomic,
    required: row.required,
    note: row.note,
  }));
}

export function honestyEnvelope(extra = {}) {
  return {
    ...extra,
    purchaseAuthority: false,
    purchaseAuthorized: false,
    rewriteAuthorized: false,
    readyForRelease: false,
    claimAuthority: "none",
    missingEvidence: "unknown",
    money: "decimal-string",
    liveSdsPricesUnchanged: true,
    paymentSent: false,
    checkoutAttempted: false,
    publishAttempted: false,
    charged: false,
    liveSdsRoutePrices: liveRouteRecords(),
    network: LIVE_NETWORK,
    asset: LIVE_ASSET,
    payTo: LIVE_PAY_TO,
    notes: [...HONESTY_NOTES],
    mutationBoundary: MUTATION_BOUNDARY,
    repo: SDS_REPO,
    pack: PACK_DIR,
    neoTouched: false,
  };
}
