/**
 * Work-market adapter: wraps S49 MoltJobs capture→normalize into the
 * observatory envelope. Does not invent sourceTime or treat missing as zero.
 */

import {
  MOLTJOBS_PROVIDER_ID,
  MOLTJOBS_STATS_SOURCE_URL,
  moltjobsCaptureToLabelledPayload,
} from "../../market-observations/moltjobs-stats-adapter.js";
import { normalizeMarketStats } from "../../market-observations/normalize-market-stats.js";
import {
  WITHHELD_CONCLUSIONS,
  boundRawExcerpt,
  captureErrorRecord,
  classifyFetchAvailability,
  classifyProviderTimestamp,
  createEnvelope,
  createMetric,
  defaultCoverage,
  isPlainObject,
} from "../contract.js";

export const sourceId = "moltjobs";
export const sourceKind = "work_market";
export const upstreamUrl = MOLTJOBS_STATS_SOURCE_URL;
export const evidenceClass = "provider_reported_aggregate";

const WINDOW = "unspecified_provider_snapshot";
const POPULATION = "moltjobs_work_market";

const DEFINITIONS = Object.freeze({
  jobCount: "Provider-reported totalJobs mapped to jobCount. Work-market snapshot, not traffic.",
  completedCount: "Provider-reported totalCompleted. Not delivery proof for SameDayDesk.",
  registeredAgents: "Provider-reported totalAgents. Registered agents, not active traffic.",
  volumeUsdc: "Provider-reported totalVolumeUsdc. Provider aggregate, not SameDayDesk revenue.",
  escrowDeposits: "Provider-reported escrowedUsdc. Not settled SameDayDesk funds.",
  avgCompletionTimeMs: "Provider-reported average completion time in milliseconds.",
  medianCompletionTimeMs: "Provider-reported median completion time in milliseconds.",
  avgTimeToFillMs: "Provider-reported average time-to-fill in milliseconds.",
  medianTimeToFillMs: "Provider-reported median time-to-fill in milliseconds.",
  completionSampleSize: "Provider-reported sample size for completion timing stats.",
  disputeRate: "Provider-reported dispute rate. Not a SameDayDesk quality score.",
  completionRatio: "Derived completedCount/jobCount when both are ok on the same window.",
  escrowToVolumeRatio: "Derived escrowDeposits/volumeUsdc when both are ok on the same window.",
});

const OBSERVED_KEYS = Object.freeze([
  "jobCount",
  "completedCount",
  "registeredAgents",
  "volumeUsdc",
  "escrowDeposits",
  "avgCompletionTimeMs",
  "medianCompletionTimeMs",
  "avgTimeToFillMs",
  "medianTimeToFillMs",
  "completionSampleSize",
  "disputeRate",
  "completionRatio",
  "escrowToVolumeRatio",
]);

const CORE_KEYS = Object.freeze([
  "jobCount",
  "completedCount",
  "registeredAgents",
  "volumeUsdc",
  "escrowDeposits",
]);

export const metricSpecs = Object.freeze(
  OBSERVED_KEYS.map((key) => Object.freeze({
    key,
    unit: unitFor(key),
    definition: DEFINITIONS[key],
    population: POPULATION,
    window: WINDOW,
  })),
);

export const descriptor = Object.freeze({
  sourceId,
  sourceKind,
  upstreamUrl,
  evidenceClass,
  establishes: "Provider-reported MoltJobs /v1/stats work-market aggregates for one snapshot.",
  doesNotEstablish: Object.freeze([
    "agent traffic",
    "unique customers",
    "organic demand",
    "SameDayDesk revenue",
    "settlement",
    "cross-market totals",
  ]),
  withheldConclusions: WITHHELD_CONCLUSIONS,
  notes: "Compatible with /api/market-observations/moltjobs-stats. Missing metrics stay null, not zero.",
  metricKeys: OBSERVED_KEYS,
});

