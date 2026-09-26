import {
  DEFAULT_LIMIT,
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  ID_MAX,
  MAX_LIMIT,
  TEXT_MAX,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function queryError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw queryError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw queryError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw queryError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

function optionalStringArray(raw, label) {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) {
    throw queryError(ERROR_CODES.INVALID_INPUT, `${label} must be an array when present`);
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (typeof v !== "string" || !v.trim()) continue;
    out.push(v.trim());
  }
  return out;
}

function optionalIsoString(raw, label) {
  if (raw == null) return undefined;
  if (typeof raw !== "string" || !raw.trim()) {
    throw queryError(
      ERROR_CODES.INVALID_INPUT,
      `${label} must be a non-empty ISO string when present`,
    );
  }
  const trimmed = raw.trim();
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw queryError(ERROR_CODES.INVALID_INPUT, `${label} must be a valid ISO datetime`);
  }
  return trimmed;
}

function normalizeLimit(raw) {
  if (raw == null) return DEFAULT_LIMIT;
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    throw queryError(ERROR_CODES.INVALID_INPUT, "limit must be an integer when present");
  }
  if (raw <= 0) {
    throw queryError(ERROR_CODES.INVALID_INPUT, "limit must be > 0", { limit: raw });
  }
  return Math.min(raw, MAX_LIMIT);
}

function normalizeLastReadByTask(raw) {
  if (raw == null) return {};
  if (!isPlainObject(raw)) {
    throw queryError(ERROR_CODES.INVALID_INPUT, "lastReadByTask must be an object when present");
  }
  assertNoForbidden(raw, "lastReadByTask");
  const out = {};
  for (const [taskId, rev] of Object.entries(raw)) {
    if (typeof taskId !== "string" || !taskId.trim()) continue;
    if (
      typeof rev !== "number" ||
      !Number.isFinite(rev) ||
      !Number.isInteger(rev) ||
      rev < 0
    ) {
      throw queryError(
        ERROR_CODES.INVALID_INPUT,
        `lastReadByTask[${taskId}] must be a non-negative integer`,
      );
    }
    out[taskId.trim()] = rev;
  }
  return out;
}

function normalizeSubscription(raw) {
  if (raw == null) return {};
  if (!isPlainObject(raw)) {
    throw queryError(ERROR_CODES.INVALID_INPUT, "subscription must be an object when present");
  }
  assertNoForbidden(raw, "subscription");

  const capabilities = optionalStringArray(raw.capabilities, "subscription.capabilities");
  const taskIds = optionalStringArray(raw.taskIds, "subscription.taskIds");
  const deadlineBefore = optionalIsoString(raw.deadlineBefore, "subscription.deadlineBefore");
  const deadlineAfter = optionalIsoString(raw.deadlineAfter, "subscription.deadlineAfter");

  let unreadOnly;
  if (raw.unreadOnly == null) {
    unreadOnly = undefined;
  } else if (typeof raw.unreadOnly !== "boolean") {
    throw queryError(
      ERROR_CODES.INVALID_INPUT,
      "subscription.unreadOnly must be a boolean when present",
    );
  } else {
    unreadOnly = raw.unreadOnly;
  }

  return {
    capabilities,
    deadlineBefore,
    deadlineAfter,
    unreadOnly,
    taskIds,
  };
}

/**
 * Unwrap CLI/API input into normalized query shape.
 */
export function unwrapInput(raw) {
  if (!isPlainObject(raw)) {
    throw queryError(ERROR_CODES.INVALID_INPUT, "query input must be an object");
  }
  assertNoForbidden(raw, "input");

  if (!Array.isArray(raw.updates)) {
    throw queryError(ERROR_CODES.INVALID_INPUT, "updates must be an array");
  }

  return {
    subscription: normalizeSubscription(raw.subscription),
    lastReadByTask: normalizeLastReadByTask(raw.lastReadByTask),
    updates: raw.updates,
    afterCursor: raw.afterCursor == null || raw.afterCursor === "" ? null : String(raw.afterCursor),
    limit: normalizeLimit(raw.limit),
    demo: raw.demo === true,
  };
}

/**
 * Normalize one update; returns { ok:true, value } or { ok:false, skipped }.
 * Hard-forbidden fields still throw.
 */
