/**
 * Provider-neutral on-demand observation envelope.
 *
 * Unavailable, partial, and stale are not zeros. Provider timestamps stay
 * distinct from observer fetchedAt. Sources are not additive.
 */

export const SCHEMA_VERSION = "pilot.external-observatory.v1";

export const SOURCE_KINDS = Object.freeze([
  "work_market",
  "settlement",
  "capability_discovery",
]);

export const AVAILABILITIES = Object.freeze([
  "ok",
  "partial",
  "unavailable",
  "stale",
  "error",
]);

export const PROVIDER_TIMESTAMP_STATES = Object.freeze([
  "ok",
  "missing",
  "stale",
  "invalid",
]);

export const METRIC_STATES = Object.freeze([
  "ok",
  "missing",
  "invalid",
  "unavailable",
  "error",
  "nonfinite",
  "negative",
  "overflow",
  "schema_drift",
  "contradictory",
  "source_error",
]);

export const WITHHELD_CONCLUSIONS = Object.freeze([
  "agent_traffic",
  "customers",
  "unique_customers",
  "profit",
  "demand",
  "organic_demand",
  "repeat_demand",
  "conversion_funnel",
  "paid_demand_population",
  "revenue",
  "settlement",
  "independent_use",
  "cross_source_total",
  "runtime_heartbeats",
  "active_traffic",
]);

export const STALE_PROVIDER_MS = 2 * 60 * 60 * 1000;
export const MAX_RAW_EXCERPT_BYTES = 2048;
export const FUTURE_SKEW_MS = 2 * 60 * 1000;

export const DOCUMENTED_UNAVAILABLE_SOURCES = Object.freeze([
  Object.freeze({
    sourceId: "x402scan",
    sourceKind: "settlement",
    availability: "unavailable",
    called: false,
    reason: "x402scan data endpoints require micropayment; documented only, never called as success",
    withheldConclusions: WITHHELD_CONCLUSIONS,
  }),
]);

const PROTO = new Set(["__proto__", "prototype", "constructor"]);
const INTEGER_RE = /^(0|[1-9][0-9]*)$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_SAFE_TEXT = String(MAX_SAFE);

export function createMetric(fields) {
  const state = fields.state || "missing";
  const ok = state === "ok";
  const metric = {
    key: fields.key,
    value: ok ? (fields.value === undefined ? null : fields.value) : null,
    unit: fields.unit ?? null,
    state,
    definition: fields.definition ?? null,
    population: fields.population ?? null,
    window: fields.window ?? null,
  };
  if (fields.evidenceClass) metric.evidenceClass = fields.evidenceClass;
  if (fields.sourcePath) metric.sourcePath = fields.sourcePath;
  if (fields.ratioAlignment) metric.ratioAlignment = fields.ratioAlignment;
  if (fields.numeratorKey) metric.numeratorKey = fields.numeratorKey;
  if (fields.denominatorKey) metric.denominatorKey = fields.denominatorKey;
  if (fields.sample !== undefined) metric.sample = fields.sample;
  return metric;
}

export function specsToUnavailableMetrics(specs, state = "unavailable") {
  return (specs || []).map((spec) => createMetric({
    key: spec.key,
    value: null,
    unit: spec.unit,
    state,
    definition: spec.definition,
    population: spec.population,
    window: spec.window,
    evidenceClass: spec.evidenceClass,
  }));
}

export function createEnvelope(fields) {
  const metrics = Array.isArray(fields.metrics)
    ? fields.metrics.map((metric) => sanitizeMetric(metric))
    : [];
  const envelope = {
    schemaVersion: SCHEMA_VERSION,
    sourceId: fields.sourceId,
    sourceKind: fields.sourceKind,
    upstreamUrl: fields.upstreamUrl,
    fetchedAt: fields.fetchedAt ?? null,
    providerTimestamp: fields.providerTimestamp ?? null,
    providerTimestampState: fields.providerTimestampState || "missing",
    availability: fields.availability,
    httpStatus: Number.isInteger(fields.httpStatus) ? fields.httpStatus : null,
    cache: normalizeCache(fields.cache, fields.fetchedAt),
    metrics,
    coverage: fields.coverage ?? defaultCoverage(),
    errors: Array.isArray(fields.errors) ? fields.errors.map((item) => cloneRaw(item)) : [],
    warnings: Array.isArray(fields.warnings) ? fields.warnings.map((item) => cloneRaw(item)) : [],
    evidenceClass: fields.evidenceClass ?? null,
    rawSourceLink: fields.rawSourceLink ?? fields.upstreamUrl ?? null,
    withheldConclusions: Array.isArray(fields.withheldConclusions)
      ? fields.withheldConclusions.slice()
      : WITHHELD_CONCLUSIONS.slice(),
  };
  if (fields.rawExcerpt != null) envelope.rawExcerpt = fields.rawExcerpt;
  if (fields.paidActivity != null) envelope.paidActivity = cloneRaw(fields.paidActivity);
  return freezeDeep(envelope);
}

