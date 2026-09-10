/**
 * Capability/discovery adapter for the Smithery MCP catalog.
 *
 * pagination.totalCount is a catalog registration count, not active traffic
 * and not a runtime heartbeat.
 */

import {
  WITHHELD_CONCLUSIONS,
  boundRawExcerpt,
  captureErrorRecord,
  classifyFetchAvailability,
  classifyProviderTimestamp,
  createEnvelope,
  createMetric,
  defaultCoverage,
  inspectNumeric,
  isPlainObject,
  specsToUnavailableMetrics,
} from "../contract.js";

export const sourceId = "smithery_mcp";
export const sourceKind = "capability_discovery";
export const upstreamUrl = "https://api.smithery.ai/servers?pageSize=1";
export const evidenceClass = "catalog_registration_count";

const POPULATION = "smithery_server_catalog";
const WINDOW = "catalog_snapshot";

export const metricSpecs = Object.freeze([
  Object.freeze({
    key: "registered_servers",
    unit: "count",
    kind: "integer",
    definition: "Smithery catalog registrations from pagination.totalCount. Not runtime heartbeats or active traffic.",
    population: POPULATION,
    window: WINDOW,
    evidenceClass,
  }),
]);

const SOURCE_WITHHELD = Object.freeze([
  ...WITHHELD_CONCLUSIONS,
  "runtime_heartbeats",
  "active_traffic",
]);

export const descriptor = Object.freeze({
  sourceId,
  sourceKind,
  upstreamUrl,
  evidenceClass,
  establishes: "Catalog registration count from Smithery servers pagination.totalCount.",
  doesNotEstablish: Object.freeze([
    "active traffic",
    "runtime heartbeats",
    "independent use",
    "demand",
    "SameDayDesk listings as live usage",
  ]),
  withheldConclusions: SOURCE_WITHHELD,
  notes: "pageSize=1 is used only to read pagination.totalCount. Server useCount is ignored.",
  metricKeys: Object.freeze(["registered_servers"]),
});

export function observe(capture, ctx = {}) {
  const fetchedAt = capture.fetchedAt ?? null;
  const fetchAvailability = classifyFetchAvailability(capture);
  const errors = [];
  const warnings = [];
  const capturedError = captureErrorRecord(capture);
  if (capturedError) errors.push(capturedError);

  const lastModified = capture.headers && capture.headers.lastModified
    ? capture.headers.lastModified
    : null;
  const lastModifiedIso = lastModified ? toIsoOrNull(lastModified) : null;
  const picked = classifyProviderTimestamp(lastModifiedIso, fetchedAt, ctx.nowMs);

  if (fetchAvailability) {
    return createEnvelope({
      sourceId,
      sourceKind,
      upstreamUrl,
      fetchedAt,
      providerTimestamp: picked.timestamp,
      providerTimestampState: lastModifiedIso ? picked.state : "missing",
      availability: fetchAvailability,
      httpStatus: capture.httpStatus ?? null,
      cache: capture.cache,
      metrics: specsToUnavailableMetrics(metricSpecs, fetchAvailability === "unavailable" ? "unavailable" : "error"),
      coverage: coverage(),
      errors,
      warnings,
      evidenceClass,
      rawSourceLink: upstreamUrl,
      withheldConclusions: SOURCE_WITHHELD,
    });
  }

  const body = capture.body;
  if (!isPlainObject(body)) {
    errors.push({ code: "schema_error", message: "smithery body is not a JSON object" });
    return finish({
      fetchedAt,
      picked: { timestamp: null, state: "missing" },
      capture,
      metrics: specsToUnavailableMetrics(metricSpecs, "error"),
      availability: "error",
      errors,
      warnings,
    });
  }

  const pagination = isPlainObject(body.pagination) ? body.pagination : null;
  if (!pagination) {
    errors.push({ code: "missing_pagination", message: "smithery payload has no pagination object" });
  }

  const rawCount = pagination ? pagination.totalCount : undefined;
  const inspected = rawCount === undefined
    ? { state: "missing", value: null }
    : inspectNumeric(rawCount, "integer");

  const metrics = [
    createMetric({
      key: "registered_servers",
      value: inspected.value,
      unit: "count",
      state: inspected.state,
      definition: metricSpecs[0].definition,
      population: POPULATION,
      window: WINDOW,
      evidenceClass,
    }),
  ];

  warnings.push({
    code: "catalog_only",
    message: "registered_servers is catalog registrations, not runtime heartbeats or active traffic",
  });
  if (inspected.state !== "ok") {
    warnings.push({
      code: inspected.state,
      metric: "registered_servers",
      message: `registered_servers is ${inspected.state}`,
    });
  }
  if (picked.state === "stale") {
    warnings.push({
      code: "stale_provider_timestamp",
      message: "Last-Modified is older than the observatory stale window",
    });
  } else if (!lastModifiedIso) {
    warnings.push({
      code: "missing_provider_timestamp",
      message: "smithery catalog payload has no provider timestamp; Last-Modified used when present",
    });
  }

  let availability = "error";
  if (inspected.state === "ok" && picked.state === "stale") availability = "stale";
  else if (inspected.state === "ok") availability = "ok";
  else if (pagination && inspected.state === "missing") availability = "partial";
  else availability = "error";

  return finish({
    fetchedAt,
    picked: lastModifiedIso ? picked : { timestamp: null, state: "missing" },
    capture,
    metrics,
    availability,
    errors,
    warnings,
    rawExcerpt: boundRawExcerpt(body),
  });
}

function finish({ fetchedAt, picked, capture, metrics, availability, errors, warnings, rawExcerpt }) {
  return createEnvelope({
    sourceId,
    sourceKind,
    upstreamUrl,
    fetchedAt,
    providerTimestamp: picked.timestamp,
    providerTimestampState: picked.state,
    availability,
    httpStatus: capture.httpStatus ?? null,
    cache: capture.cache,
    metrics,
    coverage: coverage(),
    errors,
    warnings,
    evidenceClass,
    rawSourceLink: upstreamUrl,
    withheldConclusions: SOURCE_WITHHELD,
    rawExcerpt,
  });
}

function coverage() {
  return defaultCoverage({
    kind: "catalog_registration",
    population: POPULATION,
    window: WINDOW,
    notes: "pagination.totalCount is catalog registrations, not runtime heartbeats or traffic.",
  });
}

function toIsoOrNull(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}
