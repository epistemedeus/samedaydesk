import { ISO_UTC_RE } from "./pins.mjs";
import { refuse } from "./errors.mjs";

export function parseClock(value, field = "clock") {
  if (typeof value !== "string" || !ISO_UTC_RE.test(value)) {
    throw refuse("invalid-clock", `${field} must be an ISO-8601 UTC timestamp ending in Z`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw refuse("invalid-clock", `${field} is not a parseable timestamp`);
  }
  return { iso: value, ms };
}

export function compareExpiry(expiresAt, clock) {
  const exp = parseClock(expiresAt, "expiresAt");
  const now = parseClock(clock, "clock");
  const expired = now.ms > exp.ms;
  return {
    expiresAt: exp.iso,
    clock: now.iso,
    state: expired ? "expired" : "unexpired",
    expired,
  };
}

export function addSeconds(iso, seconds) {
  const parsed = parseClock(iso, "clock");
  if (!Number.isSafeInteger(seconds) || seconds < 1) {
    throw refuse("invalid-ttl", "ttlSeconds must be a positive integer");
  }
  return new Date(parsed.ms + seconds * 1000).toISOString().replace(/\.000Z$/, "Z");
}
