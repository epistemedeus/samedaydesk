import { CODES, HONESTY_NOTES, PACK_ID, VERIFIER } from "./rules.mjs";

const HONESTY = {
  paid: false,
  purchaseAuthority: false,
  liveTouched: false,
  liveSdsMcpUnchanged: true,
  checkoutTouched: false,
  publishAttempted: false,
  neoTouched: false,
};

export function fail(code, message, extra = {}) {
  const cls = Object.values(CODES).includes(code) ? code : CODES.USAGE;
  return {
    ok: false,
    verdict: "reject",
    pack: PACK_ID,
    verifier: VERIFIER,
    ...HONESTY,
    code: cls,
    error: String(message || cls),
    failure: {
      class: cls,
      message: String(message || cls),
      ...extra.failureExtra,
    },
    honesty: HONESTY_NOTES,
    ...extra,
  };
}

export function honestyFields() {
  return { ...HONESTY, honesty: HONESTY_NOTES };
}

export function isFailure(result) {
  return Boolean(result && result.ok === false && result.verdict === "reject");
}
