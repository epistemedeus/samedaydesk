import { CLOCK_RE } from "./pins.mjs";

export function parseClock(value, field = "clock") {
  if (value == null || value === "") {
    const error = new Error(`${field} is required (UTC ISO-8601 with trailing Z)`);
    error.code = "clock_required";
    throw error;
  }
  if (typeof value !== "string" || !CLOCK_RE.test(value)) {
    const error = new Error(`${field} must be UTC ISO-8601 with trailing Z`);
    error.code = "clock_required";
    throw error;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    const error = new Error(`${field} is not a valid UTC instant`);
    error.code = "clock_required";
    throw error;
  }
  return { value, ms };
}
