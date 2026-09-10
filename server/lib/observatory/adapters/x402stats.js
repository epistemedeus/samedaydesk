/**
 * Settlement/protocol adapter for the fixed x402stats snapshot.
 *
 * Metrics are provider rolling-window aggregates. organicSellers and
 * organicVolumeUsd are provider heuristics — not unique customers or
 * organic demand proof. Do not sum with other sources.
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
  getPath,
  inspectNumeric,
  isPlainObject,
  specsToUnavailableMetrics,
} from "../contract.js";

export const sourceId = "x402stats";
export const sourceKind = "settlement";
export const upstreamUrl = "https://x402stats.io/api/stats";
export const evidenceClass = "provider_reported_onchain_aggregate";

const WINDOW_DEFAULT = "30d";
const POPULATION = "provider_indexed_protocol_activity";

export const metricSpecs = Object.freeze([
  Object.freeze({
    key: "sellers_30d",
    sourcePath: ["snapshot", "sellers"],
    unit: "count",
    kind: "integer",
    definition: "Provider-indexed sellers in the rolling window. Not unique customers.",
    population: "provider_indexed_sellers",
    window: WINDOW_DEFAULT,
    evidenceClass: "provider_reported_aggregate",
  }),
  Object.freeze({
    key: "volume_usd_30d",
    sourcePath: ["snapshot", "volumeUsd"],
    unit: "USD",
    kind: "decimal",
    definition: "Provider-reported volume USD in the rolling window. Not SameDayDesk revenue.",
    population: "provider_indexed_volume",
    window: WINDOW_DEFAULT,
    evidenceClass: "provider_reported_aggregate",
  }),
  Object.freeze({
    key: "organic_sellers_30d",
    sourcePath: ["snapshot", "organicSellers"],
    unit: "count",
    kind: "integer",
    definition: "Provider heuristic organic seller count. Not unique customers or organic demand proof.",
    population: "provider_heuristic_organic_sellers",
    window: WINDOW_DEFAULT,
    evidenceClass: "provider_heuristic",
  }),
  Object.freeze({
    key: "organic_volume_usd_30d",
    sourcePath: ["snapshot", "organicVolumeUsd"],
    unit: "USD",
    kind: "decimal",
    definition: "Provider heuristic organic volume USD. Not organic demand proof. Do not sum with other sources.",
    population: "provider_heuristic_organic_volume",
    window: WINDOW_DEFAULT,
    evidenceClass: "provider_heuristic",
  }),
  Object.freeze({
    key: "avg_payment_usd_30d",
    sourcePath: ["snapshot", "avgPaymentUsd"],
    unit: "USD",
    kind: "decimal",
    definition: "Provider-reported average payment USD in the rolling window.",
    population: POPULATION,
    window: WINDOW_DEFAULT,
    evidenceClass: "provider_reported_aggregate",
  }),
  Object.freeze({
    key: "median_seller_revenue_usd_30d",
    sourcePath: ["snapshot", "medianSellerRevenueUsd"],
    unit: "USD",
    kind: "decimal",
    definition: "Provider-reported median seller revenue USD in the rolling window.",
    population: "provider_indexed_sellers",
    window: WINDOW_DEFAULT,
    evidenceClass: "provider_reported_aggregate",
  }),
  Object.freeze({
    key: "top10_volume_share_30d",
    sourcePath: ["snapshot", "top10VolumeShare"],
    unit: "ratio",
    kind: "decimal",
    definition: "Provider-reported share of volume attributed to the top 10 sellers in the window.",
    population: POPULATION,
    window: WINDOW_DEFAULT,
    evidenceClass: "provider_reported_aggregate",
  }),
  Object.freeze({
    key: "window_days",
    sourcePath: ["snapshot", "windowDays"],
    unit: "days",
    kind: "integer",
    definition: "Provider-declared rolling window length in days.",
    population: POPULATION,
    window: WINDOW_DEFAULT,
    evidenceClass: "provider_reported_aggregate",
  }),
]);

const SOURCE_WITHHELD = Object.freeze([
  ...WITHHELD_CONCLUSIONS,
  "organic_demand_proof",
  "global_agent_traffic",
  "samedaydesk_settlement",
  "paid_demand_population",
  "repeat_demand",
  "conversion_funnel",
]);

const X402_PAID_ACTIVITY = Object.freeze({
  sourceId: "x402stats",
  available: false,
  reason:
    "x402stats snapshot has no registered-vs-paid or marketplace-vs-program split. snapshot.organicSellers and snapshot.organicVolumeUsd are provider heuristics, not paid customers.",
  populations: Object.freeze([
    Object.freeze({
      id: "provider_indexed_sellers",
      rawPath: "snapshot.sellers",
      window: WINDOW_DEFAULT,
      notes: "Provider-indexed sellers in the rolling window. Not unique customers or paid-demand proof.",
      metricKeys: Object.freeze(["sellers_30d"]),
    }),
    Object.freeze({
      id: "provider_heuristic_organic_sellers",
      rawPath: "snapshot.organicSellers",
      window: WINDOW_DEFAULT,
      notes: "Provider heuristic. Not independently verified organic demand and not a paid-customer count.",
      metricKeys: Object.freeze(["organic_sellers_30d"]),
    }),
  ]),
  ratios: Object.freeze([]),
  refusedRatios: Object.freeze([
    Object.freeze({
      key: "organicSellers_over_sellers_as_paid_conversion",
      numeratorKey: "organic_sellers_30d",
      denominatorKey: "sellers_30d",
      reason: "organicSellers is a provider heuristic, not a paid-customer population aligned with indexed sellers.",
    }),
    Object.freeze({
      key: "series_buyers_as_unique_humans",
      numeratorKey: null,
      denominatorKey: null,
      reason: "Series buyers are not summed into snapshot metrics and are not classified as unique humans.",
    }),
  ]),
  establishes: "Provider rolling-window settlement/protocol aggregates, including heuristic organic fields.",
  doesNotEstablish: Object.freeze([
    "a paid-customer population distinct from indexed sellers",
    "repeat demand",
    "unique humans",
    "SameDayDesk settlement",
  ]),
});

export const descriptor = Object.freeze({
  sourceId,
  sourceKind,
  upstreamUrl,
  evidenceClass,
  establishes: "Provider rolling-window settlement/protocol aggregates from the fixed x402stats snapshot.",
  doesNotEstablish: Object.freeze([
    "unique customers",
    "organic demand proof",
    "global agent traffic",
    "SameDayDesk settlement",
    "cross-source totals",
    "a paid-customer population distinct from indexed sellers",
    "repeat demand",
  ]),
  withheldConclusions: SOURCE_WITHHELD,
  notes: "organicSellers/organicVolumeUsd are provider heuristics. Series rows are not summed into snapshot metrics.",
  metricKeys: Object.freeze(metricSpecs.map((spec) => spec.key)),
});

export function observe(capture, ctx = {}) {
  const fetchedAt = capture.fetchedAt ?? null;
  const fetchAvailability = classifyFetchAvailability(capture);
  const errors = [];
  const warnings = [];
  const capturedError = captureErrorRecord(capture);
  if (capturedError) errors.push(capturedError);

  if (fetchAvailability) {
    return createEnvelope({
      sourceId,
      sourceKind,
      upstreamUrl,
      fetchedAt,
      providerTimestamp: null,
      providerTimestampState: "missing",
      availability: fetchAvailability,
      httpStatus: capture.httpStatus ?? null,
      cache: capture.cache,
      metrics: specsToUnavailableMetrics(metricSpecs, fetchAvailability === "unavailable" ? "unavailable" : "error"),
      coverage: coverageFor(null),
      errors,
      warnings,
      evidenceClass,
      rawSourceLink: upstreamUrl,
      withheldConclusions: SOURCE_WITHHELD,
      paidActivity: X402_PAID_ACTIVITY,
    });
  }

  const body = capture.body;
  if (!isPlainObject(body)) {
    errors.push({ code: "schema_error", message: "x402stats body is not a JSON object" });
    return createEnvelope({
      sourceId,
      sourceKind,
      upstreamUrl,
      fetchedAt,
      providerTimestamp: null,
      providerTimestampState: "missing",
      availability: "error",
      httpStatus: capture.httpStatus ?? null,
      cache: capture.cache,
      metrics: specsToUnavailableMetrics(metricSpecs, "error"),
      coverage: coverageFor(null),
      errors,
      warnings,
      evidenceClass,
      rawSourceLink: upstreamUrl,
      withheldConclusions: SOURCE_WITHHELD,
      rawExcerpt: boundRawExcerpt(capture.body ?? capture.rawText),
      paidActivity: X402_PAID_ACTIVITY,
    });
  }

  const snapshot = isPlainObject(body.snapshot) ? body.snapshot : null;
  const windowDays = snapshot ? inspectNumeric(snapshot.windowDays, "integer") : { state: "missing", value: null };
  const windowLabel = windowDays.state === "ok" && windowDays.value > 0 ? `${windowDays.value}d` : null;

  const computedAt = snapshot && typeof snapshot.computedAt === "string" ? snapshot.computedAt : null;
  const updatedAt = typeof body.updatedAt === "string" ? body.updatedAt : null;
  const rawTimestamp = computedAt || updatedAt;
  const picked = classifyProviderTimestamp(rawTimestamp, fetchedAt, ctx.nowMs);

  if (!snapshot) {
    errors.push({ code: "missing_snapshot", message: "x402stats payload has no snapshot object" });
  }
  if (picked.state === "stale") {
    warnings.push({
      code: "stale_provider_timestamp",
      message: "provider timestamp is older than the observatory stale window",
    });
  } else if (picked.state === "missing") {
    warnings.push({
      code: "missing_provider_timestamp",
      message: "provider payload did not include a usable timestamp",
    });
  } else if (picked.state === "invalid") {
    warnings.push({
      code: "invalid_provider_timestamp",
      message: "provider timestamp was present but not a usable clock",
    });
  }
  if (computedAt && updatedAt && computedAt !== updatedAt) {
    warnings.push({
      code: "timestamp_pair",
      message: "updatedAt and snapshot.computedAt both present; observatory uses computedAt",
    });
  }
  warnings.push({
    code: "provider_heuristic",
    message: "organicSellers and organicVolumeUsd are provider heuristics, not unique customers or organic demand proof",
  });

  const metrics = metricSpecs.map((spec) => {
    const raw = snapshot ? getPath({ snapshot }, spec.sourcePath) : undefined;
    const inspected = raw === undefined
      ? { state: "missing", value: null }
      : inspectNumeric(raw, spec.kind);
    return createMetric({
      key: spec.key,
      value: inspected.value,
      unit: spec.unit,
      state: (spec.key === "window_days" && inspected.value === 0) || (spec.unit === "ratio" && Number(inspected.value) > 1) ? "invalid" : inspected.state,
      definition: spec.definition,
      population: spec.population,
      window: windowLabel,
      evidenceClass: spec.evidenceClass,
    });
  });

  for (const metric of metrics) {
    if (metric.state !== "ok") {
      warnings.push({
        code: metric.state,
        metric: metric.key,
        message: `${metric.key} is ${metric.state}`,
      });
    }
  }

  const availability = resolveAvailability({ snapshot, picked, metrics });

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
    coverage: coverageFor(windowLabel),
    errors,
    warnings,
    evidenceClass,
    rawSourceLink: upstreamUrl,
    withheldConclusions: SOURCE_WITHHELD,
    rawExcerpt: boundRawExcerpt(body),
    paidActivity: X402_PAID_ACTIVITY,
  });
}

function resolveAvailability({ snapshot, picked, metrics }) {
  if (!snapshot) return "error";
  if (picked.state === "stale") return "stale";
  const okCount = metrics.filter((metric) => metric.state === "ok").length;
  const bad = metrics.filter((metric) => metric.state !== "ok" && metric.state !== "missing").length;
  const missing = metrics.filter((metric) => metric.state === "missing").length;
  if (okCount === 0) return "error";
  if (bad > 0 || missing > 0 || picked.state === "invalid") return "partial";
  return "ok";
}

function coverageFor(windowLabel) {
  return defaultCoverage({
    kind: "provider_rolling_window",
    population: POPULATION,
    window: windowLabel,
    notes: "Provider rolling-window aggregates. Not additive with other sources. Organic fields are heuristics. No registered-vs-paid population is present.",
  });
}
