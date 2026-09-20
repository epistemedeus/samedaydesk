import { FAILURES, REASON, VERDICT_SCHEMA, VERIFIER } from "./constants.mjs";

export function fail(failureClass, message, extra = {}) {
  const cls = FAILURES[failureClass] ? failureClass : "usage";
  const rest = { ...extra };
  delete rest.class;
  delete rest.message;
  return {
    ok: false,
    schema: VERDICT_SCHEMA,
    verifier: VERIFIER,
    paid: false,
    purchaseAuthority: false,
    skuChange: false,
    liveSdsPricesUnchanged: true,
    checkoutTouched: false,
    publishAttempted: false,
    failure: {
      ...rest,
      class: cls,
      message: String(message || FAILURES[cls] || FAILURES.usage),
    },
    ghosts: Array.isArray(extra.ghosts) ? extra.ghosts : [],
  };
}

export function isFailure(result) {
  return Boolean(result && result.ok === false && result.failure && result.failure.class);
}

export { REASON };
