import { parseClock } from "./clock.mjs";

function observationTimestamp(value) {
  if (typeof value !== "string" || value === "") return null;
  try {
    return parseClock(value, "observation").ms;
  } catch {
    return null;
  }
}

/**
 * Capture freshness at the query clock. Observation timestamps are capture
 * metadata, not live page currency. Engine claims.fresh stays false at the
 * current pin; this overlay does not rewrite that field.
 */
export function evaluateCaptureFreshness({
  clock,
  maxStaleMs,
  afterObservedAt,
} = {}) {
  const query = parseClock(clock, "clock");
  const observedMs = observationTimestamp(afterObservedAt);

  if (maxStaleMs == null) {
    return {
      status: "unknown",
      reason: "no_freshness_limit",
      clock: query.value,
      maxStaleMs: null,
      afterObservedAt: afterObservedAt ?? null,
      ageMs: observedMs == null ? null : query.ms - observedMs,
      engineClaimsFresh: false,
      livePageCurrent: false,
    };
  }

  if (!Number.isSafeInteger(maxStaleMs) || maxStaleMs < 0) {
    const error = new Error("maxStaleMs must be a finite non-negative integer");
    error.code = "usage";
    throw error;
  }

  if (observedMs == null) {
    return {
      status: "unknown",
      reason: "missing_after_observation",
      clock: query.value,
      maxStaleMs,
      afterObservedAt: afterObservedAt ?? null,
      ageMs: null,
      engineClaimsFresh: false,
      livePageCurrent: false,
    };
  }

  const ageMs = query.ms - observedMs;
  if (ageMs < 0) {
    return {
      status: "clock_before_observation",
      reason: "after_observed_after_query_clock",
      clock: query.value,
      maxStaleMs,
      afterObservedAt,
      ageMs,
      engineClaimsFresh: false,
      livePageCurrent: false,
    };
  }

  if (ageMs > maxStaleMs) {
    return {
      status: "stale_at_query",
      reason: "after_capture_older_than_maxStaleMs",
      clock: query.value,
      maxStaleMs,
      afterObservedAt,
      ageMs,
      engineClaimsFresh: false,
      livePageCurrent: false,
    };
  }

  return {
    status: "within_limit_at_query",
    reason: "after_capture_within_maxStaleMs",
    clock: query.value,
    maxStaleMs,
    afterObservedAt,
    ageMs,
    engineClaimsFresh: false,
    livePageCurrent: false,
  };
}

export function afterObservedAtFromReport(report) {
  return report?.observations?.after?.artifactObservedAt ?? null;
}