export function observe(capture, ctx = {}) {
  const labelled = moltjobsCaptureToLabelledPayload({
    providerId: MOLTJOBS_PROVIDER_ID,
    fetchedAt: capture.fetchedAt ?? null,
    sourceUrl: capture.sourceUrl ?? upstreamUrl,
    httpStatus: capture.httpStatus ?? null,
    body: capture.body,
    error: capture.error ?? null,
  });
  const observation = normalizeMarketStats(labelled);
  const fetchedAt = observation.fetchedAt ?? capture.fetchedAt ?? null;
  const picked = classifyProviderTimestamp(observation.sourceTime, fetchedAt, ctx.nowMs);
  const fetchAvailability = classifyFetchAvailability(capture);

  const metrics = OBSERVED_KEYS.map((key) => {
    const src = observation.metricsByKey ? observation.metricsByKey[key] : null;
    const state = src && src.state ? src.state : (fetchAvailability || "missing");
    return createMetric({
      key,
      value: src ? src.value : null,
      unit: src && src.unit ? src.unit : unitFor(key),
      state,
      definition: DEFINITIONS[key],
      population: POPULATION,
      window: windowFromBody(labelled.body) || WINDOW,
    });
  });

  const availability = resolveAvailability({
    fetchAvailability,
    observationAvailability: observation.availability,
    providerTimestampState: picked.state,
    metrics,
  });

  const errors = [];
  const warnings = [];
  const capturedError = captureErrorRecord(capture);
  if (capturedError) errors.push(capturedError);
  else if (observation.error) errors.push(observation.error);
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
  for (const metric of metrics) {
    if (metric.state !== "ok") {
      warnings.push({
        code: metric.state,
        metric: metric.key,
        message: `${metric.key} is ${metric.state}`,
      });
    }
  }

  return createEnvelope({
    sourceId,
    sourceKind,
    upstreamUrl,
    fetchedAt,
    providerTimestamp: picked.timestamp,
    providerTimestampState: picked.state,
    availability,
    httpStatus: observation.httpStatus ?? capture.httpStatus ?? null,
    cache: capture.cache,
    metrics,
    coverage: defaultCoverage({
      kind: "point_snapshot",
      population: POPULATION,
      window: WINDOW,
      notes: "Single MoltJobs stats snapshot. Not agent traffic, customers, or demand.",
    }),
    errors,
    warnings,
    evidenceClass,
    rawSourceLink: upstreamUrl,
    withheldConclusions: WITHHELD_CONCLUSIONS,
    rawExcerpt: boundRawExcerpt(capture.body ?? capture.rawText),
  });
}

function resolveAvailability({
  fetchAvailability,
  observationAvailability,
  providerTimestampState,
  metrics,
}) {
  if (fetchAvailability) return fetchAvailability;
  if (observationAvailability === "source_error") return "error";
  if (observationAvailability === "unavailable") return "unavailable";
  if (providerTimestampState === "stale") return "stale";
  const core = metrics.filter((metric) => CORE_KEYS.includes(metric.key));
  const okCount = core.filter((metric) => metric.state === "ok").length;
  const presentBad = core.filter((metric) => metric.state !== "ok" && metric.state !== "missing").length;
  const missing = core.filter((metric) => metric.state === "missing").length;
  if (okCount === 0) return "error";
  if (presentBad > 0 || missing > 0) return "partial";
  return "ok";
}

function windowFromBody(body) {
  if (!isPlainObject(body)) return null;
  if (typeof body.window === "string" && body.window) return body.window;
  if (typeof body.windowId === "string" && body.windowId) return body.windowId;
  return null;
}

function unitFor(key) {
  if (key === "volumeUsdc" || key === "escrowDeposits") return "USDC";
  if (key.endsWith("Ms")) return "ms";
  if (key === "disputeRate" || key === "completionRatio" || key === "escrowToVolumeRatio") return "ratio";
  return "count";
}
