/**
 * Provider-neutral listing-repair status boundary.
 *
 * Incomplete current capture cannot prove disappearance or global unlisting.
 * A declared identity.provider outside grexal|agensi is unsupported: refuse
 * when capture is complete. Never treat engine ok:true as actionable evidence.
 */
export const SUPPORTED_PROVIDERS = Object.freeze(["grexal", "agensi"]);

export function declaredProvider(input) {
  const raw = input?.identity?.provider;
  if (typeof raw !== "string") return null;
  const provider = raw.trim();
  return provider || null;
}

export function isUnsupportedProvider(provider) {
  if (provider == null) return false;
  return !SUPPORTED_PROVIDERS.includes(provider);
}

export function isCaptureIncomplete(input) {
  const current = input?.record?.routeRegressionInput?.current ?? input?.current ?? {};
  if (current.captureIncomplete === true) return true;
  if (current.partialCoverage === true) return true;
  if (current.coverageComplete === false) return true;
  if (current.incomplete === true) return true;
  const discovery = input?.discovery ?? {};
  if (discovery.catalogComplete === false) return true;
  if (discovery.captureStatus === "partial") return true;
  return false;
}

/**
 * Map engine diagnose output + caller input onto the public packet status.
 * Capture completeness wins over unknown-provider refuse (D15 expected partial).
 */
export function mapListingRepairStatus({ underlying, input } = {}) {
  const statusRaw = underlying?.status || "";

  if (isCaptureIncomplete(input)) {
    return {
      status: "partial",
      refused: false,
      partial: true,
      code: "incomplete-capture",
      reason: "Incomplete current capture cannot prove disappearance or global unlisting.",
    };
  }

  const provider = declaredProvider(input);
  if (isUnsupportedProvider(provider)) {
    return {
      status: "refused",
      refused: true,
      partial: false,
      code: "unsupported-provider",
      reason: `identity.provider=${provider} is not a supported join (grexal|agensi); do not treat as grexal diagnosis.`,
    };
  }

  if (statusRaw === "mismatch" || statusRaw === "refused") {
    return {
      status: "refused",
      refused: true,
      partial: false,
      code: statusRaw,
      reason: "Mismatched or refused join; do not invent identity.",
    };
  }

  if (
    statusRaw === "partial" ||
    statusRaw === "incomplete_catalog" ||
    statusRaw === "missing_record" ||
    statusRaw === "unknown"
  ) {
    return {
      status: "partial",
      refused: false,
      partial: true,
      code: statusRaw || "unknown",
      reason: "Incomplete, unknown, or missing identity/catalog evidence; packet is non-final.",
    };
  }

  if (statusRaw === "diagnosed") {
    return {
      status: "actionable",
      refused: false,
      partial: false,
      code: "diagnosed",
      reason: null,
    };
  }

  return {
    status: "informational",
    refused: false,
    partial: false,
    code: statusRaw || "unknown",
    reason: null,
  };
}
