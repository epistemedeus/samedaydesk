/**
 * Project existing ingestion records and n8n-equivalent stored envelopes.
 * This is not an ingestion or results store. Records stay with their owners.
 */
import { createHash } from "node:crypto";

import { CAPTURE_SCHEMA, DEFAULT_HORIZON_HOURS, N8N_EQUIVALENT_NODE } from "./pins.mjs";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256Json(value) {
  const text = JSON.stringify(value);
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export function projectIngestionRecord(record) {
  if (record == null) {
    return {
      ok: false,
      outcome: "unavailable",
      reason: "ingestion_missing",
      message: "ingestion record is missing",
    };
  }
  if (!isPlainObject(record)) {
    return {
      ok: false,
      outcome: "unsupported",
      reason: "ingestion_unsupported",
      message: "ingestion record is not an object",
    };
  }
  if (record.schema !== CAPTURE_SCHEMA) {
    return {
      ok: false,
      outcome: "unsupported",
      reason: "ingestion_unsupported",
      message: "ingestion schema is not the retained permitted-capture schema",
    };
  }
  if (record.permission?.permitted !== true) {
    return {
      ok: false,
      outcome: "unavailable",
      reason: "ingestion_not_permitted",
      message: "ingestion record is not permitted",
    };
  }
  if (!record.captureId || !record.subject || !record.capturedAt) {
    return {
      ok: false,
      outcome: "unavailable",
      reason: "ingestion_incomplete",
      message: "ingestion record is missing captureId, subject, or capturedAt",
    };
  }
  if (!isPlainObject(record.payload)) {
    return {
      ok: false,
      outcome: "unavailable",
      reason: "ingestion_incomplete",
      message: "ingestion payload is missing",
    };
  }
  const capturedAtMs = Date.parse(record.capturedAt);
  if (!Number.isFinite(capturedAtMs)) {
    return {
      ok: false,
      outcome: "unsupported",
      reason: "ingestion_clock_invalid",
      message: "capturedAt is not a usable timestamp",
    };
  }
  return {
    ok: true,
    kind: "projection",
    schema: CAPTURE_SCHEMA,
    captureId: String(record.captureId),
    subject: String(record.subject),
    capturedAt: new Date(capturedAtMs).toISOString(),
    capturedAtMs,
    sourceUri: record.sourceUri ? String(record.sourceUri) : null,
    payload: record.payload,
    digest: sha256Json({
      captureId: record.captureId,
      subject: record.subject,
      capturedAt: record.capturedAt,
      payload: record.payload,
    }),
    synthetic: record.synthetic === true,
  };
}

export function freshnessOf(projection, clock, horizonHours = DEFAULT_HORIZON_HOURS) {
  const clockMs = Date.parse(clock);
  if (!Number.isFinite(clockMs)) {
    return { ok: false, outcome: "unsupported", reason: "clock_invalid", message: "clock is not a usable timestamp" };
  }
  if (!Number.isFinite(horizonHours) || horizonHours < 0) {
    return { ok: false, outcome: "unsupported", reason: "horizon_invalid", message: "horizonHours must be a non-negative number" };
  }
  const ageHours = (clockMs - projection.capturedAtMs) / 3_600_000;
  const withinHorizon = ageHours <= horizonHours && ageHours >= 0;
  if (!withinHorizon) {
    return {
      ok: false,
      outcome: "stale",
      reason: "capture_stale",
      message: "ingestion capture sits outside the caller-supplied horizon",
      freshness: { clock: new Date(clockMs).toISOString(), horizonHours, captureAt: projection.capturedAt, withinHorizon: false, ageHours },
    };
  }
  return {
    ok: true,
    freshness: { clock: new Date(clockMs).toISOString(), horizonHours, captureAt: projection.capturedAt, withinHorizon: true, ageHours },
  };
}

export function comparePayloads(priorPayload, capturePayload, fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return { ok: false, outcome: "unsupported", reason: "fields_missing", message: "compare fields are required" };
  }
  const changedFields = [];
  const unchangedFields = [];
  const missingFields = [];
  for (const field of fields) {
    const priorHas = priorPayload && Object.prototype.hasOwnProperty.call(priorPayload, field);
    const captureHas = capturePayload && Object.prototype.hasOwnProperty.call(capturePayload, field);
    if (!priorHas && !captureHas) {
      missingFields.push(field);
      continue;
    }
    if (!priorHas || !captureHas) {
      changedFields.push(field);
      continue;
    }
    if (JSON.stringify(priorPayload[field]) === JSON.stringify(capturePayload[field])) {
      unchangedFields.push(field);
    } else {
      changedFields.push(field);
    }
  }
  if (missingFields.length === fields.length) {
    return {
      ok: false,
      outcome: "unknown",
      reason: "fields_absent_on_both_sides",
      changedFields,
      unchangedFields,
      missingFields,
    };
  }
  const outcome = changedFields.length > 0 ? "useful_change" : "useful_no_change";
  return { ok: true, outcome, changedFields, unchangedFields, missingFields };
}

