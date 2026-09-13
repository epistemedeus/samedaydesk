/**
 * SDS-local copy of the accepted x402 indexing-payload continuity hook pattern.
 *
 * Reference (merchant, read-only): epistemedeus/x402-url-extractor
 *   commit a143898dd1ec35c097ca7eb0b472f30dad1ee319
 *   module indexing-payload-continuity.mjs
 *
 * This module does not sign payments, does not reassign verifyPayment /
 * settlePayment, and does not talk to a facilitator. Live settlement is out
 * of scope for paid useful-job wrappers (SDS has no x402 ResourceServer).
 *
 * CDP Bazaar indexes `paymentPayload.resource` + `paymentPayload.extensions.bazaar`,
 * not sibling `paymentRequirements`. For Exact EVM EIP-3009, `@x402/evm` signs
 * only `payload` (authorization + signature). Resource and extensions are attached
 * by `@x402/core` outside that typed data. Filling omitted route-owned indexing
 * hints therefore does not change signed authority.
 */

const BAZAAR_KEY = "bazaar";
const EXACT_SCHEME = "exact";
const EVM_NETWORK_PREFIX = "eip155:";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return structuredClone(value);
}

export function isExactEvmV2IndexingContinuitySupported(paymentPayload, requirements) {
  if (!isPlainObject(paymentPayload) || !isPlainObject(requirements)) return false;
  if (paymentPayload.x402Version !== 2) return false;
  if (requirements.scheme !== EXACT_SCHEME) return false;
  const network = requirements.network;
  return typeof network === "string" && network.startsWith(EVM_NETWORK_PREFIX);
}

export function canonicalResourceUrlFromOriginAndPath(publicOrigin, path) {
  if (typeof publicOrigin !== "string" || !publicOrigin) return null;
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  try {
    const origin = new URL(publicOrigin);
    if (origin.protocol !== "https:" && origin.protocol !== "http:") return null;
    return `${origin.origin}${path}`;
  } catch {
    return null;
  }
}

export function resolveDeclaredResourceUrl(transportContext, options = {}) {
  if (typeof options.routeResourceUrl === "string" && options.routeResourceUrl) {
    return options.routeResourceUrl;
  }
  const request =
    isPlainObject(transportContext) && isPlainObject(transportContext.request)
      ? transportContext.request
      : null;
  const routeResource =
    request && isPlainObject(request.routeConfig) ? request.routeConfig.resource : null;
  if (typeof routeResource === "string" && routeResource) return routeResource;

  const path =
    request?.adapter && typeof request.adapter.getPath === "function"
      ? request.adapter.getPath()
      : null;
  return canonicalResourceUrlFromOriginAndPath(options.publicOrigin || "", path || "");
}

export function planIndexingPayloadContinuity(paymentPayload, declared = {}) {
  const patches = {};
  const provenance = {
    resource: "skipped",
    bazaar: "skipped",
    untouchedAuthority: true,
    declinedPayment: false,
  };

  if (!isPlainObject(paymentPayload)) {
    return {
      supported: false,
      patches,
      provenance: {
        ...provenance,
        resource: "skipped_invalid_payload",
        bazaar: "skipped_invalid_payload",
      },
    };
  }

  const declaredResource = declared?.resource;
  const declaredExtensions = isPlainObject(declared?.extensions) ? declared.extensions : null;
  const declaredBazaar =
    declaredExtensions && Object.prototype.hasOwnProperty.call(declaredExtensions, BAZAAR_KEY)
      ? declaredExtensions[BAZAAR_KEY]
      : undefined;

  if (!("resource" in paymentPayload) || paymentPayload.resource === undefined || paymentPayload.resource === null) {
    if (isPlainObject(declaredResource) && typeof declaredResource.url === "string" && declaredResource.url) {
      patches.resource = cloneJson(declaredResource);
      provenance.resource = "filled";
    } else {
      provenance.resource = "absent_no_declared";
    }
  } else if (!isPlainObject(paymentPayload.resource)) {
    provenance.resource = "present_wrong_type_retained";
  } else {
    provenance.resource = "present";
  }

  if (!("extensions" in paymentPayload) || paymentPayload.extensions === undefined || paymentPayload.extensions === null) {
    if (declaredBazaar !== undefined && isPlainObject(declaredBazaar)) {
      patches.extensions = { [BAZAAR_KEY]: cloneJson(declaredBazaar) };
      provenance.bazaar = "filled";
    } else if (declaredBazaar !== undefined) {
      provenance.bazaar = "absent_declared_unusable";
    } else {
      provenance.bazaar = "absent_no_declared";
    }
  } else if (!isPlainObject(paymentPayload.extensions)) {
    provenance.bazaar = "present_extensions_wrong_type_retained";
  } else if (
    !Object.prototype.hasOwnProperty.call(paymentPayload.extensions, BAZAAR_KEY) ||
    paymentPayload.extensions[BAZAAR_KEY] === undefined ||
    paymentPayload.extensions[BAZAAR_KEY] === null
  ) {
    if (declaredBazaar !== undefined && isPlainObject(declaredBazaar)) {
      patches.extensions = {
        ...paymentPayload.extensions,
        [BAZAAR_KEY]: cloneJson(declaredBazaar),
      };
      provenance.bazaar = "filled";
    } else if (declaredBazaar !== undefined) {
      provenance.bazaar = "absent_declared_unusable";
    } else {
      provenance.bazaar = "absent_no_declared";
    }
  } else if (!isPlainObject(paymentPayload.extensions[BAZAAR_KEY])) {
    provenance.bazaar = "present_wrong_type_retained";
  } else {
    provenance.bazaar = "present";
  }

  return { supported: true, patches, provenance };
}

