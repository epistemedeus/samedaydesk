import {
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  STATEMENT_MAX,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function extractError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw extractError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw extractError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw extractError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

/**
 * Unwrap CLI/API input into { answer, evidence, candidateActions }.
 * Accepts A) { answer, evidence?, candidateActions? } or B) top-level answer fields.
 */
export function unwrapInput(raw) {
  if (!isPlainObject(raw)) {
    throw extractError(ERROR_CODES.INVALID_INPUT, "extract input must be an object");
  }
  assertNoForbidden(raw, "input");

  if (isPlainObject(raw.answer)) {
    assertNoForbidden(raw.answer, "answer");
    return {
      answer: raw.answer,
      evidence: raw.evidence,
      candidateActions: raw.candidateActions,
      demo: raw.demo === true,
    };
  }

  if (raw.text != null || raw.id != null) {
    const { evidence, candidateActions, demo, ...answerFields } = raw;
    assertNoForbidden(answerFields, "answer");
    return {
      answer: answerFields,
      evidence,
      candidateActions,
      demo: demo === true,
    };
  }

  throw extractError(
    ERROR_CODES.INVALID_INPUT,
    "input must be { answer, evidence?, candidateActions? } or top-level answer fields",
  );
}

export function normalizeAnswer(raw) {
  if (!isPlainObject(raw)) {
    throw extractError(ERROR_CODES.INVALID_INPUT, "answer must be an object");
  }
  assertNoForbidden(raw, "answer");

  if (raw.text == null || (typeof raw.text === "string" && !raw.text.trim())) {
    throw extractError(ERROR_CODES.MISSING_REQUIREMENT, "answer.text is required");
  }

  const text = requireNonEmptyString(raw.text, "answer.text", { max: 8000 });
  const id = requireNonEmptyString(raw.id ?? "answer-anon", "answer.id", { max: 128 });

  return {
    id,
    questionId:
      raw.questionId == null ? undefined : requireNonEmptyString(String(raw.questionId), "answer.questionId", { max: 128 }),
    taskId:
      raw.taskId == null ? undefined : requireNonEmptyString(String(raw.taskId), "answer.taskId", { max: 128 }),
    text,
    authorLabel: raw.authorLabel == null ? undefined : String(raw.authorLabel).trim(),
    demo: raw.demo === true,
  };
}

/**
 * Validate one evidence entry.
 * execute:true → throw forbidden_claim
 * fetch:true → throw forbidden_claim (never fetch)
 * Returns { ok, evidence?, reason?, excerpt? }
 */
export function validateEvidenceEntry(raw, index) {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "malformed_evidence", excerpt: undefined, id: null };
  }
  assertNoForbidden(raw, `evidence[${index}]`);

  if (raw.execute === true) {
    throw extractError(
      ERROR_CODES.FORBIDDEN_CLAIM,
      `evidence[${index}] declares execute:true (forbidden)`,
      { field: "execute", index },
    );
  }
  if (raw.fetch === true) {
    throw extractError(
      ERROR_CODES.FORBIDDEN_CLAIM,
      `evidence[${index}] declares fetch:true (forbidden; never fetch)`,
      { field: "fetch", index },
    );
  }

  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `ev-${index + 1}`;
  const excerpt =
    typeof raw.excerpt === "string" && raw.excerpt.trim()
      ? raw.excerpt.trim()
      : undefined;
  const uri = raw.uri == null ? undefined : String(raw.uri).trim();
  const label = raw.label == null ? undefined : String(raw.label).trim();

  return {
    ok: true,
    evidence: {
      id,
      uri,
      label,
      excerpt,
      fetch: false,
      execute: false,
    },
  };
}

export function normalizeCandidateActions(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw extractError(ERROR_CODES.INVALID_INPUT, "candidateActions must be an array when present");
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!isPlainObject(item)) continue;
    assertNoForbidden(item, `candidateActions[${i}]`);
    if (typeof item.statement !== "string" || !item.statement.trim()) continue;
    const statement = boundStatement(item.statement);
    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : slugFromStatement(statement);
    out.push({
      id,
      statement,
      kind: item.kind == null ? undefined : String(item.kind).trim(),
    });
  }
  return out;
}

export function boundStatement(text) {
  const t = String(text).trim().replace(/\s+/g, " ");
  if (t.length <= STATEMENT_MAX) return t;
  return `${t.slice(0, STATEMENT_MAX - 1)}…`;
}

export function slugFromStatement(statement) {
  const base = String(statement)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "action";
}

export function normalizeKey(statement) {
  return String(statement)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!;:]+$/g, "");
}
