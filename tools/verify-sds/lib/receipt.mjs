import { HORIZON_HOURS_DEFAULT, RECEIPT_SCHEMA } from "./pins.mjs";
import { sha256Json } from "./hash.mjs";

export function makeReceipt({
  jobId,
  clock,
  pin,
  inputDigest,
  resultDigest,
  ok,
  horizonHours = HORIZON_HOURS_DEFAULT,
  extra = {},
}) {
  return {
    schema: RECEIPT_SCHEMA,
    schemaVersion: 1,
    jobId,
    ok: Boolean(ok),
    clock,
    horizonHours,
    pin,
    inputDigest,
    resultDigest,
    ...extra,
  };
}

export function digestResult(value) {
  return sha256Json(value);
}

export function parseIso(value) {
  if (!value || typeof value !== "string") return NaN;
  return Date.parse(value);
}

export function ageHours(thenIso, nowIso) {
  const thenMs = parseIso(thenIso);
  const nowMs = parseIso(nowIso);
  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) return null;
  return (nowMs - thenMs) / 3_600_000;
}
