import {
  ERROR_CODES,
  FORBIDDEN_FIELDS,
  FREE_ALTERNATIVE_STATE,
  INPUT_SCHEMA,
  PRICE_SOURCE,
} from "./constants.mjs";

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function compareError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function requireNonEmptyString(value, label, { max = 2000 } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw compareError(ERROR_CODES.INVALID_INPUT, `${label} must be a non-empty string`);
  }
  if (value.length > max) {
    throw compareError(ERROR_CODES.INVALID_INPUT, `${label} exceeds max length ${max}`);
  }
  return value.trim();
}

export function assertNoForbidden(record, label) {
  if (!isPlainObject(record)) return;
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      throw compareError(
        ERROR_CODES.FORBIDDEN_CLAIM,
        `${label} declares forbidden field ${key}`,
        { field: key },
      );
    }
  }
  for (const [k, v] of Object.entries(record)) {
    if (isPlainObject(v)) assertNoForbidden(v, `${label}.${k}`);
    else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (isPlainObject(item)) assertNoForbidden(item, `${label}.${k}[${i}]`);
      });
    }
  }
}

function normalizeAtomic(value, label) {
  if (value == null || value === "") return null;
  const amount = String(value);
  if (!/^\d+$/.test(amount)) {
    throw compareError(
      ERROR_CODES.INVALID_INPUT,
      `${label} must be non-negative integer string`,
    );
  }
  return amount;
}

function normalizeExternalCosts(raw, label) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw compareError(ERROR_CODES.INVALID_INPUT, `${label} must be an array when present`);
  }
  return raw.map((item, i) => {
    if (!isPlainObject(item)) {
      throw compareError(ERROR_CODES.INVALID_INPUT, `${label}[${i}] must be an object`);
    }
    assertNoForbidden(item, `${label}[${i}]`);
    return {
      label: requireNonEmptyString(item.label, `${label}[${i}].label`, { max: 200 }),
      amountAtomic: normalizeAtomic(item.amountAtomic, `${label}[${i}].amountAtomic`),
      note:
        item.note == null
          ? null
          : requireNonEmptyString(String(item.note), `${label}[${i}].note`, { max: 500 }),
    };
  });
}

/**
 * Validate one caller-supplied quote (fixture / dry-run only).
 */
export function validateQuote(raw, index = 0) {
  const label = `quotes[${index}]`;
  if (!isPlainObject(raw)) {
    throw compareError(ERROR_CODES.INVALID_INPUT, `${label} must be an object`);
  }
  assertNoForbidden(raw, label);

  const id = requireNonEmptyString(raw.id ?? raw.quoteId, `${label}.id`, { max: 128 });
  const quoteLabel =
    raw.label == null && raw.title == null
      ? id
      : requireNonEmptyString(String(raw.label ?? raw.title), `${label}.label`, { max: 240 });

  const amountAtomic = normalizeAtomic(raw.amountAtomic, `${label}.amountAtomic`);
  const currency =
    raw.currency == null
      ? amountAtomic != null
        ? "USDC"
        : null
      : requireNonEmptyString(String(raw.currency), `${label}.currency`, { max: 16 });

  // present: explicit false wins; else amountAtomic presence.
  let present;
  if (raw.present === false) {
    present = false;
  } else if (raw.present === true) {
    present = amountAtomic != null;
  } else {
    present = amountAtomic != null;
  }

  let priceSource = null;
  if (raw.priceSource != null) {
    priceSource = requireNonEmptyString(String(raw.priceSource), `${label}.priceSource`, {
      max: 120,
    });
  }

  const stale = raw.stale === true;
  const externalCosts = normalizeExternalCosts(raw.externalCosts, `${label}.externalCosts`);
  const unit =
    raw.unit == null
      ? null
      : requireNonEmptyString(String(raw.unit), `${label}.unit`, { max: 64 });

  return {
    id,
    label: quoteLabel,
    amountAtomic: present ? amountAtomic : null,
    currency: present ? currency : null,
    present,
    priceSource,
    stale,
    externalCosts,
    unit,
  };
}

/**
 * Validate one free alternative. State must be exact FREE_ALTERNATIVE_STATE.
 * `unavailable` is distinct from empty/no-users.
 */
export function validateFreeAlternative(raw, index = 0) {
  const label = `freeAlternatives[${index}]`;
  if (!isPlainObject(raw)) {
    throw compareError(ERROR_CODES.INVALID_INPUT, `${label} must be an object`);
  }
  assertNoForbidden(raw, label);

  const id = requireNonEmptyString(raw.id, `${label}.id`, { max: 128 });
  const altLabel =
    raw.label == null
      ? id
      : requireNonEmptyString(String(raw.label), `${label}.label`, { max: 240 });

  const stateRaw = requireNonEmptyString(raw.state, `${label}.state`, { max: 40 }).toLowerCase();
  const allowed = Object.values(FREE_ALTERNATIVE_STATE);
  if (!allowed.includes(stateRaw)) {
    throw compareError(
      ERROR_CODES.INVALID_INPUT,
      `${label}.state must be one of ${allowed.join(",")}`,
      { state: stateRaw },
    );
  }

  const basis =
    raw.basis == null && raw.basisId == null
      ? null
      : requireNonEmptyString(String(raw.basis ?? raw.basisId), `${label}.basis`, {
          max: 120,
        });

  const notes =
    raw.notes == null
      ? null
      : requireNonEmptyString(String(raw.notes), `${label}.notes`, { max: 1000 });

  return {
    id,
    label: altLabel,
    state: stateRaw,
    basis,
    notes,
  };
}

/**
 * Validate full Cap04 dry-run comparison input.
 */
export function validateCostDryRunInput(raw) {
  if (!isPlainObject(raw)) {
    throw compareError(ERROR_CODES.INVALID_INPUT, "cost dry-run input must be an object");
  }
  assertNoForbidden(raw, "input");

  if (raw.schema != null && raw.schema !== INPUT_SCHEMA) {
    throw compareError(
      ERROR_CODES.INVALID_INPUT,
      `input.schema must be ${INPUT_SCHEMA} when present`,
    );
  }

  const taskId = requireNonEmptyString(raw.taskId, "taskId", { max: 128 });
  const capabilityId =
    raw.capabilityId == null
      ? null
      : requireNonEmptyString(String(raw.capabilityId), "capabilityId", { max: 128 });

  if (!Array.isArray(raw.quotes)) {
    throw compareError(ERROR_CODES.MISSING_REQUIREMENT, "quotes[] is required");
  }
  if (raw.quotes.length < 1) {
    throw compareError(ERROR_CODES.MISSING_REQUIREMENT, "at least one quotes[] entry is required");
  }

  const quotes = raw.quotes.map((q, i) => validateQuote(q, i));

  // freeAlternatives may be empty array (distinct from entries with state unavailable).
  let freeAlternatives = [];
  if (raw.freeAlternatives != null) {
    if (!Array.isArray(raw.freeAlternatives)) {
      throw compareError(
        ERROR_CODES.INVALID_INPUT,
        "freeAlternatives must be an array when present",
      );
    }
    freeAlternatives = raw.freeAlternatives.map((f, i) => validateFreeAlternative(f, i));
  }

  const notes =
    raw.notes == null
      ? null
      : requireNonEmptyString(String(raw.notes), "notes", { max: 2000 });

  return {
    schema: INPUT_SCHEMA,
    taskId,
    capabilityId,
    quotes,
    freeAlternatives,
    notes,
    demo: raw.demo === true,
  };
}

export { PRICE_SOURCE };
