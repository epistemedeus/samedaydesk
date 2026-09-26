import {
  DEFAULT_CORRECTION_RESERVE,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_DUPLICATES,
  DEFAULT_MAX_WRITES,
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  HARD_CORRECTION_RESERVE,
  HARD_MAX_BYTES,
  HARD_MAX_DUPLICATES,
  HARD_MAX_WRITES,
  ID_MAX,
  TEXT_MAX,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function controlsError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw controlsError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

function requireNonEmptyString(value, label, { max = ID_MAX } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw controlsError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw controlsError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return trimmed;
}

/**
 * Normalize text for duplicate detection: trim, collapse whitespace, lower-case.
 */
export function normalizeText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function utf8ByteSize(text) {
  return Buffer.byteLength(String(text || ""), "utf8");
}

function clampPositiveInt(value, fallback, hardMax, label) {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw controlsError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-negative finite number`);
  }
  return Math.min(Math.floor(value), hardMax);
}

/**
 * Unwrap / validate controls input. Malformed proposed writes are skipped later.
 */
export function unwrapInput(raw, options = {}) {
  if (!isPlainObject(raw)) {
    throw controlsError(ERROR_CODES.INVALID_INPUT, "controls input must be an object");
  }
  assertNoForbidden(raw, "input");
  if (isPlainObject(raw.budget)) assertNoForbidden(raw.budget, "budget");
  if (options && isPlainObject(options)) assertNoForbidden(options, "options");

  if (!Object.prototype.hasOwnProperty.call(raw, "threadId")) {
    throw controlsError(ERROR_CODES.MISSING_REQUIREMENT, "threadId is required");
  }
  if (!Object.prototype.hasOwnProperty.call(raw, "proposedWrites")) {
    throw controlsError(ERROR_CODES.MISSING_REQUIREMENT, "proposedWrites is required");
  }

  const threadId = requireNonEmptyString(raw.threadId, "threadId", { max: ID_MAX });

  if (!Array.isArray(raw.proposedWrites)) {
    throw controlsError(ERROR_CODES.INVALID_INPUT, "proposedWrites must be an array");
  }

  const priorWrites = Array.isArray(raw.priorWrites) ? raw.priorWrites : [];
  for (let i = 0; i < priorWrites.length; i++) {
    if (isPlainObject(priorWrites[i])) {
      assertNoForbidden(priorWrites[i], `priorWrites[${i}]`);
    }
  }

  const budgetIn = isPlainObject(raw.budget) ? raw.budget : {};
  const optBudget = isPlainObject(options.budget) ? options.budget : {};

  const maxWrites = clampPositiveInt(
    optBudget.maxWrites ?? budgetIn.maxWrites ?? options.maxWrites,
    DEFAULT_MAX_WRITES,
    HARD_MAX_WRITES,
    "maxWrites",
  );
  const maxBytes = clampPositiveInt(
    optBudget.maxBytes ?? budgetIn.maxBytes ?? options.maxBytes,
    DEFAULT_MAX_BYTES,
    HARD_MAX_BYTES,
    "maxBytes",
  );
  const maxDuplicates = clampPositiveInt(
    optBudget.maxDuplicates ?? budgetIn.maxDuplicates ?? options.maxDuplicates,
    DEFAULT_MAX_DUPLICATES,
    HARD_MAX_DUPLICATES,
    "maxDuplicates",
  );
  const correctionReserve = clampPositiveInt(
    options.correctionReserve ??
      budgetIn.correctionReserve ??
      optBudget.correctionReserve,
    DEFAULT_CORRECTION_RESERVE,
    HARD_CORRECTION_RESERVE,
    "correctionReserve",
  );

  return {
    threadId,
    priorWrites,
    proposedWrites: raw.proposedWrites,
    budget: {
      maxWrites,
      maxBytes,
      maxDuplicates,
      correctionReserve,
    },
    demo: raw.demo === true || options.demo === true,
  };
}

/**
 * Normalize one proposed write, or skip if malformed.
 * Forbidden fields still throw.
 *
 * @returns {{ ok:true, value } | { ok:false, skipped }}
 */
export function tryNormalizeWrite(raw, index) {
  if (!isPlainObject(raw)) {
    return { ok: false, skipped: { index, reason: "not_object" } };
  }
  assertNoForbidden(raw, `proposedWrites[${index}]`);

  if (typeof raw.id !== "string" || !raw.id.trim()) {
    return { ok: false, skipped: { index, reason: "missing_id" } };
  }
  if (typeof raw.text !== "string") {
    return {
      ok: false,
      skipped: {
        index,
        reason: "missing_text",
        id: raw.id.trim().slice(0, ID_MAX),
      },
    };
  }

  const id = raw.id.trim().slice(0, ID_MAX);
  let text = raw.text;
  if (text.length > TEXT_MAX) text = text.slice(0, TEXT_MAX);

  const kind =
    typeof raw.kind === "string" && raw.kind.trim()
      ? raw.kind.trim()
      : "message";

  const byteSize =
    typeof raw.byteSize === "number" &&
    Number.isFinite(raw.byteSize) &&
    raw.byteSize >= 0
      ? Math.floor(raw.byteSize)
      : utf8ByteSize(text);

  const value = {
    id,
    kind,
    text,
    byteSize,
    normalizedText: normalizeText(text),
    correctsId:
      typeof raw.correctsId === "string" && raw.correctsId.trim()
        ? raw.correctsId.trim().slice(0, ID_MAX)
        : undefined,
    replayOfId:
      typeof raw.replayOfId === "string" && raw.replayOfId.trim()
        ? raw.replayOfId.trim().slice(0, ID_MAX)
        : undefined,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.trim()
        ? raw.createdAt.trim()
        : undefined,
  };

  return { ok: true, value };
}

/**
 * Normalize a prior write for budget + duplicate baseline (best-effort).
 */
export function normalizePriorWrite(raw, index) {
  if (!isPlainObject(raw)) return null;
  assertNoForbidden(raw, `priorWrites[${index}]`);
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  if (typeof raw.text !== "string") return null;

  const id = raw.id.trim().slice(0, ID_MAX);
  let text = raw.text;
  if (text.length > TEXT_MAX) text = text.slice(0, TEXT_MAX);
  const kind =
    typeof raw.kind === "string" && raw.kind.trim()
      ? raw.kind.trim()
      : "message";
  const byteSize =
    typeof raw.byteSize === "number" &&
    Number.isFinite(raw.byteSize) &&
    raw.byteSize >= 0
      ? Math.floor(raw.byteSize)
      : utf8ByteSize(text);

  return {
    id,
    kind,
    text,
    byteSize,
    normalizedText: normalizeText(text),
    correctsId:
      typeof raw.correctsId === "string" && raw.correctsId.trim()
        ? raw.correctsId.trim().slice(0, ID_MAX)
        : undefined,
  };
}

export function isCorrectionWrite(write) {
  return (
    write.kind === "correction" ||
    (typeof write.correctsId === "string" && write.correctsId.length > 0)
  );
}

export function isReplayWrite(write) {
  return (
    write.kind === "replay" ||
    (typeof write.replayOfId === "string" && write.replayOfId.length > 0)
  );
}
