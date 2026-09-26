import { ERROR_CODES, EVENT_SCHEMA, EVENT_TYPE, FORBIDDEN_EVENT_FIELDS } from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function lifecycleError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_EVENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw lifecycleError(ERROR_CODES.FORBIDDEN_CLAIM, `${label} declares forbidden field ${key}`, {
        field: key,
      });
    }
  }
}

export function validateEvent(raw, index = 0) {
  const label = `events[${index}]`;
  if (!isPlainObject(raw)) {
    throw lifecycleError(ERROR_CODES.INVALID_INPUT, `${label} must be an object`);
  }
  assertNoForbidden(raw, label);
  if (raw.schema != null && raw.schema !== EVENT_SCHEMA) {
    throw lifecycleError(ERROR_CODES.INVALID_INPUT, `${label}.schema mismatch`);
  }
  if (typeof raw.type !== "string" || !Object.values(EVENT_TYPE).includes(raw.type)) {
    throw lifecycleError(ERROR_CODES.UNKNOWN_EVENT, `${label}.type unsupported: ${raw.type}`);
  }
  if (typeof raw.at !== "string" || !raw.at.trim()) {
    throw lifecycleError(ERROR_CODES.INVALID_INPUT, `${label}.at must be ISO timestamp string`);
  }
  if (Number.isNaN(Date.parse(raw.at))) {
    throw lifecycleError(ERROR_CODES.INVALID_INPUT, `${label}.at is not parseable`);
  }
  return {
    schema: EVENT_SCHEMA,
    type: raw.type,
    at: raw.at,
    taskId: raw.taskId ?? null,
    proposalId: raw.proposalId ?? null,
    resultId: raw.resultId ?? null,
    note: raw.note ?? null,
    // Payment-shaped payloads are stripped/ignored — never applied.
    ignoredPaymentFields: Object.keys(raw).filter((k) => FORBIDDEN_EVENT_FIELDS.includes(k)),
  };
}
