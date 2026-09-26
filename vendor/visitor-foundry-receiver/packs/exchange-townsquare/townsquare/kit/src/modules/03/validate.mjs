import {
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  ID_MAX,
  TEXT_MAX,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function summaryError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw summaryError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw summaryError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw summaryError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

function optionalString(value, label, { max = 2000 } = {}) {
  if (value == null) return undefined;
  return requireNonEmptyString(String(value), label, { max });
}

/**
 * Unwrap CLI/API input into { topic, taskId, claims, corrections, demo }.
 */
export function unwrapInput(raw) {
  if (!isPlainObject(raw)) {
    throw summaryError(ERROR_CODES.INVALID_INPUT, "summary input must be an object");
  }
  assertNoForbidden(raw, "input");

  return {
    topic: raw.topic == null ? undefined : String(raw.topic).trim(),
    taskId: raw.taskId == null ? undefined : String(raw.taskId).trim(),
    claims: raw.claims,
    corrections: raw.corrections,
    demo: raw.demo === true,
  };
}

export function normalizeClaim(raw, index) {
  if (!isPlainObject(raw)) {
    throw summaryError(ERROR_CODES.INVALID_INPUT, `claims[${index}] must be an object`);
  }
  assertNoForbidden(raw, `claims[${index}]`);

  const id = requireNonEmptyString(raw.id, `claims[${index}].id`, { max: ID_MAX });
  const text = requireNonEmptyString(raw.text, `claims[${index}].text`, { max: TEXT_MAX });

  const conflictsWith = normalizeIdList(raw.conflictsWith, `claims[${index}].conflictsWith`);

  return {
    id,
    text,
    sourceId: optionalString(raw.sourceId, `claims[${index}].sourceId`, { max: ID_MAX }),
    sourceUri: optionalString(raw.sourceUri, `claims[${index}].sourceUri`, { max: 2000 }),
    observedAt: optionalString(raw.observedAt, `claims[${index}].observedAt`, { max: 64 }),
    epistemicStatus: optionalString(
      raw.epistemicStatus,
      `claims[${index}].epistemicStatus`,
      { max: 64 },
    ),
    stance: optionalString(raw.stance, `claims[${index}].stance`, { max: 128 }),
    conflictGroup: optionalString(
      raw.conflictGroup,
      `claims[${index}].conflictGroup`,
      { max: 128 },
    ),
    conflictsWith,
    demo: raw.demo === true,
  };
}

export function normalizeCorrection(raw, index) {
  if (!isPlainObject(raw)) {
    throw summaryError(
      ERROR_CODES.INVALID_INPUT,
      `corrections[${index}] must be an object`,
    );
  }
  assertNoForbidden(raw, `corrections[${index}]`);

  const id = requireNonEmptyString(raw.id, `corrections[${index}].id`, { max: ID_MAX });
  const text = requireNonEmptyString(raw.text, `corrections[${index}].text`, {
    max: TEXT_MAX,
  });
  const supersedesId = requireNonEmptyString(
    raw.supersedesId,
    `corrections[${index}].supersedesId`,
    { max: ID_MAX },
  );

  return {
    id,
    text,
    supersedesId,
    sourceId: optionalString(raw.sourceId, `corrections[${index}].sourceId`, {
      max: ID_MAX,
    }),
    sourceUri: optionalString(raw.sourceUri, `corrections[${index}].sourceUri`, {
      max: 2000,
    }),
    observedAt: optionalString(raw.observedAt, `corrections[${index}].observedAt`, {
      max: 64,
    }),
    epistemicStatus: optionalString(
      raw.epistemicStatus,
      `corrections[${index}].epistemicStatus`,
      { max: 64 },
    ),
  };
}

function normalizeIdList(raw, label) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw summaryError(ERROR_CODES.INVALID_INPUT, `${label} must be an array when present`);
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (typeof v !== "string" || !v.trim()) continue;
    out.push(v.trim());
  }
  return out;
}

/**
 * Detect cycles in supersession graph (correction.id → supersedesId, walking through
 * both claim and correction ids). Throws cyclic_lineage when a cycle exists among
 * resolved edges.
 */
export function assertAcyclicSupersession(corrections, knownIds) {
  const edges = new Map();
  for (const c of corrections) {
    if (!knownIds.has(c.supersedesId)) continue; // unresolved handled elsewhere
    edges.set(c.id, c.supersedesId);
  }

  for (const start of edges.keys()) {
    const seen = new Set();
    let cur = start;
    while (edges.has(cur)) {
      if (seen.has(cur)) {
        throw summaryError(
          ERROR_CODES.CYCLIC_LINEAGE,
          `cyclic supersession detected involving ${[...seen, cur].join(" → ")}`,
          { cycleStart: start, path: [...seen, cur] },
        );
      }
      seen.add(cur);
      cur = edges.get(cur);
      if (cur === start) {
        throw summaryError(
          ERROR_CODES.CYCLIC_LINEAGE,
          `cyclic supersession detected involving ${[...seen, cur].join(" → ")}`,
          { cycleStart: start, path: [...seen, cur] },
        );
      }
    }
  }
}

export function normalizeStanceKey(stance) {
  if (stance == null) return null;
  return String(stance).trim().toLowerCase().replace(/\s+/g, "_");
}
