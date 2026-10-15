import { MonitorError } from "./errors.mjs";

export function systemClock() {
  return {
    now() {
      return new Date().toISOString();
    },
  };
}

export function frozenClock(iso) {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    throw new MonitorError("clock instant must be an ISO-8601 timestamp", { code: "bad_clock" });
  }
  let ms = parsed;
  return {
    now() {
      return new Date(ms).toISOString();
    },
    advance(deltaMs) {
      if (!Number.isInteger(deltaMs)) {
        throw new MonitorError("clock advance expects integer milliseconds", { code: "bad_clock" });
      }
      ms += deltaMs;
      return new Date(ms).toISOString();
    },
  };
}

export function parseInstant(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new MonitorError(`${label} must be an ISO-8601 timestamp`, { code: "bad_time" });
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new MonitorError(`${label} must be an ISO-8601 timestamp`, { code: "bad_time" });
  }
  return parsed;
}