export function applyIndexingContinuityPatches(paymentPayload, patches) {
  if (!isPlainObject(paymentPayload) || !isPlainObject(patches)) return paymentPayload;
  if (patches.resource) {
    paymentPayload.resource = patches.resource;
  }
  if (patches.extensions) {
    paymentPayload.extensions = patches.extensions;
  }
  return paymentPayload;
}

export function applyIndexingPayloadContinuity(paymentPayload, declared = {}, requirements = null) {
  if (requirements != null && !isExactEvmV2IndexingContinuitySupported(paymentPayload, requirements)) {
    return {
      ok: true,
      skipped: true,
      paymentPayload,
      provenance: {
        resource: "skipped_unsupported_scheme_or_version",
        bazaar: "skipped_unsupported_scheme_or_version",
        untouchedAuthority: true,
        declinedPayment: false,
      },
    };
  }
  const planned = planIndexingPayloadContinuity(paymentPayload, declared);
  applyIndexingContinuityPatches(paymentPayload, planned.patches);
  return {
    ok: true,
    skipped: false,
    paymentPayload,
    provenance: planned.provenance,
  };
}

export function buildDeclaredIndexing(transportContext, declaredExtensions, resolveDeclaredResource) {
  let resource = null;
  if (typeof resolveDeclaredResource === "function") {
    resource = resolveDeclaredResource(transportContext) || null;
  }
  return {
    resource,
    extensions: isPlainObject(declaredExtensions) ? declaredExtensions : null,
  };
}

let lastContinuityDiagnostic = null;

export function getLastIndexingContinuityDiagnostic() {
  return lastContinuityDiagnostic
    ? { ...lastContinuityDiagnostic, provenance: { ...lastContinuityDiagnostic.provenance } }
    : null;
}

export function registerIndexingPayloadContinuity(resourceServer, options = {}) {
  const resolveDeclaredResource =
    options.resolveDeclaredResource ||
    ((transportContext) => {
      const url = resolveDeclaredResourceUrl(transportContext, { publicOrigin: options.publicOrigin });
      return url ? { url } : null;
    });

  const run = (phase, context) => {
    const paymentPayload = context?.paymentPayload;
    const requirements = context?.requirements;
    if (!isExactEvmV2IndexingContinuitySupported(paymentPayload, requirements)) {
      lastContinuityDiagnostic = {
        at: new Date().toISOString(),
        phase,
        provenance: {
          resource: "skipped_unsupported_scheme_or_version",
          bazaar: "skipped_unsupported_scheme_or_version",
          untouchedAuthority: true,
          declinedPayment: false,
        },
      };
      return;
    }
    const declared = buildDeclaredIndexing(
      context.transportContext,
      context.declaredExtensions,
      resolveDeclaredResource,
    );
    const result = applyIndexingPayloadContinuity(paymentPayload, declared, requirements);
    lastContinuityDiagnostic = {
      at: new Date().toISOString(),
      phase,
      provenance: result.provenance,
    };
  };

  resourceServer.onBeforeVerify(async (context) => {
    run("verify", context);
  });
  resourceServer.onBeforeSettle(async (context) => {
    run("settle", context);
  });

  return resourceServer;
}
