// Shared flush failure classification for the existing Pulse producer.
// Permanent 400/22023 contract rejections must not spin on the 15s flush
// interval. Transient failures use a capped backoff. Neither class drops,
// renames, or rewrites the retained flush entry.

const PERMANENT_MESSAGE_RE =
  /pulse_invalid_|pulse_flush_id_conflict|pulse_invalid_schema_version|pulse_invalid_delta|pulse_invalid_flush_id|pulse_invalid_observation|pulse_invalid_import/;

export const TRANSIENT_FLUSH_BACKOFF_MS = Object.freeze([
  15_000, 30_000, 60_000, 120_000, 300_000,
]);

// First permanent delay is minutes, not the 15s interval. The cap is the bound.
export const PERMANENT_FLUSH_BACKOFF_MS = Object.freeze([
  300_000, 900_000, 1_800_000, 3_600_000,
]);

function httpStatus(error) {
  const status = Number(error?.status ?? error?.statusCode);
  if (!Number.isInteger(status) || status < 100 || status > 599) return null;
  return status;
}

export function classifyPulseFlushError(error) {
  const message = String(error?.message || error || "pulse_flush_failed")
    .split("\n")[0]
    .slice(0, 300);
  const rawCode = error?.code == null ? "" : String(error.code);
  const status = httpStatus(error);
  const permanent =
    status === 400 ||
    rawCode === "22023" ||
    /\b22023\b/.test(message) ||
    PERMANENT_MESSAGE_RE.test(message);
  return {
    class: permanent ? "permanent" : "transient",
    code: rawCode || null,
    status,
    message,
  };
}

export function flushBackoffMs(errorClass, attemptsAfterFailure) {
  const table =
    errorClass === "permanent" ? PERMANENT_FLUSH_BACKOFF_MS : TRANSIENT_FLUSH_BACKOFF_MS;
  const attempt = Math.max(1, attemptsAfterFailure);
  const index = Math.min(attempt, table.length) - 1;
  return table[index];
}
