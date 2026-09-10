import {
  ACQUISITION_ERROR_CODES,
  ACQUISITION_SCHEMA,
  GREXAL_PUBLIC,
  LISTING_CAPTURE_SCHEMA,
} from "./constants.mjs";
import {
  catalogError,
  isPlainObject,
  validateInventory,
  validateCatalog,
} from "../../03/src/validate.mjs";

export { catalogError, isPlainObject, validateInventory, validateCatalog };

export function acquisitionError(code, message, details = null) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

/**
 * Canonical public route only: https://grexal.ai/marketplace/{agentId}
 * Reject invented or alternate hosts/paths.
 */
export function assertCanonicalListingUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVENTED_URL,
      "listing URL missing",
      { got: url ?? null },
    );
  }
  if (url !== GREXAL_PUBLIC.marketplaceUrl) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVENTED_URL,
      "listing URL is not the publicly discoverable Grexal route for this agentId",
      { expected: GREXAL_PUBLIC.marketplaceUrl, got: url },
    );
  }
  return url;
}

export function validateListingCapture(raw) {
  if (!isPlainObject(raw)) {
    throw acquisitionError(ACQUISITION_ERROR_CODES.INVALID_INPUT, "listingCapture must be an object");
  }
  if (raw.schema && raw.schema !== LISTING_CAPTURE_SCHEMA) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVALID_INPUT,
      `listingCapture.schema must be ${LISTING_CAPTURE_SCHEMA}`,
      { got: raw.schema },
    );
  }
  assertCanonicalListingUrl(raw.observedUrl);
  if (raw.httpStatus !== 200) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.MISSING_REQUIREMENT,
      "listingCapture.httpStatus must be 200 for readiness",
      { got: raw.httpStatus ?? null },
    );
  }
  if (raw.matchedPath !== GREXAL_PUBLIC.matchedPathPattern) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVALID_INPUT,
      `matchedPath must be ${GREXAL_PUBLIC.matchedPathPattern}`,
      { got: raw.matchedPath ?? null },
    );
  }
  const agentId = raw.routeParams?.agentId || raw.commercialFields?.agentId;
  if (agentId !== GREXAL_PUBLIC.agentId) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVENTED_URL,
      "captured agentId does not match S149 listing identifier",
      { expected: GREXAL_PUBLIC.agentId, got: agentId ?? null },
    );
  }
  if (raw.ssrEmbedsCommercialFields === true && raw.commercialFields?.sourcedFrom !== "S149") {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.SSR_COMMERCIAL_INVENTION,
      "do not invent commercial fields from SSR; sourceFrom S149 when SSR-empty",
    );
  }
  if (raw.commercialFields && raw.commercialFields.sourcedFrom !== "S149") {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.FORBIDDEN_CLAIM,
      "commercialFields.sourcedFrom must be S149",
      { got: raw.commercialFields.sourcedFrom ?? null },
    );
  }
  return raw;
}

/**
 * Paid-ready is refused unless confirmation.confirmed === true.
 * Package may still be built in discovery/readiness mode without confirmation.
 */
export function assertPaidReadyGate(confirmation, budgetHandoff) {
  const wantsPaidReady =
    confirmation?.markPaidReady === true || confirmation?.paidReady === true;
  if (!wantsPaidReady) {
    return { paidReady: false, reason: "confirmation not requested" };
  }
  if (confirmation?.confirmed !== true) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.PAID_WITHOUT_CONFIRMATION,
      "refuse paid-ready without explicit confirmation flag",
      {
        requiresConfirmation: true,
        listPriceUsd: budgetHandoff?.listPriceUsd ?? GREXAL_PUBLIC.listPriceUsd,
        estimateReserveUsd: budgetHandoff?.estimateReserveUsd ?? GREXAL_PUBLIC.estimateReserveUsd,
      },
    );
  }
  if (budgetHandoff?.paidInvokeExecuted === true) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.FORBIDDEN_CLAIM,
      "this kit must not claim paidInvokeExecuted=true",
    );
  }
  return { paidReady: true, reason: "operator confirmed budget handoff; invoke still not executed by this kit" };
}

export function validateAcquisitionPackage(raw) {
  if (!isPlainObject(raw)) {
    throw acquisitionError(ACQUISITION_ERROR_CODES.INVALID_INPUT, "package must be an object");
  }
  if (raw.schema !== ACQUISITION_SCHEMA) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVALID_INPUT,
      `schema must be ${ACQUISITION_SCHEMA}`,
      { got: raw.schema ?? null },
    );
  }
  assertCanonicalListingUrl(raw.listing?.url);
  if (raw.listing?.agentId !== GREXAL_PUBLIC.agentId) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVENTED_URL,
      "package listing.agentId mismatch",
    );
  }
  if (!isPlainObject(raw.budgetHandoff)) {
    throw acquisitionError(ACQUISITION_ERROR_CODES.MISSING_REQUIREMENT, "budgetHandoff required");
  }
  const bh = raw.budgetHandoff;
  if (bh.requiresConfirmation !== true) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVALID_INPUT,
      "budgetHandoff.requiresConfirmation must be true",
    );
  }
  if (bh.listPriceUsd !== GREXAL_PUBLIC.listPriceUsd) {
    throw acquisitionError(ACQUISITION_ERROR_CODES.INVALID_INPUT, "listPriceUsd must be 0.02");
  }
  if (bh.estimateReserveUsd !== GREXAL_PUBLIC.estimateReserveUsd) {
    throw acquisitionError(ACQUISITION_ERROR_CODES.INVALID_INPUT, "estimateReserveUsd must be 0.025");
  }
  if (bh.estimateReserveIsCharge !== false) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVALID_INPUT,
      "estimateReserveIsCharge must be false (reserve is not a charge)",
    );
  }
  if (bh.paidInvokeExecuted !== false) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.FORBIDDEN_CLAIM,
      "paidInvokeExecuted must remain false in this kit",
    );
  }
  if (raw.paidReady === true && raw.confirmation?.confirmed !== true) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.PAID_WITHOUT_CONFIRMATION,
      "package marks paidReady without confirmation",
    );
  }
  if (!Array.isArray(raw.freeVsPriced) || raw.freeVsPriced.length < 2) {
    throw acquisitionError(ACQUISITION_ERROR_CODES.INVALID_INPUT, "freeVsPriced labels required");
  }
  if (typeof raw.acquisitionSectionMd !== "string" || !raw.acquisitionSectionMd.includes(GREXAL_PUBLIC.marketplaceUrl)) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVALID_INPUT,
      "acquisitionSectionMd must include canonical Grexal URL",
    );
  }
  // No positive adoption / revenue claims (disclaimers OK)
  const positiveClaim = /\b(N customers|customer count|revenue earned|payout received|adoption rate|\\$\d[\d,]* (?:MRR|ARR)|installs?\s*=\s*[1-9])/i;
  if (positiveClaim.test(raw.acquisitionSectionMd)) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.FORBIDDEN_CLAIM,
      "acquisition section must not claim adoption/revenue/customers",
    );
  }
  return raw;
}
