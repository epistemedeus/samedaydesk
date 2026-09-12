import { DEFAULT_LIMITS, ERROR_CODES } from "./constants.mjs";

export function normalizeLimits(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("limits must be an object"), { code: ERROR_CODES.USAGE });
  }
  const limits = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const validValue = key === "maxStaleMs" && value === null
      || Number.isSafeInteger(value) && value >= 0;
    if (!Object.hasOwn(DEFAULT_LIMITS, key) || !validValue) {
      throw Object.assign(new Error(`${key} must be a finite non-negative integer${key === "maxStaleMs" ? " or null" : ""}`), { code: ERROR_CODES.USAGE });
    }
    limits[key] = value;
  }
  return limits;
}
