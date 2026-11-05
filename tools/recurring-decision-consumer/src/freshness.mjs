export function parseClock(value, label = "clock") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return { ok: false, message: `${label} must be an ISO-UTC timestamp` };
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return { ok: false, message: `${label} must be an ISO-UTC timestamp` };
  return { ok: true, ms, iso: new Date(ms).toISOString() };
}

export function withinHorizon(clockMs, eventIso, horizonHours) {
  if (eventIso == null) return { ok: true, within: false, missing: true };
  const parsed = parseClock(eventIso, "event");
  if (!parsed.ok) return { ok: false, message: parsed.message };
  if (!Number.isFinite(horizonHours) || horizonHours < 0) {
    return { ok: false, message: "horizonHours must be a non-negative number" };
  }
  const ageHours = (clockMs - parsed.ms) / 3_600_000;
  if (ageHours < 0) {
    return { ok: true, within: true, ageHours, future: true };
  }
  return { ok: true, within: ageHours <= horizonHours, ageHours, future: false };
}
