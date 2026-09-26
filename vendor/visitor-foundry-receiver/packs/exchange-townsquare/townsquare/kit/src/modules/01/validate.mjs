import {
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  STOPWORD_MAX_LEN,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function routeError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw routeError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw routeError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw routeError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

function optionalStringArray(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw routeError(ERROR_CODES.INVALID_INPUT, `${label} must be a string array when present`);
  }
  return value
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => v.trim());
}

/**
 * Unwrap CLI/API input into { question, capabilities, task }.
 * Accepts A) { question, capabilities, task? } or B) top-level question fields + capabilities.
 */
export function unwrapInput(raw) {
  if (!isPlainObject(raw)) {
    throw routeError(ERROR_CODES.INVALID_INPUT, "route input must be an object");
  }
  assertNoForbidden(raw, "input");

  if (isPlainObject(raw.question)) {
    assertNoForbidden(raw.question, "question");
    return {
      question: raw.question,
      capabilities: raw.capabilities,
      task: raw.task ?? null,
    };
  }

  // Top-level convenience: question fields at root alongside capabilities
  if (raw.taskId != null || raw.text != null || raw.id != null) {
    const {
      capabilities,
      task,
      ...questionFields
    } = raw;
    assertNoForbidden(questionFields, "question");
    return {
      question: questionFields,
      capabilities,
      task: task ?? null,
    };
  }

  throw routeError(
    ERROR_CODES.INVALID_INPUT,
    "input must be { question, capabilities } or top-level question fields + capabilities",
  );
}

export function normalizeQuestion(raw) {
  if (!isPlainObject(raw)) {
    throw routeError(ERROR_CODES.INVALID_INPUT, "question must be an object");
  }
  assertNoForbidden(raw, "question");

  if (raw.taskId == null || (typeof raw.taskId === "string" && !raw.taskId.trim())) {
    throw routeError(ERROR_CODES.MISSING_REQUIREMENT, "question.taskId is required");
  }

  const id = requireNonEmptyString(raw.id ?? `q-${raw.taskId}`, "question.id", { max: 128 });
  const taskId = requireNonEmptyString(raw.taskId, "question.taskId", { max: 128 });
  const text = requireNonEmptyString(raw.text, "question.text", { max: 4000 });

  return {
    id,
    taskId,
    text,
    status: raw.status == null ? undefined : String(raw.status).trim(),
    neededOutcomes: optionalStringArray(raw.neededOutcomes, "question.neededOutcomes"),
    tags: optionalStringArray(raw.tags, "question.tags"),
    authorLabel: raw.authorLabel == null ? undefined : String(raw.authorLabel).trim(),
    trust: raw.trust == null ? undefined : String(raw.trust).trim(),
    demo: raw.demo === true,
  };
}

export function normalizeTask(raw, questionTaskId) {
  if (raw == null) return null;
  if (!isPlainObject(raw)) {
    throw routeError(ERROR_CODES.INVALID_INPUT, "task must be an object when present");
  }
  assertNoForbidden(raw, "task");
  const id = requireNonEmptyString(raw.id, "task.id", { max: 128 });
  if (id !== questionTaskId) {
    throw routeError(
      ERROR_CODES.INVALID_INPUT,
      `task.id ${id} does not match question.taskId ${questionTaskId}`,
    );
  }
  return {
    id,
    title: raw.title == null ? undefined : String(raw.title).trim(),
    summary: raw.summary == null ? undefined : String(raw.summary).trim(),
  };
}

/**
 * Validate one capability. Returns { ok, capability?, reason? }.
 * Malformed entries do not throw the whole route.
 */
export function validateCapabilityEntry(raw, index) {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "malformed_capability", capabilityId: null, title: undefined };
  }
  assertNoForbidden(raw, `capabilities[${index}]`);
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const outcomes = Array.isArray(raw.outcomes)
    ? raw.outcomes.filter((o) => typeof o === "string" && o.trim()).map((o) => o.trim())
    : null;
  if (!id || !title || !outcomes || outcomes.length === 0) {
    return {
      ok: false,
      reason: "malformed_capability",
      capabilityId: id || null,
      title: title || undefined,
    };
  }
  return {
    ok: true,
    capability: {
      id,
      title,
      summary: raw.summary == null ? undefined : String(raw.summary).trim(),
      outcomes,
      tags: optionalStringArray(raw.tags, `capabilities[${index}].tags`),
      demo: raw.demo === true,
    },
  };
}

export function normalizeToken(value) {
  return String(value).trim().toLowerCase();
}

export function tokenizeText(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > STOPWORD_MAX_LEN);
}

/** Whole-word substring: token appears as a word boundary match inside haystack. */
export function wholeWordIn(haystack, token) {
  const h = normalizeToken(haystack);
  const t = normalizeToken(token);
  if (!t) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(t)}([^a-z0-9]|$)`, "i");
  return re.test(h);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
