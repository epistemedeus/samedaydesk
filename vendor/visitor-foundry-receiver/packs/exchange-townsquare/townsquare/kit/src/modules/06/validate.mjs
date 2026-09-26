import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_MESSAGES,
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  HARD_MAX_BYTES,
  HARD_MAX_MESSAGES,
  ID_MAX,
  INSTRUCTION_LIKE_PATTERNS,
  TEXT_MAX,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function exportError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw exportError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

function requireNonEmptyString(value, label, { max = ID_MAX } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw exportError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw exportError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return trimmed;
}

export function looksInstructionLike(text) {
  const t = String(text || "");
  return INSTRUCTION_LIKE_PATTERNS.some((re) => re.test(t));
}

/** Split on sentence / line / list boundaries for heuristic separation. */
export function splitClauses(text) {
  const raw = String(text || "");
  const parts = raw
    .split(/(?:\n+|[.!;]|(?:^|\n)\s*[-•*]\s+)/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : raw.trim() ? [raw.trim()] : [];
}

/**
 * Separate one message into dataParts / instructionParts.
 * - kind==="instruction" → instructionParts only
 * - kind==="data" → dataParts only
 * - else heuristic; mark separated:true
 */
export function separateMessageParts(text, kind) {
  const body = String(text);
  const k = typeof kind === "string" ? kind.trim().toLowerCase() : "";

  if (k === "instruction") {
    return {
      dataParts: [],
      instructionParts: [body],
      separated: false,
    };
  }
  if (k === "data") {
    return {
      dataParts: [body],
      instructionParts: [],
      separated: false,
    };
  }

  // Heuristic (kind missing, "mixed", or other)
  const clauses = splitClauses(body);
  const dataParts = [];
  const instructionParts = [];
  for (const clause of clauses) {
    if (looksInstructionLike(clause)) instructionParts.push(clause);
    else dataParts.push(clause);
  }

  // If nothing matched instruction patterns but whole text looks like one, treat all as instruction
  if (instructionParts.length === 0 && looksInstructionLike(body)) {
    return {
      dataParts: [],
      instructionParts: [body],
      separated: true,
    };
  }

  // If heuristic found no clauses (empty after split), keep as data
  if (dataParts.length === 0 && instructionParts.length === 0 && body.trim()) {
    return {
      dataParts: [body],
      instructionParts: [],
      separated: true,
    };
  }

  return {
    dataParts,
    instructionParts,
    separated: true,
  };
}

/**
 * UTF-8 byte size of text fields in an included message payload.
 * Deterministic: sum Buffer.byteLength of each data/instruction part (+ id/role/createdAt when present).
 */
export function messagePayloadByteSize(included) {
  let n = 0;
  if (typeof included.id === "string") n += Buffer.byteLength(included.id, "utf8");
  if (typeof included.role === "string") n += Buffer.byteLength(included.role, "utf8");
  if (typeof included.createdAt === "string") {
    n += Buffer.byteLength(included.createdAt, "utf8");
  }
  for (const p of included.dataParts || []) {
    n += Buffer.byteLength(String(p), "utf8");
  }
  for (const p of included.instructionParts || []) {
    n += Buffer.byteLength(String(p), "utf8");
  }
  return n;
}

/**
 * Unwrap / validate export input.
 * Empty messages array is allowed (ready + empty included).
 */
export function unwrapInput(raw) {
  if (!isPlainObject(raw)) {
    throw exportError(ERROR_CODES.INVALID_INPUT, "export input must be an object");
  }
  assertNoForbidden(raw, "input");

  if (!Object.prototype.hasOwnProperty.call(raw, "threadId")) {
    throw exportError(ERROR_CODES.MISSING_REQUIREMENT, "threadId is required");
  }
  if (!Object.prototype.hasOwnProperty.call(raw, "taskId")) {
    throw exportError(ERROR_CODES.MISSING_REQUIREMENT, "taskId is required");
  }
  if (!Object.prototype.hasOwnProperty.call(raw, "messages")) {
    throw exportError(ERROR_CODES.MISSING_REQUIREMENT, "messages is required");
  }

  const threadId = requireNonEmptyString(raw.threadId, "threadId", { max: ID_MAX });
  const taskId = requireNonEmptyString(raw.taskId, "taskId", { max: ID_MAX });

  if (!Array.isArray(raw.messages)) {
    throw exportError(ERROR_CODES.INVALID_INPUT, "messages must be an array");
  }

  // Bounds (clamp to hard max; reject non-finite)
  let maxBytes = DEFAULT_MAX_BYTES;
  if (raw.maxBytes != null) {
    if (typeof raw.maxBytes !== "number" || !Number.isFinite(raw.maxBytes) || raw.maxBytes < 1) {
      throw exportError(ERROR_CODES.INVALID_INPUT, "maxBytes must be a positive number");
    }
    maxBytes = Math.min(Math.floor(raw.maxBytes), HARD_MAX_BYTES);
  }

  let maxMessages = DEFAULT_MAX_MESSAGES;
  if (raw.maxMessages != null) {
    if (
      typeof raw.maxMessages !== "number" ||
      !Number.isFinite(raw.maxMessages) ||
      raw.maxMessages < 1
    ) {
      throw exportError(ERROR_CODES.INVALID_INPUT, "maxMessages must be a positive number");
    }
    maxMessages = Math.min(Math.floor(raw.maxMessages), HARD_MAX_MESSAGES);
  }

  return {
    threadId,
    taskId,
    messages: raw.messages,
    maxBytes,
    maxMessages,
    demo: raw.demo === true,
  };
}

/**
 * Normalize one raw message, or skip if malformed / lacking text.
 * Forbidden fields still throw.
 *
 * @returns {{ ok:true, value } | { ok:false, skipped }}
 */
export function tryNormalizeMessage(raw, index) {
  if (!isPlainObject(raw)) {
    return { ok: false, skipped: { index, reason: "not_object" } };
  }
  assertNoForbidden(raw, `messages[${index}]`);

  if (typeof raw.id !== "string" || !raw.id.trim()) {
    return {
      ok: false,
      skipped: { index, reason: "missing_id" },
    };
  }
  if (typeof raw.text !== "string" || !raw.text.trim()) {
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
    typeof raw.kind === "string" && raw.kind.trim() ? raw.kind.trim() : undefined;
  const parts = separateMessageParts(text, kind);

  const included = {
    id,
    role:
      typeof raw.role === "string" && raw.role.trim()
        ? raw.role.trim().slice(0, ID_MAX)
        : undefined,
    dataParts: parts.dataParts,
    instructionParts: parts.instructionParts,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.trim()
        ? raw.createdAt.trim()
        : undefined,
  };
  if (parts.separated) included.separated = true;
  // Drop undefined optional keys for stable JSON size
  if (included.role === undefined) delete included.role;
  if (included.createdAt === undefined) delete included.createdAt;

  return { ok: true, value: included };
}

/** Opaque continuation pointer (base64url of threadId + nextOffset). */
export function makeContinuationPointer(threadId, nextOffset) {
  const payload = JSON.stringify({ t: threadId, o: nextOffset, v: 1 });
  return Buffer.from(payload, "utf8").toString("base64url");
}