export function tryNormalizeUpdate(raw, index) {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      skipped: { index, reason: "not_object" },
    };
  }
  assertNoForbidden(raw, `updates[${index}]`);

  try {
    const id = requireNonEmptyString(raw.id, `updates[${index}].id`, { max: ID_MAX });
    const taskId = requireNonEmptyString(raw.taskId, `updates[${index}].taskId`, {
      max: ID_MAX,
    });
    if (
      typeof raw.revision !== "number" ||
      !Number.isFinite(raw.revision) ||
      !Number.isInteger(raw.revision)
    ) {
      throw queryError(ERROR_CODES.INVALID_INPUT, `updates[${index}].revision must be an integer`);
    }
    const kind = requireNonEmptyString(raw.kind, `updates[${index}].kind`, { max: 128 });
    const summary = requireNonEmptyString(raw.summary, `updates[${index}].summary`, {
      max: TEXT_MAX,
    });
    const createdAt = requireNonEmptyString(raw.createdAt, `updates[${index}].createdAt`, {
      max: 64,
    });
    if (Number.isNaN(Date.parse(createdAt))) {
      throw queryError(ERROR_CODES.INVALID_INPUT, `updates[${index}].createdAt must be valid ISO`);
    }

    let capabilityIds;
    if (raw.capabilityIds == null) {
      capabilityIds = [];
    } else if (!Array.isArray(raw.capabilityIds)) {
      throw queryError(
        ERROR_CODES.INVALID_INPUT,
        `updates[${index}].capabilityIds must be an array when present`,
      );
    } else {
      capabilityIds = raw.capabilityIds
        .filter((c) => typeof c === "string" && c.trim())
        .map((c) => c.trim());
    }

    let taskDeadline = null;
    if (raw.taskDeadline != null && raw.taskDeadline !== "") {
      if (typeof raw.taskDeadline !== "string") {
        throw queryError(
          ERROR_CODES.INVALID_INPUT,
          `updates[${index}].taskDeadline must be ISO string or null`,
        );
      }
      const td = raw.taskDeadline.trim();
      if (Number.isNaN(Date.parse(td))) {
        throw queryError(
          ERROR_CODES.INVALID_INPUT,
          `updates[${index}].taskDeadline must be valid ISO when present`,
        );
      }
      taskDeadline = td;
    }

    return {
      ok: true,
      value: {
        id,
        taskId,
        revision: raw.revision,
        kind,
        capabilityIds,
        taskDeadline,
        summary,
        createdAt,
        demo: raw.demo === true,
      },
    };
  } catch (err) {
    if (err && err.code === ERROR_CODES.FORBIDDEN_CLAIM) throw err;
    return {
      ok: false,
      skipped: {
        index,
        reason: err?.code || "invalid_update",
        message: err?.message || "malformed update",
        id: typeof raw.id === "string" ? raw.id : undefined,
      },
    };
  }
}

export function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(raw) {
  const normalized = raw.replaceAll("-", "+").replaceAll("_", "/");
  const withPad = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(withPad);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeCursor(payload) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeCursor(raw) {
  if (
    typeof raw !== "string" ||
    raw.length < 1 ||
    raw.length > 512 ||
    !/^[A-Za-z0-9_-]+$/.test(raw)
  ) {
    throw queryError(ERROR_CODES.INVALID_CURSOR, "invalid cursor encoding");
  }
  let value;
  try {
    const bytes = base64UrlToBytes(raw);
    if (bytesToBase64Url(bytes) !== raw) {
      throw queryError(ERROR_CODES.INVALID_CURSOR, "invalid cursor encoding");
    }
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    if (err && err.code === ERROR_CODES.INVALID_CURSOR) throw err;
    throw queryError(ERROR_CODES.INVALID_CURSOR, "invalid cursor payload");
  }
  if (!isPlainObject(value)) {
    throw queryError(ERROR_CODES.INVALID_CURSOR, "cursor payload must be an object");
  }
  if (Object.prototype.hasOwnProperty.call(value, "i")) {
    if (typeof value.i !== "number" || !Number.isInteger(value.i) || value.i < 0) {
      throw queryError(ERROR_CODES.INVALID_CURSOR, "cursor.i must be a non-negative integer");
    }
    return { i: value.i };
  }
  if (Object.prototype.hasOwnProperty.call(value, "id")) {
    if (typeof value.id !== "string" || !value.id.trim()) {
      throw queryError(ERROR_CODES.INVALID_CURSOR, "cursor.id must be a non-empty string");
    }
    return { id: value.id.trim() };
  }
  throw queryError(ERROR_CODES.INVALID_CURSOR, "cursor must encode {i} or {id}");
}
