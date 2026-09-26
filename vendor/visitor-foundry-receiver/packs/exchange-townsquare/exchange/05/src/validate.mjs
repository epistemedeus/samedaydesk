import { ERROR_CODES, FORBIDDEN_FIELDS } from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function correctionError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw correctionError(ERROR_CODES.FORBIDDEN_CLAIM, `${label} declares forbidden field ${key}`, {
        field: key,
      });
    }
  }
}

export function requireBrief(brief) {
  if (!isPlainObject(brief) || !Array.isArray(brief.objectiveChecks)) {
    throw correctionError(ERROR_CODES.INVALID_INPUT, "brief with objectiveChecks is required");
  }
  assertNoForbidden(brief, "brief");
  return brief;
}