export function createSnapshot(fields) {
  return freezeDeep({
    schemaVersion: SCHEMA_VERSION,
    fetchedAt: fields.fetchedAt ?? null,
    additivity: "not_additive",
    observations: Array.isArray(fields.observations) ? fields.observations : [],
    documentedUnavailable: fields.documentedUnavailable ?? DOCUMENTED_UNAVAILABLE_SOURCES,
  });
}

export function createCatalog(sources) {
  return freezeDeep({
    schemaVersion: SCHEMA_VERSION,
    additivity: "not_additive",
    sources: Array.isArray(sources) ? sources : [],
    documentedUnavailable: DOCUMENTED_UNAVAILABLE_SOURCES,
  });
}

export function classifyFetchAvailability(capture) {
  if (!capture) return "error";
  const status = Number.isInteger(capture.httpStatus) ? capture.httpStatus : null;
  const code = capture.error && capture.error.code ? String(capture.error.code) : null;
  if (code === "timeout" || code === "network" || code === "aborted") return "unavailable";
  if (code === "rate_limited" || status === 429) return "unavailable";
  if (status === 429) return "unavailable";
  if (code) return "error";
  if (status != null && status !== 200) return "unavailable";
  return null;
}

export function classifyProviderTimestamp(raw, fetchedAt, nowMs) {
  if (raw == null || raw === "") return { timestamp: null, state: "missing" };
  if (typeof raw !== "string") return { timestamp: null, state: "invalid" };
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return { timestamp: null, state: "invalid" };
  const timestamp = new Date(parsed).toISOString();
  const fetchedMs = typeof fetchedAt === "string" ? Date.parse(fetchedAt) : Number.NaN;
  const referenceMs = Number.isFinite(fetchedMs)
    ? fetchedMs
    : (typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now());
  if (parsed - referenceMs > FUTURE_SKEW_MS) return { timestamp, state: "invalid" };
  if (referenceMs - parsed > STALE_PROVIDER_MS) return { timestamp, state: "stale" };
  return { timestamp, state: "ok" };
}

export function inspectNumeric(raw, kind) {
  if (raw === null || raw === undefined) return { state: "missing", value: null };
  if (typeof raw === "boolean" || typeof raw === "function" || typeof raw === "symbol") {
    return { state: "invalid", value: null };
  }
  if (typeof raw === "object") return { state: "invalid", value: null };

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { state: "invalid", value: null };
    if (raw < 0) return { state: "invalid", value: null };
    if (kind === "integer") {
      if (!Number.isInteger(raw) || !Number.isSafeInteger(raw)) return { state: "invalid", value: null };
      return { state: "ok", value: raw };
    }
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
      if (!INTEGER_RE.test(text)) return { state: "invalid", value: null };
      if (integerTextOverflows(text)) return { state: "invalid", value: null };
      return { state: "ok", value: Number(text) };
    }
    if (!DECIMAL_RE.test(text)) return { state: "invalid", value: null };
    const whole = text.split(".")[0];
    if (integerTextOverflows(whole)) return { state: "invalid", value: null };
    return { state: "ok", value: text };
  }

  return { state: "invalid", value: null };
}

export function boundRawExcerpt(value, maxBytes = MAX_RAW_EXCERPT_BYTES) {
  if (value == null) return undefined;
  let text;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  const buf = Buffer.from(text, "utf8");
  if (buf.byteLength <= maxBytes) return text;
  return buf.subarray(0, maxBytes).toString("utf8");
}

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) && !PROTO.has(key);
}

export function getPath(object, path) {
  let current = object;
  for (const key of path) {
    if (!isPlainObject(current) || !hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

export function cloneRaw(value) {
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

export function freezeDeep(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
  } else {
    for (const key of Object.keys(value)) freezeDeep(value[key]);
  }
  return Object.freeze(value);
}

export function defaultCoverage(extra = {}) {
  return Object.freeze({
    kind: extra.kind || "point_snapshot",
    complete: false,
    additivity: "not_additive",
    population: extra.population ?? null,
    window: extra.window ?? null,
    notes: extra.notes ?? "Observations are not additive across sources.",
  });
}

export function captureErrorRecord(capture) {
  if (!capture || !capture.error) return null;
  return cloneRaw(capture.error);
}

function sanitizeMetric(metric) {
  if (!metric || typeof metric !== "object") {
    return createMetric({ key: "unknown", state: "invalid" });
  }
  return createMetric(metric);
}

function normalizeCache(cache, fetchedAt) {
  const base = cache && typeof cache === "object" ? cache : {};
  return {
    hit: Boolean(base.hit),
    ageMs: Number.isFinite(base.ageMs) ? base.ageMs : null,
    stale: Boolean(base.stale),
    ttlMs: Number.isFinite(base.ttlMs) ? base.ttlMs : null,
    fetchedAt: base.fetchedAt ?? fetchedAt ?? null,
  };
}

function integerTextOverflows(text) {
  if (text.length < MAX_SAFE_TEXT.length) return false;
  if (text.length > MAX_SAFE_TEXT.length) return true;
  return text > MAX_SAFE_TEXT;
}
