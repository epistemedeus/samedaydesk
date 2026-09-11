export function parseDt(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function iso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const d = parseDt(value);
    return d ? d.toISOString() : null;
  }
  return null;
}

export function nowIso(now) {
  if (now == null) return new Date().toISOString();
  const s = iso(now);
  if (!s) throw new Error("invalid now timestamp");
  return s;
}

export function deadlineExpired(deadlineAt, now) {
  const d = parseDt(deadlineAt);
  if (!d) return false;
  const n = parseDt(nowIso(now));
  return n.getTime() >= d.getTime();
}

export function ageSeconds(then, now) {
  const a = parseDt(then);
  const b = parseDt(nowIso(now));
  if (!a || !b) return null;
  return Math.floor((b.getTime() - a.getTime()) / 1000);
}
