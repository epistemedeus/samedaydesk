import { FAILURES, REASON } from "./constants.mjs";

export function fail(failureClass, message, extra = {}) {
  const cls = FAILURES[failureClass] ? failureClass : "usage";
  return {
    ok: false,
    verifier: "sku-ghost",
    paid: false,
    purchaseAuthority: false,
    skuChange: false,
    liveSdsPricesUnchanged: true,
    checkoutTouched: false,
    publishAttempted: false,
    failure: {
      class: cls,
      message: String(message || FAILURES[cls] || FAILURES.usage),
      ...extra,
    },
    ghosts: extra.ghosts || [],
  };
}

export function isFailure(result) {
  return Boolean(result && result.ok === false && result.failure && result.failure.class);
}

export { REASON };
