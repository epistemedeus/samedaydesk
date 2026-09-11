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
