/**
 * Provider-neutral market-stats normalizer.
 *
 * Input is a labelled capture, not a provider vocabulary. MoltJobs names such
 * as totalJobs/totalAgents must be mapped by an adapter before this function.
 * One capture is one observation: this module does not invent a time series,
 * does not copy fetchedAt onto sourceTime, and does not treat missing as zero.
 */

export const SCHEMA_VERSION = "pilot.market-observation.v1";

export const METRIC_STATES = Object.freeze([
  "ok",
  "missing",
  "nonfinite",
  "negative",
  "overflow",
  "schema_drift",
  "contradictory",
  "source_error",
  "unavailable",
]);

export const WITHHELD_CONCLUSIONS = Object.freeze([
  "agent_traffic",
  "customers",
  "profit",
  "demand",
  "revenue",
  "settlement",
  "independent_use",
]);

const PROTO = new Set(["__proto__", "prototype", "constructor"]);
const INTEGER_RE = /^(0|[1-9][0-9]*)$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SCIENTIFIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?\d+$/;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_SAFE_TEXT = String(MAX_SAFE);
const IMPLICIT_WINDOW = Object.freeze({ implicitSnapshot: true });

const RESERVED_BODY_KEYS = new Set([
  "sourceTime",
  "window",
  "windowId",
  "windowStart",
  "windowEnd",
  "windows",
]);

export const SOURCE_METRIC_SPECS = Object.freeze([
  Object.freeze({ key: "jobCount", unit: "count", kind: "integer" }),
  Object.freeze({ key: "completedCount", unit: "count", kind: "integer" }),
  Object.freeze({ key: "registeredAgents", unit: "count", kind: "integer" }),
  Object.freeze({ key: "posts", unit: "count", kind: "integer" }),
  Object.freeze({ key: "completionSampleSize", unit: "count", kind: "integer" }),
  Object.freeze({ key: "escrowDeposits", unit: "USDC", kind: "decimal" }),
  Object.freeze({ key: "settledTransfers", unit: "USDC", kind: "decimal" }),
  Object.freeze({ key: "volumeUsdc", unit: "USDC", kind: "decimal" }),
  Object.freeze({ key: "avgCompletionTimeMs", unit: "ms", kind: "integer" }),
  Object.freeze({ key: "medianCompletionTimeMs", unit: "ms", kind: "integer" }),
  Object.freeze({ key: "avgTimeToFillMs", unit: "ms", kind: "integer" }),
  Object.freeze({ key: "medianTimeToFillMs", unit: "ms", kind: "integer" }),
  Object.freeze({ key: "disputeRate", unit: "ratio", kind: "decimal" }),
]);

export const DERIVED_METRIC_SPECS = Object.freeze([
  Object.freeze({
    key: "completionRatio",
    unit: "ratio",
    numeratorKey: "completedCount",
    denominatorKey: "jobCount",
    subsetInvariant: true,
  }),
  Object.freeze({
    key: "escrowToVolumeRatio",
    unit: "ratio",
    numeratorKey: "escrowDeposits",
    denominatorKey: "volumeUsdc",
    subsetInvariant: false,
  }),
]);

export const LABELLED_FIELD_KEYS = Object.freeze(
  SOURCE_METRIC_SPECS.map((spec) => spec.key),
);

const SOURCE_SPEC_BY_KEY = new Map(SOURCE_METRIC_SPECS.map((spec) => [spec.key, spec]));

