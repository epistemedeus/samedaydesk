/**
 * Thin MoltJobs /v1/stats vocabulary adapter.
 *
 * Maps provider field names onto labelled market-observation fields only.
 * Does not normalize values, invent sourceTime, derive ratios, or claim
 * demand, traffic, customers, settlement, or profit.
 */

export const MOLTJOBS_PROVIDER_ID = "moltjobs";
export const MOLTJOBS_STATS_SOURCE_URL = "https://api.moltjobs.io/v1/stats";

export const MOLTJOBS_STATS_FIELD_MAP = Object.freeze({
  totalJobs: "jobCount",
  totalCompleted: "completedCount",
  totalAgents: "registeredAgents",
  totalVolumeUsdc: "volumeUsdc",
  escrowedUsdc: "escrowDeposits",
  avgCompletionTimeMs: "avgCompletionTimeMs",
  medianCompletionTimeMs: "medianCompletionTimeMs",
  avgTimeToFillMs: "avgTimeToFillMs",
  medianTimeToFillMs: "medianTimeToFillMs",
  completionSampleSize: "completionSampleSize",
  disputeRate: "disputeRate",
});

const SOURCE_TIME_KEYS = Object.freeze([
  "sourceTime",
  "updatedAt",
  "asOf",
  "computedAt",
  "generatedAt",
  "timestamp",
]);

const PROTO = new Set(["__proto__", "prototype", "constructor"]);

export function mapMoltjobsStatsToLabelledFields(body) {
  if (body == null) return null;
  if (typeof body === "string") return body;
  const record = unwrapMoltjobsRecord(body);
  if (!isPlainObject(record)) return record;

  const labelled = {};
  for (const [from, to] of Object.entries(MOLTJOBS_STATS_FIELD_MAP)) {
    if (hasOwn(record, from)) labelled[to] = record[from];
  }
  if (Object.keys(labelled).length === 0) return labelled;

  const sourceTime = pickMoltjobsSourceTime(record);
  if (sourceTime !== undefined) labelled.sourceTime = sourceTime;
  copyIfPresent(record, labelled, "window");
  copyIfPresent(record, labelled, "windowId");
  copyIfPresent(record, labelled, "windowStart");
  copyIfPresent(record, labelled, "windowEnd");
  copyIfPresent(record, labelled, "windows");
  return labelled;
}

export function moltjobsCaptureToLabelledPayload(capture) {
  if (!isPlainObject(capture)) {
    throw new TypeError("moltjobs capture must be a plain object");
  }
  return {
    providerId: typeof capture.providerId === "string" && capture.providerId
      ? capture.providerId
      : MOLTJOBS_PROVIDER_ID,
    fetchedAt: capture.fetchedAt ?? null,
    sourceUrl: capture.sourceUrl ?? MOLTJOBS_STATS_SOURCE_URL,
    httpStatus: capture.httpStatus ?? null,
    body: mapMoltjobsStatsToLabelledFields(capture.body),
    error: capture.error ?? null,
  };
}

function unwrapMoltjobsRecord(body) {
  if (!isPlainObject(body)) return body;
  if (!isPlainObject(body.data)) return body;
  if (hasMoltjobsSourceKey(body) && !hasMoltjobsSourceKey(body.data)) return body;
  return body.data;
}

function hasMoltjobsSourceKey(record) {
  for (const key of Object.keys(MOLTJOBS_STATS_FIELD_MAP)) {
    if (hasOwn(record, key)) return true;
  }
  return false;
}

function pickMoltjobsSourceTime(record) {
  for (const key of SOURCE_TIME_KEYS) {
    if (!hasOwn(record, key)) continue;
    const value = record[key];
    if (value === null || value === undefined || value === "") continue;
    return value;
  }
  return undefined;
}

function copyIfPresent(from, to, key) {
  if (hasOwn(from, key)) to[key] = from[key];
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) && !PROTO.has(key);
}
