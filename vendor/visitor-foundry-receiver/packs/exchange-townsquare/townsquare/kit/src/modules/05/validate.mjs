import {
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  ID_MAX,
  SOURCE_STATUS,
  TEXT_MAX,
  URI_MAX,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function cardsError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw cardsError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw cardsError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw cardsError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

/**
 * Classify sourceStatus without inventing uri/label.
 *
 * Priority:
 * 1. source == null → missing
 * 2. source.missing === true → missing
 * 3. source.accessible === false → inaccessible (uri/label preserved)
 * 4. uri or label present + accessible !== false + missing !== true → present
 * 5. empty (no uri/label) → missing (prefer over unspecified)
 * 6. otherwise → unspecified
 */
export function classifySourceStatus(source) {
  if (source == null) return SOURCE_STATUS.MISSING;
  if (!isPlainObject(source)) return SOURCE_STATUS.UNSPECIFIED;

  if (source.missing === true) return SOURCE_STATUS.MISSING;
  if (source.accessible === false) return SOURCE_STATUS.INACCESSIBLE;

  const uri =
    typeof source.uri === "string" && source.uri.trim() ? source.uri.trim() : null;
  const label =
    typeof source.label === "string" && source.label.trim()
      ? source.label.trim()
      : null;

  if ((uri || label) && source.accessible !== false && source.missing !== true) {
    return SOURCE_STATUS.PRESENT;
  }

  // Empty source object (no uri/label): prefer missing over unspecified
  if (!uri && !label) {
    if (source.missing === false) return SOURCE_STATUS.UNSPECIFIED;
    return SOURCE_STATUS.MISSING;
  }

  return SOURCE_STATUS.UNSPECIFIED;
}

/**
 * Preserve source fields explicitly; never invent uri/label.
 * Always stamp fetch:false, execute:false on exported source objects.
 */
export function normalizeSourceForCard(source) {
  if (source == null) return null;
  if (!isPlainObject(source)) return null;

  let uri = null;
  if (typeof source.uri === "string") {
    const trimmed = source.uri.trim();
    if (trimmed) {
      uri = trimmed.length > URI_MAX ? trimmed.slice(0, URI_MAX) : trimmed;
    }
  }

  let label = null;
  if (typeof source.label === "string") {
    const trimmed = source.label.trim();
    if (trimmed) {
      label = trimmed.length > TEXT_MAX ? trimmed.slice(0, TEXT_MAX) : trimmed;
    }
  }

  const out = {
    uri,
    label,
    fetch: false,
    execute: false,
  };

  if (typeof source.id === "string" && source.id.trim()) {
    out.id = source.id.trim().slice(0, ID_MAX);
  }
  if (typeof source.accessible === "boolean") {
    out.accessible = source.accessible;
  }
  if (typeof source.missing === "boolean") {
    out.missing = source.missing;
  }

  return out;
}

/**
 * Unwrap CLI/API input. Empty answers → missing_requirement.
 * Non-array answers → invalid_input.
 */
export function unwrapInput(raw) {
  if (!isPlainObject(raw)) {
    throw cardsError(ERROR_CODES.INVALID_INPUT, "cards input must be an object");
  }
  assertNoForbidden(raw, "input");

  if (!Object.prototype.hasOwnProperty.call(raw, "answers")) {
    throw cardsError(ERROR_CODES.MISSING_REQUIREMENT, "answers is required");
  }
  if (!Array.isArray(raw.answers)) {
    throw cardsError(ERROR_CODES.INVALID_INPUT, "answers must be an array");
  }
  if (raw.answers.length < 1) {
    throw cardsError(ERROR_CODES.MISSING_REQUIREMENT, "answers must not be empty");
  }

  return {
    answers: raw.answers,
    demo: raw.demo === true,
  };
}

function parseObservedAt(raw) {
  if (raw == null || raw === "") {
    return { observedAt: null, observedAtInvalid: false };
  }
  if (typeof raw !== "string") {
    return { observedAt: null, observedAtInvalid: true };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { observedAt: null, observedAtInvalid: false };
  }
  if (Number.isNaN(Date.parse(trimmed))) {
    return { observedAt: null, observedAtInvalid: true };
  }
  return { observedAt: trimmed, observedAtInvalid: false };
}

/**
 * Normalize one answer into a card, or skip.
 * Hard-forbidden fields / fetch/execute still throw.
 *
 * @returns {{ ok:true, value } | { ok:false, skipped }}
 */
export function tryNormalizeAnswer(raw, index) {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      skipped: { index, reason: "not_object" },
    };
  }
  assertNoForbidden(raw, `answers[${index}]`);

  // Forbidden fetch/execute on source — hard throw (not skip)
  if (isPlainObject(raw.source)) {
    assertNoForbidden(raw.source, `answers[${index}].source`);
    if (raw.source.fetch === true) {
      throw cardsError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `answers[${index}].source.fetch is forbidden`,
        { field: "fetch" },
      );
    }
    if (raw.source.execute === true) {
      throw cardsError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `answers[${index}].source.execute is forbidden`,
        { field: "execute" },
      );
    }
  }

  try {
    const id = requireNonEmptyString(raw.id, `answers[${index}].id`, { max: ID_MAX });
    const claim = requireNonEmptyString(raw.claim, `answers[${index}].claim`, {
      max: TEXT_MAX,
    });

    const { observedAt, observedAtInvalid } = parseObservedAt(raw.observedAt);

    let applicability = null;
    if (raw.applicability == null || raw.applicability === "") {
      applicability = null;
    } else if (typeof raw.applicability === "string") {
      const trimmed = raw.applicability.trim();
      applicability = trimmed
        ? trimmed.length > TEXT_MAX
          ? trimmed.slice(0, TEXT_MAX)
          : trimmed
        : null;
    } else {
      applicability = null;
    }

    const sourceStatus = classifySourceStatus(raw.source);
    const source = normalizeSourceForCard(raw.source);

    const card = {
      id,
      claim,
      source,
      observedAt,
      applicability,
      sourceStatus,
      execute: false,
    };

    if (observedAtInvalid) {
      card.observedAtInvalid = true;
    }

    if (typeof raw.questionId === "string" && raw.questionId.trim()) {
      card.questionId = raw.questionId.trim().slice(0, ID_MAX);
    }
    if (typeof raw.taskId === "string" && raw.taskId.trim()) {
      card.taskId = raw.taskId.trim().slice(0, ID_MAX);
    }
    if (raw.demo === true) {
      card.demo = true;
    }

    return { ok: true, value: card };
  } catch (err) {
    if (err && err.code === ERROR_CODES.FORBIDDEN_CLAIM) throw err;
    return {
      ok: false,
      skipped: {
        index,
        reason: err?.code || "invalid_answer",
        message: err?.message || "malformed answer",
        id: typeof raw.id === "string" ? raw.id : undefined,
      },
    };
  }
}