export function normalizeMarketStats(payload) {
  if (!isPlainObject(payload)) {
    throw new TypeError("labelled payload must be a plain object");
  }

  const providerId = typeof payload.providerId === "string" && payload.providerId
    ? payload.providerId
    : "unknown";
  const fetchedAt = typeof payload.fetchedAt === "string" && payload.fetchedAt
    ? payload.fetchedAt
    : null;
  const sourceUrl = typeof payload.sourceUrl === "string" && payload.sourceUrl
    ? payload.sourceUrl
    : null;
  const httpStatus = Number.isInteger(payload.httpStatus) ? payload.httpStatus : null;
  const error = cloneRaw(payload.error);
  const bodyResult = coerceBody(payload.body);
  const envelope = classifyEnvelope(httpStatus, bodyResult, error);

  let sourceTime = null;
  let sourceTimeState = "missing";
  if (envelope.availability === "ok" && bodyResult.kind === "object") {
    const picked = pickSourceTime(bodyResult.value);
    sourceTime = picked.sourceTime;
    sourceTimeState = picked.state;
  }

  const metrics = [];
  const byKey = Object.create(null);

  if (envelope.availability !== "ok") {
    for (const spec of SOURCE_METRIC_SPECS) {
      pushMetric(metrics, byKey, metricRecord(spec.key, null, null, spec.unit, envelope.metricState));
    }
    for (const spec of DERIVED_METRIC_SPECS) {
      pushMetric(metrics, byKey, metricRecord(spec.key, null, null, spec.unit, envelope.metricState));
    }
  } else {
    const body = bodyResult.value;
    for (const spec of SOURCE_METRIC_SPECS) {
      const present = hasOwn(body, spec.key);
      const raw = present ? body[spec.key] : undefined;
      const inspected = present ? inspectNumeric(raw, spec.kind) : { state: "missing", value: null };
      let state = inspected.state;
      let value = inspected.value;
      if (spec.key === "disputeRate" && state === "ok" && ratioExceedsOne(value)) {
        state = "contradictory";
        value = null;
      }
      pushMetric(metrics, byKey, metricRecord(spec.key, present ? raw : null, value, spec.unit, state));
    }

    applyCompletionSampleInvariant(metrics, byKey);

    const extraKeys = Object.keys(body)
      .filter((key) => !PROTO.has(key) && !RESERVED_BODY_KEYS.has(key) && !SOURCE_SPEC_BY_KEY.has(key))
      .sort();
    for (const key of extraKeys) {
      pushMetric(
        metrics,
        byKey,
        metricRecord(key, body[key], null, "unknown", "schema_drift"),
      );
    }

    for (const spec of DERIVED_METRIC_SPECS) {
      pushMetric(metrics, byKey, deriveRatio(spec, byKey, body));
    }
  }

  const observation = {
    schemaVersion: SCHEMA_VERSION,
    providerId,
    fetchedAt,
    sourceTime,
    sourceUrl,
    httpStatus,
    availability: envelope.availability,
    evidencePlane: "provider_reported_aggregate",
    disposition: "context_only",
    additivity: "not_additive",
    coverage: Object.freeze({
      kind: "point_snapshot",
      complete: false,
      additivity: "not_additive",
    }),
    freshness: Object.freeze({
      fetchedAt,
      sourceTime,
      sourceTimeState,
      basis: "provider_source_time",
      sourceTimeRequired: false,
    }),
    withheldConclusions: WITHHELD_CONCLUSIONS,
    error: envelope.error ?? error,
    raw: cloneRaw(bodyResult.raw),
    metrics,
    metricsByKey: Object.freeze(byKey),
  };

  return freezeDeep(observation);
}

export function getMetric(observation, key) {
  if (!observation || !Array.isArray(observation.metrics)) return null;
  for (const entry of observation.metrics) {
    if (entry && entry.key === key) return entry;
  }
  return null;
}

function classifyEnvelope(httpStatus, bodyResult, error) {
  if (httpStatus !== 200) {
    return { availability: "unavailable", metricState: "unavailable", error };
  }
  if (bodyResult.kind === "malformed") {
    return {
      availability: "source_error",
      metricState: "source_error",
      error: error ?? Object.freeze({ code: "malformed_json" }),
    };
  }
  if (bodyResult.kind === "empty") {
    return { availability: "unavailable", metricState: "unavailable", error };
  }
  if (bodyResult.kind === "drift") {
    return {
      availability: "source_error",
      metricState: "schema_drift",
      error: error ?? Object.freeze({ code: "schema_drift" }),
    };
  }
  return { availability: "ok", metricState: "ok", error };
}

