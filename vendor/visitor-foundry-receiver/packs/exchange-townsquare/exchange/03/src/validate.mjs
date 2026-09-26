import { ERROR_CODES, FORBIDDEN_FIELDS } from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function agreementError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw agreementError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw agreementError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

export function assertNoForbidden(record, label = "record") {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw agreementError(ERROR_CODES.FORBIDDEN_CLAIM, `${label} declares forbidden field ${key}`, {
        field: key,
      });
    }
  }
}

export function requireBrief(brief) {
  if (!isPlainObject(brief)) {
    throw agreementError(ERROR_CODES.INVALID_INPUT, "brief must be an object");
  }
  assertNoForbidden(brief, "brief");
  if (!Array.isArray(brief.objectiveChecks)) {
    throw agreementError(ERROR_CODES.INVALID_INPUT, "brief.objectiveChecks must be an array");
  }
  return brief;
}

export { requireNonEmptyString };
