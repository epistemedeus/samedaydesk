import { cloneJson, isPlainObject, stableJson } from "./json.mjs";

export function authorityFingerprint(paymentPayload) {
  const payload = isPlainObject(paymentPayload) ? paymentPayload : {};
  return stableJson({
    payload: payload.payload ?? null,
    accepted: payload.accepted ?? null,
  });
}

export function omitHint(paymentPayload, hint) {
  const clone = cloneJson(isPlainObject(paymentPayload) ? paymentPayload : {});
  if (hint === "resource") {
    delete clone.resource;
    return clone;
  }
  if (hint === "extensions.bazaar") {
    if (isPlainObject(clone.extensions)) {
      delete clone.extensions.bazaar;
      if (Object.keys(clone.extensions).length === 0) delete clone.extensions;
    }
    return clone;
  }
  throw new Error(`unknown hint ${hint}`);
}

export function signedPayloadUnchanged(before, after) {
  return stableJson(before?.payload ?? null) === stableJson(after?.payload ?? null);
}
