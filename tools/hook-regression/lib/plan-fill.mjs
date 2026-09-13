import { cloneJson, isPlainObject } from "./json.mjs";
import { authorityFingerprint, signedPayloadUnchanged } from "./authority.mjs";
import { REWRITE_PAYLOAD_TO_FIX_DISCOVERY } from "./failures.mjs";

const BAZAAR_KEY = "bazaar";

/**
 * Diagnostic-only plan: fill omitted route-owned indexing hints on a clone.
 * Never mutates the caller's payload. Never installs hooks. Never declines payment.
 */
export function planOmittedHintFill(paymentPayload, declared = {}) {
  const original = isPlainObject(paymentPayload) ? paymentPayload : {};
  const clone = cloneJson(original);
  const patches = {};
  const provenance = {
    resource: "skipped",
    bazaar: "skipped",
    untouchedAuthority: true,
    declinedPayment: false,
  };

  const declaredResource = declared?.resource;
  const declaredExtensions = isPlainObject(declared?.extensions) ? declared.extensions : null;
  const declaredBazaar =
    declaredExtensions && Object.prototype.hasOwnProperty.call(declaredExtensions, BAZAAR_KEY)
      ? declaredExtensions[BAZAAR_KEY]
      : undefined;

  if (!("resource" in clone) || clone.resource === undefined || clone.resource === null) {
    if (isPlainObject(declaredResource) && typeof declaredResource.url === "string" && declaredResource.url) {
      patches.resource = cloneJson(declaredResource);
      provenance.resource = "filled";
    } else {
      provenance.resource = "absent_no_declared";
    }
  } else if (!isPlainObject(clone.resource)) {
    provenance.resource = "present_wrong_type_retained";
  } else {
    provenance.resource = "present";
  }

  if (!("extensions" in clone) || clone.extensions === undefined || clone.extensions === null) {
    if (declaredBazaar !== undefined && isPlainObject(declaredBazaar)) {
      patches.extensions = { [BAZAAR_KEY]: cloneJson(declaredBazaar) };
      provenance.bazaar = "filled";
    } else if (declaredBazaar !== undefined) {
      provenance.bazaar = "absent_declared_unusable";
    } else {
      provenance.bazaar = "absent_no_declared";
    }
  } else if (!isPlainObject(clone.extensions)) {
    provenance.bazaar = "present_extensions_wrong_type_retained";
  } else if (
    !Object.prototype.hasOwnProperty.call(clone.extensions, BAZAAR_KEY) ||
    clone.extensions[BAZAAR_KEY] === undefined ||
    clone.extensions[BAZAAR_KEY] === null
  ) {
    if (declaredBazaar !== undefined && isPlainObject(declaredBazaar)) {
      patches.extensions = {
        ...clone.extensions,
        [BAZAAR_KEY]: cloneJson(declaredBazaar),
      };
      provenance.bazaar = "filled";
    } else if (declaredBazaar !== undefined) {
      provenance.bazaar = "absent_declared_unusable";
    } else {
      provenance.bazaar = "absent_no_declared";
    }
  } else if (!isPlainObject(clone.extensions[BAZAAR_KEY])) {
    provenance.bazaar = "present_wrong_type_retained";
  } else {
    provenance.bazaar = "present";
  }

  if (patches.resource) clone.resource = patches.resource;
  if (patches.extensions) clone.extensions = patches.extensions;

  const originalAuthority = authorityFingerprint(original);
  const cloneAuthority = authorityFingerprint(clone);
  provenance.untouchedAuthority = signedPayloadUnchanged(original, clone);

  return {
    original,
    clone,
    patches,
    provenance,
    originalAuthority,
    cloneAuthority,
    mutatedOriginal: false,
    declinedPayment: false,
  };
}

export function refuseRewritePayloadToFixDiscovery(original, proposed) {
  if (!signedPayloadUnchanged(original, proposed)) {
    return { ok: false, rejected: true, failure: REWRITE_PAYLOAD_TO_FIX_DISCOVERY };
  }
  if (proposed?.payload !== original?.payload && proposed?.payload && original?.payload) {
    if (!signedPayloadUnchanged(original, proposed)) {
      return { ok: false, rejected: true, failure: REWRITE_PAYLOAD_TO_FIX_DISCOVERY };
    }
  }
  if (isPlainObject(proposed) && proposed.rewritePayload === true) {
    return { ok: false, rejected: true, failure: REWRITE_PAYLOAD_TO_FIX_DISCOVERY };
  }
  if (isPlainObject(proposed) && proposed.attempt === "rewrite-payload-to-fix-discovery") {
    return { ok: false, rejected: true, failure: REWRITE_PAYLOAD_TO_FIX_DISCOVERY };
  }
  return { ok: false, rejected: true, failure: REWRITE_PAYLOAD_TO_FIX_DISCOVERY };
}