export function projectN8nEquivalentEnvelope(envelope, nodeName = N8N_EQUIVALENT_NODE) {
  if (!isPlainObject(envelope)) {
    return { ok: false, outcome: "unsupported", reason: "equivalent_malformed", message: "n8n-equivalent envelope is not an object" };
  }
  if (envelope.data && envelope.execution && envelope.execution.data) {
    return { ok: false, outcome: "unsupported", reason: "equivalent_ambiguous", message: "n8n-equivalent envelope has data in both sibling and execution locations" };
  }
  const runData = envelope?.data?.resultData?.runData
    || envelope?.execution?.data?.resultData?.runData
    || envelope?.data?.resultData?.runData;
  const metadata = envelope.execution && !envelope.execution.data ? envelope.execution : (envelope.id ? envelope : null);
  const data = envelope.data?.resultData
    ? envelope.data
    : envelope.execution?.data?.resultData
      ? envelope.execution.data
      : null;
  if (!isPlainObject(data) || !isPlainObject(data.resultData) || !isPlainObject(data.resultData.runData)) {
    return { ok: false, outcome: "unsupported", reason: "equivalent_malformed", message: "n8n-equivalent envelope is not a supported stored-execution shape" };
  }
  if (metadata && metadata.status && metadata.status !== "success") {
    return { ok: false, outcome: "unavailable", reason: "equivalent_unsuccessful", message: "n8n-equivalent execution is not successful" };
  }
  const nodeRuns = data.resultData.runData[nodeName];
  if (!Array.isArray(nodeRuns) || nodeRuns.length === 0) {
    return { ok: false, outcome: "unavailable", reason: "equivalent_node_missing", message: "selected n8n-equivalent node is missing" };
  }
  const run = nodeRuns[0];
  if (!isPlainObject(run) || !Number.isFinite(Date.parse(run.startTime))) {
    return { ok: false, outcome: "unsupported", reason: "equivalent_clock_invalid", message: "selected node startTime is missing or invalid and is not replaced with the clock" };
  }
  const item = run?.data?.main?.[0]?.[0]?.json;
  if (!isPlainObject(item)) {
    return { ok: false, outcome: "unavailable", reason: "equivalent_items_missing", message: "selected node has no json item" };
  }
  return {
    ok: true,
    kind: "projection",
    nodeName,
    startTime: new Date(Date.parse(run.startTime)).toISOString(),
    payload: item,
    workflowId: metadata?.workflowId ?? envelope.workflowId ?? null,
    executionId: metadata?.id ?? envelope.id ?? null,
    synthetic: envelope.synthetic === true,
  };
}

export function asCaptureFromEquivalent(equivalent, { captureId, subject, sourceUri }) {
  if (!equivalent.ok) return equivalent;
  return projectIngestionRecord({
    schema: CAPTURE_SCHEMA,
    captureId,
    subject,
    capturedAt: equivalent.startTime,
    sourceUri: sourceUri ?? null,
    payload: equivalent.payload,
    permission: { permitted: true },
    synthetic: equivalent.synthetic === true,
  });
}

export { sha256Json };
