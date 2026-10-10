/**
 * Provider-neutral on-demand observation envelope.
 *
 * Unavailable, partial, and stale are not zeros. Provider timestamps stay
 * distinct from observer fetchedAt. Sources are not additive.
 */

import { classifyUnit, inspectNumeric, judgeMeasured } from "./measurement.js";

export { inspectNumeric };

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

export function judgeMetric(fields) {
  const source = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
  const key = typeof source.key === "string" && source.key ? source.key : "unknown";
  const classified = classifyUnit(source.unit);
  let state = "invalid";
  if (classified.unitClass === "invalid") state = "invalid";
  else if (source.state == null || source.state === "") state = "missing";
  else if (typeof source.state === "string" && METRIC_STATES.includes(source.state)) state = source.state;
  let value = null;
  if (state === "ok") {
    const judged = judgeMeasured(source.value, source.unit);
    state = judged.state === "ok" ? "ok" : "invalid";
    value = judged.state === "ok" ? judged.value : null;
  }
  const population = typeof source.population === "string" ? source.population : null;
  const window = typeof source.window === "string" ? source.window : null;
  return {
    key,
    state,
    value,
    unit: classified.unit,
    unitClass: classified.unitClass,
    population,
    window,
  };
}

export function createMetric(fields) {
  const source = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
  const judged = judgeMetric(source);
  const metric = {
    key: judged.key,
    value: judged.value,
    unit: judged.unit,
    unitClass: judged.unitClass,
    state: judged.state,
    definition: typeof source.definition === "string" ? source.definition : null,
    population: judged.population,
    window: judged.window,
  };
  if (source.evidenceClass) metric.evidenceClass = source.evidenceClass;
  if (source.sourcePath) metric.sourcePath = source.sourcePath;
  if (source.ratioAlignment) metric.ratioAlignment = source.ratioAlignment;
  if (source.numeratorKey) metric.numeratorKey = source.numeratorKey;
  if (source.denominatorKey) metric.denominatorKey = source.denominatorKey;
  if (source.sample !== undefined) metric.sample = source.sample;
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
  if (fields.workload != null) envelope.workload = cloneRaw(fields.workload);
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

