import {
  CAPTURE_STATUS,
  ERROR_CODES,
  FORBIDDEN_INVENTORY_FIELDS,
  FORBIDDEN_SECRET_FIELDS,
  INVENTORY_SCHEMA,
  PACKET_SCHEMA,
  PROVIDER_REVIEW,
} from "./constants.mjs";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function stageError(code, message, details = null) {
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
    if (FORBIDDEN_INVENTORY_FIELDS.includes(key)) {
      throw stageError(ERROR_CODES.FORBIDDEN_CLAIM, `Forbidden field: ${key}`, { path: here });
    }
    if (FORBIDDEN_SECRET_FIELDS.includes(key)) {
      throw stageError(ERROR_CODES.FORBIDDEN_SECRET, `Forbidden secret field: ${key}`, {
        path: here,
      });
    }
    rejectForbidden(obj[key], here);
  }
}

const REQUIRED_TOP = [
  "schema",
  "cite",
  "provider",
  "skill",
  "evidence",
  "providerReview",
  "audienceCapture",
];

export function validateInventory(raw) {
  if (!isPlainObject(raw)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "inventory must be a plain object");
  }
  rejectForbidden(raw);
  if (raw.schema !== INVENTORY_SCHEMA) {
    throw stageError(ERROR_CODES.INVALID_INPUT, `schema must be ${INVENTORY_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  const missing = REQUIRED_TOP.filter((k) => raw[k] === undefined || raw[k] === null);
  if (missing.length) {
    throw stageError(ERROR_CODES.MISSING_REQUIREMENT, "missing required inventory fields", {
      missing,
    });
  }
  if (raw.provider !== "agensi") {
    throw stageError(ERROR_CODES.INVALID_INPUT, "provider must be agensi");
  }
  if (!isPlainObject(raw.skill)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "skill must be an object");
  }
  for (const k of ["name", "pricingType", "skillMdName"]) {
    if (typeof raw.skill[k] !== "string" || !raw.skill[k].trim()) {
      throw stageError(ERROR_CODES.INVALID_INPUT, `skill.${k} must be a non-empty string`);
    }
  }
  if (raw.skill.pricingType !== "free") {
    throw stageError(ERROR_CODES.INVALID_INPUT, "this kit stages Free skills only", {
      got: raw.skill.pricingType,
    });
  }
  if (!isPlainObject(raw.evidence) || !Array.isArray(raw.evidence.receiptRefs)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "evidence.receiptRefs must be an array");
  }
  if (raw.evidence.receiptRefs.length < 1) {
    throw stageError(ERROR_CODES.MISSING_REQUIREMENT, "evidence.receiptRefs must be non-empty");
  }
  if (!isPlainObject(raw.providerReview)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "providerReview must be an object");
  }
  const allowedReview = Object.values(PROVIDER_REVIEW);
  if (!allowedReview.includes(raw.providerReview.status)) {
    throw stageError(
      ERROR_CODES.INVALID_INPUT,
      `providerReview.status must be one of ${allowedReview.join(", ")}`,
    );
  }
  if (raw.providerReview.resubmit === true) {
    throw stageError(
      ERROR_CODES.FORBIDDEN_CLAIM,
      "resubmit must not be true — Root owns next provider-review event; do not re-submit",
    );
  }
  if (!isPlainObject(raw.audienceCapture)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "audienceCapture must be an object");
  }
  const ac = raw.audienceCapture;
  if (!Object.values(CAPTURE_STATUS).includes(ac.status)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "invalid audienceCapture.status");
  }
  if (ac.status === CAPTURE_STATUS.UNAVAILABLE && ac.users !== undefined && ac.users !== null) {
    throw stageError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not claim a user count (unavailable ≠ no_users)",
    );
  }
  if (ac.status === CAPTURE_STATUS.NO_USERS && ac.users !== 0 && ac.users !== undefined) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "no_users requires users===0 when set");
  }
  return raw;
}

export function validatePacket(raw) {
  if (!isPlainObject(raw)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "packet must be a plain object");
  }
  rejectForbidden(raw);
  if (raw.schema !== PACKET_SCHEMA) {
    throw stageError(ERROR_CODES.INVALID_INPUT, `schema must be ${PACKET_SCHEMA}`);
  }
  if (!isPlainObject(raw.audienceCapture) || typeof raw.audienceCapture.status !== "string") {
    throw stageError(ERROR_CODES.INVALID_INPUT, "packet.audienceCapture.status required");
  }
  if (raw.status === "unavailable" && raw.audienceCapture.status === "no_users") {
    throw stageError(
      ERROR_CODES.INVALID_INPUT,
      "packet.status=unavailable cannot pair with audienceCapture.status=no_users",
    );
  }
  return raw;
}