function coerceBody(body) {
  if (body === undefined || body === null) {
    return { kind: "empty", value: null, raw: null };
  }
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (trimmed === "") return { kind: "empty", value: null, raw: body };
    try {
      const parsed = JSON.parse(trimmed);
      const inner = coerceParsed(parsed);
      return { ...inner, raw: parsed };
    } catch {
      return { kind: "malformed", value: null, raw: body };
    }
  }
  const inner = coerceParsed(body);
  return { ...inner, raw: body };
}

function coerceParsed(value) {
  if (value === null || value === undefined) return { kind: "empty", value: null };
  if (isPlainObject(value)) return { kind: "object", value };
  return { kind: "drift", value };
}

function pickSourceTime(body) {
  if (!hasOwn(body, "sourceTime") || body.sourceTime === null || body.sourceTime === undefined) {
    return { sourceTime: null, state: "missing" };
  }
  const raw = body.sourceTime;
  if (typeof raw !== "string" || raw.trim() === "") {
    return { sourceTime: null, state: "schema_drift" };
  }
  return { sourceTime: raw, state: "ok" };
}

function inspectNumeric(raw, kind) {
  if (raw === null || raw === undefined) return { state: "missing", value: null };
  if (typeof raw === "boolean" || typeof raw === "function" || typeof raw === "symbol") {
    return { state: "schema_drift", value: null };
  }
  if (typeof raw === "object") return { state: "schema_drift", value: null };

  if (typeof raw === "bigint") {
    if (raw < 0n) return { state: "negative", value: null };
    if (raw > BigInt(MAX_SAFE)) return { state: "overflow", value: null };
    return kind === "integer"
      ? { state: "ok", value: Number(raw) }
      : { state: "ok", value: String(raw) };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { state: "nonfinite", value: null };
    if (raw < 0) return { state: "negative", value: null };
    if (kind === "integer") {
      if (!Number.isInteger(raw)) return { state: "schema_drift", value: null };
      if (!Number.isSafeInteger(raw)) return { state: "overflow", value: null };
      return { state: "ok", value: raw };
    }
    if (raw > MAX_SAFE) return { state: "overflow", value: null };
    const text = decimalFromNumber(raw);
    if (text == null) return { state: "overflow", value: null };
    return { state: "ok", value: text };
  }

  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "") return { state: "schema_drift", value: null };
    if (text === "NaN" || text === "Infinity" || text === "+Infinity" || text === "-Infinity") {
      return { state: "nonfinite", value: null };
    }
    if (SCIENTIFIC_RE.test(text)) {
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) return { state: "nonfinite", value: null };
      if (parsed < 0) return { state: "negative", value: null };
      return { state: "overflow", value: null };
    }
    if (text.startsWith("-")) {
      const rest = text.slice(1);
      if (INTEGER_RE.test(rest) || DECIMAL_RE.test(rest)) return { state: "negative", value: null };
      return { state: "schema_drift", value: null };
    }
    if (kind === "integer") {
      if (!INTEGER_RE.test(text)) return { state: "schema_drift", value: null };
      if (integerTextOverflows(text)) return { state: "overflow", value: null };
      return { state: "ok", value: Number(text) };
    }
    if (!DECIMAL_RE.test(text)) return { state: "schema_drift", value: null };
    const whole = text.split(".")[0];
    if (integerTextOverflows(whole)) return { state: "overflow", value: null };
    return { state: "ok", value: text };
  }

  return { state: "schema_drift", value: null };
}

function decimalFromNumber(value) {
  if (Number.isInteger(value) && Number.isSafeInteger(value)) return String(value);
  const text = String(value);
  return DECIMAL_RE.test(text) ? text : null;
}

function integerTextOverflows(text) {
  if (text.length < MAX_SAFE_TEXT.length) return false;
  if (text.length > MAX_SAFE_TEXT.length) return true;
  return text > MAX_SAFE_TEXT;
}

