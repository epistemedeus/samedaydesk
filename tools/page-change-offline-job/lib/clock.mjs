import { CLOCK_RE, ERROR_CODES } from "./constants.mjs";

function utcInstantMs(value) {
  if (typeof value !== "string" || !CLOCK_RE.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const canonical = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  return new Date(milliseconds).toISOString() === canonical ? milliseconds : null;
}

export function requireClock(value) {
  if (value == null || value === "") {
    const error = new Error("clock is required (UTC ISO-8601 with trailing Z)");
    error.code = ERROR_CODES.CLOCK_REQUIRED;
    throw error;
  }
  if (utcInstantMs(value) === null) {
    const error = new Error("clock must be UTC ISO-8601 with trailing Z");
    error.code = ERROR_CODES.CLOCK_REQUIRED;
    throw error;
  }
  return value;
}

/** Horizon on the held after-observation versus the job clock. Not live page freshness. */
export function observationFreshness({ observedAt, observedAts, clock, maxStaleMs }) {
  if (maxStaleMs == null) {
    return { freshness: "unknown", current: false, ageMs: null };
  }
  const values = observedAts === undefined ? [observedAt] : observedAts;
  if (!Array.isArray(values) || values.length === 0) {
    return { freshness: "unknown", current: false, ageMs: null };
  }
  const afterTimes = values.map(utcInstantMs);
  const clockMs = utcInstantMs(clock);
  if (afterTimes.some((value) => value === null) || clockMs === null) {
    return { freshness: "unknown", current: false, ageMs: null };
  }
  const ages = afterTimes.map((value) => clockMs - value);
  const invertedAge = Math.min(...ages);
  if (invertedAge < 0) return { freshness: "inverted", current: false, ageMs: invertedAge };
  const ageMs = Math.max(...ages);
  if (ageMs > maxStaleMs) return { freshness: "stale", current: false, ageMs };
  return { freshness: "observed", current: true, ageMs };
}
