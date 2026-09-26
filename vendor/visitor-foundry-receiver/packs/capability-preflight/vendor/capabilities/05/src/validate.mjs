import {
  ERROR_CODES,
  FAILURE_CLASS,
  FORBIDDEN_FIELDS,
  FREE_ALTERNATIVE_STATE,
  INPUT_SCHEMA,
  MUTATION_STATE,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function planError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw planError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw planError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw planError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
  for (const [k, v] of Object.entries(record)) {
    if (isPlainObject(v)) assertNoForbidden(v, `${label}.${k}`);
    else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (isPlainObject(item)) assertNoForbidden(item, `${label}.${k}[${i}]`);
      });
    }
  }
}

function normalizeEnum(value, label, allowed) {
  const raw = requireNonEmptyString(String(value), label, { max: 64 }).toLowerCase();
  if (!allowed.includes(raw)) {
    throw planError(
      ERROR_CODES.INVALID_INPUT,
      `${label} must be one of ${allowed.join(",")}`,
      { value: raw },
    );
  }
  return raw;
}

function normalizeObservedState(raw) {
  if (raw == null) {
    throw planError(ERROR_CODES.MISSING_REQUIREMENT, "observedState is required");
  }
  if (typeof raw === "string") {
    return { summary: requireNonEmptyString(raw, "observedState", { max: 2000 }) };
  }
  if (!isPlainObject(raw)) {
    throw planError(ERROR_CODES.INVALID_INPUT, "observedState must be a string or object");
  }
  assertNoForbidden(raw, "observedState");
  const out = { ...raw };
  if (out.summary != null) {
    out.summary = requireNonEmptyString(String(out.summary), "observedState.summary", {
      max: 2000,
    });
  }
  return out;
}

export function collectMissingInputs(raw) {
  const missing = [];
  if (!isPlainObject(raw)) {
    return [
      {
        id: "failure_outcome",
        name: "Failed capability outcome record",
        kind: "object",
        required: true,
        source: "caller",
      },
    ];
  }
  if (typeof raw.capabilityId !== "string" || !raw.capabilityId.trim()) {
    missing.push({
      id: "capabilityId",
      name: "Capability id",
      kind: "string",
      required: true,
      source: "caller",
    });
  }
  if (typeof raw.attemptId !== "string" || !raw.attemptId.trim()) {
    missing.push({
      id: "attemptId",
      name: "Attempt id",
      kind: "string",
      required: true,
      source: "caller",
    });
  }
  if (raw.failureClass == null || (typeof raw.failureClass === "string" && !raw.failureClass.trim())) {
    missing.push({
      id: "failureClass",
      name: "Failure class",
      kind: "enum",
      required: true,
      source: "caller",
      notes: `one of ${Object.values(FAILURE_CLASS).join(",")}`,
    });
  }
  if (raw.mutationState == null || (typeof raw.mutationState === "string" && !raw.mutationState.trim())) {
    missing.push({
      id: "mutationState",
      name: "Mutation state",
      kind: "enum",
      required: true,
      source: "caller",
      notes: `one of ${Object.values(MUTATION_STATE).join(",")}`,
    });
  }
  if (raw.observedState == null) {
    missing.push({
      id: "observedState",
      name: "Observed state after failure",
      kind: "object|string",
      required: true,
      source: "caller",
    });
  } else if (typeof raw.observedState === "string" && !raw.observedState.trim()) {
    missing.push({
      id: "observedState",
      name: "Observed state after failure",
      kind: "object|string",
      required: true,
      source: "caller",
      notes: "empty string is not observedState",
    });
  }
  return missing;
}

/**
 * Strict validate + normalize a failed capability outcome record.
 * Throws on forbidden / hard-invalid.
 */
export function validateFailureOutcome(raw) {
  if (!isPlainObject(raw)) {
    throw planError(ERROR_CODES.INVALID_INPUT, "failure outcome must be an object");
  }
  assertNoForbidden(raw, "input");

  if (raw.schema != null && raw.schema !== INPUT_SCHEMA) {
    throw planError(
      ERROR_CODES.INVALID_INPUT,
      `input.schema must be ${INPUT_SCHEMA} when present`,
    );
  }

  const missing = collectMissingInputs(raw);
  if (missing.length > 0) {
    throw planError(
      ERROR_CODES.MISSING_REQUIREMENT,
      `missing required fields: ${missing.map((m) => m.id).join(",")}`,
      { missingInputs: missing },
    );
  }

  const capabilityId = requireNonEmptyString(raw.capabilityId, "capabilityId", { max: 128 });
  const attemptId = requireNonEmptyString(raw.attemptId, "attemptId", { max: 128 });
  const failureClass = normalizeEnum(
    raw.failureClass,
    "failureClass",
    Object.values(FAILURE_CLASS),
  );
  const mutationState = normalizeEnum(
    raw.mutationState,
    "mutationState",
    Object.values(MUTATION_STATE),
  );
  const observedState = normalizeObservedState(raw.observedState);

  const errorCode =
    raw.errorCode == null
      ? null
      : requireNonEmptyString(String(raw.errorCode), "errorCode", { max: 128 });

  const notes =
    raw.notes == null
      ? null
      : requireNonEmptyString(String(raw.notes), "notes", { max: 2000 });

  let freeAlternativeState = null;
  if (raw.freeAlternativeState != null) {
    freeAlternativeState = normalizeEnum(
      raw.freeAlternativeState,
      "freeAlternativeState",
      Object.values(FREE_ALTERNATIVE_STATE),
    );
  }

  const freeAlternativeId =
    raw.freeAlternativeId == null
      ? null
      : requireNonEmptyString(String(raw.freeAlternativeId), "freeAlternativeId", {
          max: 128,
        });

  const freeAlternativeLabel =
    raw.freeAlternativeLabel == null
      ? null
      : requireNonEmptyString(String(raw.freeAlternativeLabel), "freeAlternativeLabel", {
          max: 240,
        });

  if (
    (freeAlternativeId != null || freeAlternativeLabel != null) &&
    freeAlternativeState == null
  ) {
    throw planError(
      ERROR_CODES.MISSING_REQUIREMENT,
      "freeAlternativeState is required when freeAlternativeId/label is supplied",
      {
        missingInputs: [
          {
            id: "freeAlternativeState",
            name: "Free alternative state (Cap04 vocabulary)",
            kind: "enum",
            required: true,
            source: "caller",
            notes: "Do not invent free baseline equivalence",
          },
        ],
      },
    );
  }

  return {
    schema: INPUT_SCHEMA,
    capabilityId,
    attemptId,
    failureClass,
    mutationState,
    observedState,
    errorCode,
    notes,
    freeAlternativeState,
    freeAlternativeId,
    freeAlternativeLabel,
    demo: raw.demo === true,
  };
}
