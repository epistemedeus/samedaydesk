import {
  ACQUISITION_KINDS,
  BUNDLE_SCHEMA,
  CAPTURE_STATUS,
  DIAGNOSIS_SCHEMA,
  DIAGNOSIS_STATUS,
  ERROR_CODES,
  FORBIDDEN_CLAIM_FIELDS,
  FORBIDDEN_INTENT_FIELDS,
  FORBIDDEN_SECRET_FIELDS,
  OUTPUT_KINDS,
  PROVIDERS,
  SOURCE_TAGS,
} from "./constants.mjs";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function diagnosisError(code, message, details = null) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function rejectForbidden(obj, path = "") {
  if (!isPlainObject(obj) && !Array.isArray(obj)) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => rejectForbidden(item, `${path}[${i}]`));
    return;
  }
  for (const key of Object.keys(obj)) {
    const here = path ? `${path}.${key}` : key;
    if (FORBIDDEN_INTENT_FIELDS.includes(key)) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_INTENT,
        `Forbidden intent/conversion field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_CLAIM_FIELDS.includes(key)) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `Forbidden invented demand/revenue field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_SECRET_FIELDS.includes(key)) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_SECRET,
        `Forbidden secret field: ${key}`,
        { path: here },
      );
    }
    rejectForbidden(obj[key], here);
  }
}

function validateAcquisition(ev, index) {
  const path = `acquisitionEvidence[${index}]`;
  if (!isPlainObject(ev)) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, `${path} must be an object`);
  }
  if (typeof ev.id !== "string" || !ev.id.trim()) {
    throw diagnosisError(
      ERROR_CODES.MISSING_REQUIREMENT,
      `${path}.id required`,
      { missing: [`${path}.id`] },
    );
  }
  const kinds = Object.values(ACQUISITION_KINDS);
  if (!kinds.includes(ev.kind)) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.kind must be one of ${kinds.join("|")}`,
      { got: ev.kind ?? null },
    );
  }
  const tags = Object.values(SOURCE_TAGS);
  if (!tags.includes(ev.sourceTag)) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.sourceTag must be one of ${tags.join("|")}`,
      { got: ev.sourceTag ?? null },
    );
  }
  if (ev.provider !== undefined && ev.provider !== null) {
    const providers = Object.values(PROVIDERS);
    if (!providers.includes(ev.provider)) {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        `${path}.provider must be grexal|agensi when set`,
        { got: ev.provider },
      );
    }
  }
  if (ev.synthetic === true) {
    throw diagnosisError(
      ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
      `${path}: synthetic acquisition revenue/conversion forbidden`,
      { path, field: "synthetic" },
    );
  }
  if (ev.impliesBuyerIntent === true || ev.equatesActivationWithIntent === true) {
    throw diagnosisError(
      ERROR_CODES.FORBIDDEN_INTENT,
      `${path}: activation must not imply buyer intent`,
      { path },
    );
  }
  return ev;
}

