import {
  ERROR_CODES,
  FORBIDDEN_INVENTORY_FIELDS,
  FORBIDDEN_SECRET_FIELDS,
  INVENTORY_SCHEMA,
  PACKET_SCHEMA,
  CAPTURE_STATUS,
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
      throw stageError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `Forbidden invented demand/revenue field: ${key}`,
        { path: here },
      );
    }
    if (FORBIDDEN_SECRET_FIELDS.includes(key)) {
      throw stageError(
        ERROR_CODES.FORBIDDEN_SECRET,
        `Forbidden secret field: ${key}`,
        { path: here },
      );
    }
    rejectForbidden(obj[key], here);
  }
}

const REQUIRED_TOP = [
  "schema",
  "cite",
  "provider",
  "draft",
  "evidence",
  "priceRecommendation",
  "audienceCapture",
];

/**
 * Validate Grexal staging inventory. Throws on malformed / forbidden.
 * Does not invent missing facts — callers map missing to blocked_missing_input.
 */
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

  if (typeof raw.cite !== "string" || !raw.cite.trim()) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "cite must be a non-empty string");
  }
  if (raw.provider !== "grexal") {
    throw stageError(ERROR_CODES.INVALID_INPUT, "provider must be grexal", {
      got: raw.provider,
    });
  }

  if (!isPlainObject(raw.draft)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "draft must be an object");
  }
  for (const k of ["slug", "status", "visibility", "pricing"]) {
    if (typeof raw.draft[k] !== "string" || !raw.draft[k].trim()) {
      throw stageError(ERROR_CODES.INVALID_INPUT, `draft.${k} must be a non-empty string`);
    }
  }
  if (raw.draft.agentId !== undefined) {
    if (typeof raw.draft.agentId !== "string") {
      throw stageError(ERROR_CODES.INVALID_INPUT, "draft.agentId must be a string when present");
    }
    // Redistributable fixtures must use placeholders, not live IDs.
    if (/^[a-z0-9]{20,}$/i.test(raw.draft.agentId) && !raw.draft.agentId.includes("REDACTED")) {
      throw stageError(
        ERROR_CODES.FORBIDDEN_SECRET,
        "draft.agentId must be redacted placeholder in redistributable inventory",
        { hint: "use agentId_REDACTED" },
      );
    }
  }

  if (!isPlainObject(raw.evidence) || !Array.isArray(raw.evidence.receiptRefs)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "evidence.receiptRefs must be an array");
  }
  if (raw.evidence.receiptRefs.length < 1) {
    throw stageError(ERROR_CODES.MISSING_REQUIREMENT, "evidence.receiptRefs must be non-empty");
  }

  if (!isPlainObject(raw.priceRecommendation)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "priceRecommendation must be an object");
  }

  if (!isPlainObject(raw.audienceCapture)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "audienceCapture must be an object");
  }
  const ac = raw.audienceCapture;
  const allowed = Object.values(CAPTURE_STATUS);
  if (!allowed.includes(ac.status)) {
    throw stageError(
      ERROR_CODES.INVALID_INPUT,
      `audienceCapture.status must be one of ${allowed.join(", ")}`,
      { got: ac.status ?? null },
    );
  }
  if (ac.status === CAPTURE_STATUS.NO_USERS) {
    if (ac.users !== 0 && ac.users !== undefined) {
      throw stageError(
        ERROR_CODES.INVALID_INPUT,
        "audienceCapture.status=no_users requires users===0 when users is set",
      );
    }
  }
  if (ac.status === CAPTURE_STATUS.UNAVAILABLE && ac.users !== undefined && ac.users !== null) {
    throw stageError(
      ERROR_CODES.INVALID_INPUT,
      "audienceCapture.status=unavailable must not claim a user count (unavailable ≠ no_users)",
    );
  }

  return raw;
}

export function validatePacket(raw) {
  if (!isPlainObject(raw)) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "packet must be a plain object");
  }
  rejectForbidden(raw);
  if (raw.schema !== PACKET_SCHEMA) {
    throw stageError(ERROR_CODES.INVALID_INPUT, `schema must be ${PACKET_SCHEMA}`, {
      got: raw.schema ?? null,
    });
  }
  if (typeof raw.status !== "string" || !raw.status) {
    throw stageError(ERROR_CODES.INVALID_INPUT, "packet.status required");
  }
  if (!isPlainObject(raw.audienceCapture) || typeof raw.audienceCapture.status !== "string") {
    throw stageError(ERROR_CODES.INVALID_INPUT, "packet.audienceCapture.status required");
  }
  // Hard invariant: never collapse unavailable into no_users
  if (
    raw.status === "unavailable" &&
    raw.audienceCapture.status === "no_users"
  ) {
    throw stageError(
      ERROR_CODES.INVALID_INPUT,
      "packet.status=unavailable cannot pair with audienceCapture.status=no_users",
    );
  }
  if (
    raw.audienceCapture.status === "unavailable" &&
    (raw.audienceCapture.users === 0 || raw.labels?.collapsedUnavailableAsNoUsers === true)
  ) {
    throw stageError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable capture must stay distinct from no_users",
    );
  }
  return raw;
}
