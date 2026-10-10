/**
 * Authoritative observatory measurement rule.
 *
 * Server producers and the convergence consumer both use this module.
 * Known count units reject fractions and values that are not safe integers.
 * USD and USDC stay distinct decimal units. Exact decimal text is preserved.
 * A custom unit is not invalid, and it is not a known money or count unit.
 * Atomic amounts stay exact integer text. They are not money and not counts.
 * Negative, nonfinite, and unknown values stay invalid. They are not zero.
 */

export const MEASUREMENT_RULE = "pilot.observatory-measurement.v1";

const INTEGER_RE = /^(0|[1-9][0-9]*)$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_SAFE_TEXT = String(MAX_SAFE);

const CONTRACT = Object.freeze({
  count: contract("count", "integer"),
  flag: contract("count", "integer"),
  days: contract("count", "integer"),
  ms: contract("count", "integer"),
  provider_call_label: contract("count", "integer"),
  provider_payer_label: contract("count", "integer"),
  provider_label: contract("count", "integer"),
  USD: contract("money", "decimal"),
  USDC: contract("money", "decimal"),
  ratio: contract("ratio", "ratio"),
  atomic: contract("atomic", "exact_integer"),
});

function contract(unitClass, kind) {
  return Object.freeze({ unitClass, kind });
}

export function classifyUnit(unit) {
  if (unit == null || unit === "") {
    return { unit: null, unitClass: "absent", kind: "decimal", known: false };
  }
  if (typeof unit !== "string") {
    return { unit: null, unitClass: "invalid", kind: null, known: false };
  }
  const known = CONTRACT[unit];
  if (!known) return { unit, unitClass: "custom", kind: "decimal", known: false };
  return { unit, unitClass: known.unitClass, kind: known.kind, known: true };
}

export function integerTextOverflows(text) {
  if (typeof text !== "string" || text.length === 0) return true;
  if (text.length < MAX_SAFE_TEXT.length) return false;
  if (text.length > MAX_SAFE_TEXT.length) return true;
  return text > MAX_SAFE_TEXT;
}

export function inspectNumeric(raw, kind) {
  if (raw === null || raw === undefined) return { state: "missing", value: null };
  if (typeof raw === "boolean" || typeof raw === "function" || typeof raw === "symbol") {
    return { state: "invalid", value: null };
  }
  if (typeof raw === "object") return { state: "invalid", value: null };

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return { state: "invalid", value: null };
    if (kind === "integer" || kind === "exact_integer") {
      if (!Number.isInteger(raw) || !Number.isSafeInteger(raw)) return { state: "invalid", value: null };
      return kind === "exact_integer"
        ? { state: "ok", value: String(raw) }
        : { state: "ok", value: raw };
    }
    if (raw > MAX_SAFE) return { state: "invalid", value: null };
    return { state: "ok", value: raw };
  }

  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "") return { state: "invalid", value: null };
    if (text === "NaN" || text === "Infinity" || text === "+Infinity" || text === "-Infinity") {
      return { state: "invalid", value: null };
    }
    if (text.startsWith("-")) return { state: "invalid", value: null };
    if (kind === "integer") {
      if (!INTEGER_RE.test(text) || integerTextOverflows(text)) return { state: "invalid", value: null };
      return { state: "ok", value: Number(text) };
    }
    if (kind === "exact_integer") {
      if (!INTEGER_RE.test(text)) return { state: "invalid", value: null };
      return { state: "ok", value: text };
    }
    if (kind === "ratio") {
      const fraction = /^(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)$/.exec(text);
      if (fraction) {
        if (fraction[2] === "0" || integerTextOverflows(fraction[1]) || integerTextOverflows(fraction[2])) {
          return { state: "invalid", value: null };
        }
        return { state: "ok", value: `${fraction[1]}/${fraction[2]}` };
      }
    }
    if (!DECIMAL_RE.test(text)) return { state: "invalid", value: null };
    const whole = text.split(".")[0];
    if (integerTextOverflows(whole)) return { state: "invalid", value: null };
    return { state: "ok", value: text };
  }

  return { state: "invalid", value: null };
}

export function judgeMeasured(value, unit) {
  const classified = classifyUnit(unit);
  if (!classified.kind) {
    return { state: "invalid", value: null, unit: null, unitClass: "invalid" };
  }
  const judged = inspectNumeric(value, classified.kind);
  if (judged.state !== "ok") {
    return { state: "invalid", value: null, unit: classified.unit, unitClass: classified.unitClass };
  }
  return {
    state: "ok",
    value: judged.value,
    unit: classified.unit,
    unitClass: classified.unitClass,
  };
}

export function measuredLabel(value, unit) {
  const judged = judgeMeasured(value, unit);
  if (judged.state !== "ok") {
    return {
      state: "invalid",
      value: null,
      unit: judged.unit,
      unitClass: judged.unitClass,
    };
  }
  const classified = classifyUnit(unit);
  const rendered = classified.kind === "integer" || classified.kind === "exact_integer"
    ? String(judged.value)
    : judged.value;
  return {
    state: "measured",
    value: rendered,
    unit: judged.unit,
    unitClass: judged.unitClass,
  };
}