function validateOutput(ev, index) {
  const path = `usefulOutputEvidence[${index}]`;
  if (!isPlainObject(ev)) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, `${path} must be an object`);
  }
  if (typeof ev.id !== "string" || !ev.id.trim()) {
    throw diagnosisError(
      ERROR_CODES.MISSING_REQUIREMENT,
      `${path}.id required`,
      { missing: [`${path}.id`] },
    );
  }
  const kinds = Object.values(OUTPUT_KINDS);
  if (!kinds.includes(ev.kind)) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.kind must be one of ${kinds.join("|")}`,
      { got: ev.kind ?? null },
    );
  }
  const providers = Object.values(PROVIDERS);
  if (!providers.includes(ev.provider)) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      `${path}.provider must be grexal|agensi`,
      { got: ev.provider ?? null },
    );
  }
  if (ev.synthetic === true) {
    throw diagnosisError(
      ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
      `${path}: synthetic revenue forbidden`,
      { path, field: "synthetic" },
    );
  }
  if (ev.kind === OUTPUT_KINDS.EARNINGS) {
    if (ev.amount !== undefined && ev.amount !== null) {
      if (!isPlainObject(ev.amount) || typeof ev.amount.value !== "number") {
        throw diagnosisError(
          ERROR_CODES.INVALID_INPUT,
          `${path}.amount must be { value: number, currency? } when set`,
        );
      }
      if (typeof ev.evidenceRef !== "string" || !ev.evidenceRef.trim()) {
        throw diagnosisError(
          ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
          `${path}: earnings amount requires evidenceRef (no invented revenue)`,
          { path, missing: ["evidenceRef"] },
        );
      }
    }
  }
  // List pricing is allowed as observation only — never as revenue claim
  if (ev.pricing !== undefined && ev.pricing !== null) {
    if (!isPlainObject(ev.pricing)) {
      throw diagnosisError(ERROR_CODES.INVALID_INPUT, `${path}.pricing must be an object`);
    }
    if (ev.pricing.isRevenue === true || ev.pricing.isEarnings === true) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
        `${path}.pricing must not claim isRevenue/isEarnings (list price ≠ revenue)`,
        { path },
      );
    }
  }
  return ev;
}

/**
 * Validate conversion diagnosis input bundle (DIST-04 + DIST-05 shapes).
 * Throws on forbidden intent/revenue; returns normalized doc.
 * Missing-requirement throws with MISSING_REQUIREMENT for partial path.
 */
export function validateBundle(doc) {
  if (!isPlainObject(doc)) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "bundle must be an object");
  }
  rejectForbidden(doc);

  if (doc.schema !== undefined && doc.schema !== BUNDLE_SCHEMA) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      `bundle.schema must be ${BUNDLE_SCHEMA}`,
      { got: doc.schema },
    );
  }

  const captureStatus = doc.captureStatus ?? CAPTURE_STATUS.OK;
  const allowedCapture = Object.values(CAPTURE_STATUS);
  if (!allowedCapture.includes(captureStatus)) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      `captureStatus must be one of ${allowedCapture.join("|")}`,
      { got: captureStatus },
    );
  }

  // Soft missing: arrays required for ok capture (partial path)
  const missing = [];
  if (!Array.isArray(doc.acquisitionEvidence)) {
    missing.push("acquisitionEvidence");
  }
  if (!Array.isArray(doc.usefulOutputEvidence)) {
    missing.push("usefulOutputEvidence");
  }
  if (missing.length > 0 && captureStatus === CAPTURE_STATUS.OK) {
    throw diagnosisError(
      ERROR_CODES.MISSING_REQUIREMENT,
      `missing required fields: ${missing.join(", ")}`,
      { missing },
    );
  }

  const acquisitionEvidence = Array.isArray(doc.acquisitionEvidence)
    ? doc.acquisitionEvidence.map((ev, i) => validateAcquisition(ev, i))
    : [];
  const usefulOutputEvidence = Array.isArray(doc.usefulOutputEvidence)
    ? doc.usefulOutputEvidence.map((ev, i) => validateOutput(ev, i))
    : [];

  let compatibility = {};
  if (doc.compatibility !== undefined && doc.compatibility !== null) {
    if (!isPlainObject(doc.compatibility)) {
      throw diagnosisError(ERROR_CODES.INVALID_INPUT, "compatibility must be an object");
    }
    compatibility = { ...doc.compatibility };
  }

  return {
    schema: BUNDLE_SCHEMA,
    cite: typeof doc.cite === "string" ? doc.cite : null,
    captureStatus,
    reason: typeof doc.reason === "string" ? doc.reason : null,
    acquisitionEvidence,
    usefulOutputEvidence,
    compatibility,
  };
}

/**
 * Validate a produced diagnosis document.
 */
export function validateDiagnosis(doc) {
  if (!isPlainObject(doc)) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "diagnosis must be an object");
  }
  rejectForbidden(doc);

  if (doc.schema !== DIAGNOSIS_SCHEMA) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      `diagnosis.schema must be ${DIAGNOSIS_SCHEMA}`,
      { got: doc.schema ?? null },
    );
  }

  const statuses = Object.values(DIAGNOSIS_STATUS);
  if (!statuses.includes(doc.status)) {
    throw diagnosisError(
      ERROR_CODES.INVALID_INPUT,
      `diagnosis.status must be one of ${statuses.join("|")}`,
      { got: doc.status ?? null },
    );
  }

  // unavailable ≠ no_users hard checks
  if (doc.status === DIAGNOSIS_STATUS.UNAVAILABLE) {
    if (Object.prototype.hasOwnProperty.call(doc, "activationCount")) {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable must not report activationCount (would collapse into no_users)",
      );
    }
    if (Object.prototype.hasOwnProperty.call(doc, "usefulOutputCount")) {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        "unavailable must not report usefulOutputCount (would collapse into no_users)",
      );
    }
  }
  if (doc.status === DIAGNOSIS_STATUS.NO_USERS) {
    if (doc.activationCount !== 0 && doc.usefulOutputActionableCount !== 0) {
      // at least one zero dimension required — both may be zero
    }
    if (
      typeof doc.activationCount !== "number" &&
      typeof doc.usefulOutputActionableCount !== "number"
    ) {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        "no_users must report activationCount and/or usefulOutputActionableCount as 0",
      );
    }
  }

  if (!Array.isArray(doc.joined)) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "diagnosis.joined must be an array");
  }
  if (!Array.isArray(doc.unjoined)) {
    throw diagnosisError(ERROR_CODES.INVALID_INPUT, "diagnosis.unjoined must be an array");
  }

  for (let i = 0; i < doc.joined.length; i++) {
    const j = doc.joined[i];
    const path = `joined[${i}]`;
    if (!isPlainObject(j)) {
      throw diagnosisError(ERROR_CODES.INVALID_INPUT, `${path} must be an object`);
    }
    if (typeof j.causationKnown !== "boolean") {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        `${path}.causationKnown must be boolean`,
      );
    }
    if (typeof j.customerIndependenceKnown !== "boolean") {
      throw diagnosisError(
        ERROR_CODES.INVALID_INPUT,
        `${path}.customerIndependenceKnown must be boolean`,
      );
    }
    if (!Array.isArray(j.unknowns)) {
      throw diagnosisError(ERROR_CODES.INVALID_INPUT, `${path}.unknowns must be an array`);
    }
    // Default truth: unless explicitly proven, must be false
    if (j.causationKnown === true) {
      if (!j.sharedEvidenceId) {
        throw diagnosisError(
          ERROR_CODES.INVALID_INPUT,
          `${path}: causationKnown=true requires sharedEvidenceId`,
        );
      }
    }
    if (j.claims?.conversionFromClick === true) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_INTENT,
        `${path}: conversionFromClick must be false (click ≠ conversion)`,
      );
    }
    if (j.claims?.revenueFromListPrice === true) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
        `${path}: revenueFromListPrice must be false`,
      );
    }
    if (j.claims?.buyerIntentFromActivation === true) {
      throw diagnosisError(
        ERROR_CODES.FORBIDDEN_INTENT,
        `${path}: buyerIntentFromActivation must be false`,
      );
    }
  }

  return doc;
}