function ratioExceedsOne(value) {
  const rational = toRational(value);
  if (!rational) return false;
  return rational.n > rational.d;
}

function toRational(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return { n: BigInt(value), d: 1n };
  }
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  const denom = 10n ** BigInt(frac.length);
  return { n: BigInt(whole + frac), d: denom };
}

function rationalsGreater(a, b) {
  return a.n * b.d > b.n * a.d;
}

function isZeroRational(value) {
  const rational = toRational(value);
  return Boolean(rational && rational.n === 0n);
}

function applyCompletionSampleInvariant(metrics, byKey) {
  const sample = byKey.completionSampleSize;
  const completed = byKey.completedCount;
  if (!sample || !completed || sample.state !== "ok" || completed.state !== "ok") return;
  if (sample.value <= completed.value) return;
  for (const key of ["avgCompletionTimeMs", "medianCompletionTimeMs"]) {
    const entry = byKey[key];
    if (entry && entry.state === "ok") {
      const replacement = metricRecord(entry.key, entry.raw, null, entry.unit, "contradictory");
      byKey[key] = replacement;
      const index = metrics.findIndex((item) => item.key === key);
      if (index >= 0) metrics[index] = replacement;
    }
  }
}

function deriveRatio(spec, byKey, body) {
  const numerator = byKey[spec.numeratorKey];
  const denominator = byKey[spec.denominatorKey];
  const unit = spec.unit;
  const raw = Object.freeze({
    numeratorKey: spec.numeratorKey,
    denominatorKey: spec.denominatorKey,
    numerator: numerator ? numerator.raw : null,
    denominator: denominator ? denominator.raw : null,
  });

  if (!numerator || !denominator) {
    return metricRecord(spec.key, raw, null, unit, "missing");
  }
  if (numerator.state === "missing" || denominator.state === "missing") {
    return metricRecord(spec.key, raw, null, unit, "missing");
  }
  if (numerator.state !== "ok" || denominator.state !== "ok") {
    return metricRecord(spec.key, raw, null, unit, "contradictory");
  }
  if (!sameWindow(windowRef(body, spec.numeratorKey), windowRef(body, spec.denominatorKey))) {
    return metricRecord(spec.key, raw, null, unit, "contradictory");
  }
  if (isZeroRational(denominator.value)) {
    return metricRecord(spec.key, raw, null, unit, "contradictory");
  }

  const numRational = toRational(numerator.value);
  const denRational = toRational(denominator.value);
  if (!numRational || !denRational) {
    return metricRecord(spec.key, raw, null, unit, "contradictory");
  }
  if (spec.subsetInvariant && rationalsGreater(numRational, denRational)) {
    return metricRecord(spec.key, raw, null, unit, "contradictory");
  }

  return metricRecord(
    spec.key,
    raw,
    `${numerator.value}/${denominator.value}`,
    unit,
    "ok",
  );
}

function windowRef(body, key) {
  if (!isPlainObject(body)) return IMPLICIT_WINDOW;
  if (isPlainObject(body.windows) && hasOwn(body.windows, key)) return body.windows[key];
  if (body.windowId !== undefined) return body.windowId;
  if (body.window !== undefined) return body.window;
  if (body.windowStart !== undefined || body.windowEnd !== undefined) {
    return { start: body.windowStart ?? null, end: body.windowEnd ?? null };
  }
  return IMPLICIT_WINDOW;
}

function sameWindow(left, right) {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function metricRecord(key, raw, value, unit, state) {
  return {
    key,
    raw: raw === undefined ? null : cloneRaw(raw),
    value,
    unit,
    state,
  };
}

function pushMetric(metrics, byKey, entry) {
  metrics.push(entry);
  byKey[entry.key] = entry;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function cloneRaw(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => cloneRaw(item));
  const out = {};
  for (const key of Object.keys(value)) {
    if (PROTO.has(key)) continue;
    out[key] = cloneRaw(value[key]);
  }
  return out;
}

function freezeDeep(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}
