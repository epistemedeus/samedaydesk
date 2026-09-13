import { ISO_UTC_RE } from "./acquisition-constants.mjs";
import { acquisitionRefuse } from "./acquisition-errors.mjs";

export function parseServerClock(value, field = "serverNow") {
  if (typeof value !== "string" || !ISO_UTC_RE.test(value)) {
    throw acquisitionRefuse(
      "uncertain-clock",
      `${field} must be an injected ISO-8601 UTC timestamp ending in Z`,
      { detail: { field, value: value == null ? null : String(value).slice(0, 64) } },
    );
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw acquisitionRefuse("uncertain-clock", `${field} is not a parseable UTC timestamp`, {
      detail: { field },
    });
  }
  return { iso: value, ms };
}

export function addTtl(iso, ttlSeconds) {
  const parsed = parseServerClock(iso, "createdAt");
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw acquisitionRefuse("invalid-ttl", "ttlSeconds must be a positive integer");
  }
  return new Date(parsed.ms + ttlSeconds * 1000).toISOString().replace(/\.000Z$/, "Z");
}

export function assertClockSane({ serverNow, createdAt, expiresAt }) {
  const now = parseServerClock(serverNow, "serverNow");
  const created = parseServerClock(createdAt, "createdAt");
  const expires = parseServerClock(expiresAt, "expiresAt");
  if (expires.ms < created.ms) {
    throw acquisitionRefuse("integrity-failed", "persisted expiry precedes creation", {
      state: "integrity-failed",
    });
  }
  if (now.ms < created.ms) {
    throw acquisitionRefuse(
      "uncertain-clock",
      "server clock is before persisted creation; access fails closed",
      { detail: { serverNow, createdAt } },
    );
  }
  return { now, created, expires, expired: now.ms > expires.ms };
}
