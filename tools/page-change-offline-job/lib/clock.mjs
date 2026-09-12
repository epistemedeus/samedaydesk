import { CLOCK_RE, ERROR_CODES } from "./constants.mjs";

export function requireClock(value) {
  if (value == null || value === "") {
    const error = new Error("clock is required (UTC ISO-8601 with trailing Z)");
    error.code = ERROR_CODES.CLOCK_REQUIRED;
    throw error;
  }
  if (typeof value !== "string" || !CLOCK_RE.test(value)) {
    const error = new Error("clock must be UTC ISO-8601 with trailing Z");
    error.code = ERROR_CODES.CLOCK_REQUIRED;
    throw error;
  }
  return value;
}

/** Horizon on the held after-observation versus the job clock. Not live page freshness. */
export function observationFreshness({ observedAt, clock, maxStaleMs }) {
  if (maxStaleMs == null) {
    return { freshness: "unknown", current: false, ageMs: null };
  }
  if (typeof observedAt !== "string" || !CLOCK_RE.test(observedAt)) {
    return { freshness: "unknown", current: false, ageMs: null };
  }
  const afterMs = Date.parse(observedAt);
  const clockMs = Date.parse(clock);
  if (!Number.isFinite(afterMs) || !Number.isFinite(clockMs)) {
    return { freshness: "unknown", current: false, ageMs: null };
  }
  const ageMs = clockMs - afterMs;
  if (ageMs < 0) return { freshness: "inverted", current: false, ageMs };
  if (ageMs > maxStaleMs) return { freshness: "stale", current: false, ageMs };
  return { freshness: "observed", current: true, ageMs };
}
