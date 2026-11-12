/**
 * Project Work Exchange and Agent Entry caller examples.
 * correlationId and continuation tokens carry no authority.
 * This module keeps no caller history and never stores a bearer token.
 */
import { CORRELATION_ID_RE, TOKEN_SHAPED_RE, TASK_ID_RE, CONTEXT_ID_RE } from "./pins.mjs";

export function isCorrelationId(value) {
  return typeof value === "string" && CORRELATION_ID_RE.test(value);
}

export function looksLikeBearerToken(value) {
  return typeof value === "string" && TOKEN_SHAPED_RE.test(value);
}

export function refuseAuthorizingCallerField({ taskId, taskRef, correlationId, token, termsVersion } = {}) {
  const suspects = [taskId, taskRef, correlationId, termsVersion];
  for (const value of suspects) {
    if (looksLikeBearerToken(value)) {
      return {
        ok: false,
        outcome: "exception",
        reason: "token_used_as_task_ref",
        message: "a bearer token is not a task id, taskRef, correlationId, or termsVersion and cannot authorize acceptance",
      };
    }
  }
  if (token != null && token !== "" && token !== "<REDACTED>" && token !== "<REDACTED pc1 bearer token>" && token !== "<REDACTED tc1>") {
    return {
      ok: false,
      outcome: "exception",
      reason: "token_in_public_record",
      message: "continuation tokens must not appear on a public journey or acceptance record",
    };
  }
  if (correlationId != null && !isCorrelationId(correlationId)) {
    return {
      ok: false,
      outcome: "exception",
      reason: "correlation_id_invalid",
      message: "correlationId must match ae:corr:v1 and 22 URL-safe characters, and it remains non-authorizing",
    };
  }
  if (taskRef != null && taskRef !== correlationId && looksLikeBearerToken(taskRef)) {
    return {
      ok: false,
      outcome: "exception",
      reason: "token_used_as_task_ref",
      message: "taskRef may hold a correlationId but never a bearer token",
    };
  }
  return { ok: true };
}

export function projectTaskIdentity({ taskId, contextId, followsTaskId = null, termsVersion } = {}) {
  if (!TASK_ID_RE.test(String(taskId || ""))) {
    return { ok: false, outcome: "exception", reason: "task_id_invalid", message: "taskId is required and must be the kernel task id" };
  }
  if (!CONTEXT_ID_RE.test(String(contextId || ""))) {
    return { ok: false, outcome: "exception", reason: "context_id_invalid", message: "contextId must group a task and its follow-ups" };
  }
  if (followsTaskId != null && !TASK_ID_RE.test(String(followsTaskId))) {
    return { ok: false, outcome: "exception", reason: "follows_task_id_invalid", message: "followsTaskId must point at the terminal prior task or be null" };
  }
  if (followsTaskId != null && followsTaskId === taskId) {
    return { ok: false, outcome: "exception", reason: "follows_task_id_invalid", message: "a follow-up must be a new task, not a mutation of the prior task id" };
  }
  if (typeof termsVersion !== "string" || !/^sha256:[0-9a-f]{64}$/.test(termsVersion)) {
    return {
      ok: false,
      outcome: "exception",
      reason: "terms_version_invalid",
      message: "termsVersion must be sha256: and 64 lowercase hex; integer versions are refused",
    };
  }
  return {
    ok: true,
    kind: "projection",
    taskId: String(taskId),
    contextId: String(contextId),
    followsTaskId: followsTaskId == null ? null : String(followsTaskId),
    termsVersion,
  };
}

const DISCOVERY_STATUSES = ["observed", "declared", "unknown"];
const MEASUREMENT_KIND = "measurement";
const MEASUREMENT_OUTCOME_RE = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * Discovery is read only from a separate measurement record, never from publicView.
 * A measurement record must not carry a token, kid, or continuation field.
 */
export function projectMeasurementRecord(record, { correlationId = null, step = null, tool = null } = {}) {
  if (record == null) {
    return {
      ok: true,
      kind: "projection",
      measurement: {
        v: 1,
        kind: MEASUREMENT_KIND,
        tool: tool ?? null,
        correlationId: correlationId ?? null,
        step: step ?? null,
        discovery: { status: "unknown", source: null },
        outcome: null,
      },
    };
  }
  if (typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, outcome: "exception", reason: "measurement_invalid", message: "measurement record must be an object" };
  }
  if (record.token != null || record.kid != null || record.continuation != null) {
    return {
      ok: false,
      outcome: "exception",
      reason: "continuation_file_record_mixed",
      message: "a measurement record must not hold a token, kid, or continuation field",
    };
  }
  if (record.kind != null && record.kind !== MEASUREMENT_KIND) {
    return { ok: false, outcome: "exception", reason: "measurement_invalid", message: "measurement.kind must be measurement" };
  }
  const status = DISCOVERY_STATUSES.includes(record.discovery?.status) ? record.discovery.status : "unknown";
  const source = status === "unknown" || typeof record.discovery?.source !== "string" ? null : record.discovery.source;
  const outcome = record.outcome ?? null;
  if (outcome !== null && (typeof outcome !== "string" || !MEASUREMENT_OUTCOME_RE.test(outcome))) {
    return { ok: false, outcome: "exception", reason: "measurement_invalid", message: "measurement.outcome is not a permitted value" };
  }
  return {
    ok: true,
    kind: "projection",
    measurement: {
      v: 1,
      kind: MEASUREMENT_KIND,
      tool: record.tool ?? tool ?? null,
      correlationId: record.correlationId ?? correlationId ?? null,
      step: Number.isInteger(record.step) ? record.step : step,
      discovery: { status, source },
      outcome,
    },
  };
}

/**
 * Public, token-free view of an Agent Entry continuation caller (task-continuation 1.1.0).
 * publicView carries no discovery. Discovery is read only from a separate
 * measurement record. Illustrative correlationIds must be labelled synthetic;
 * real values are random and must not be hardcoded as live emissions.
 */
export function projectAgentEntryPublicCaller(input = {}) {
  if (input.continuationFileMissing === true || input.continuationError === "continuation_file_missing") {
    return {
      ok: false,
      outcome: "exception",
      reason: "continuation_file_missing",
      message: "continuation file does not exist",
    };
  }
  const refused = refuseAuthorizingCallerField(input);
  if (!refused.ok) return refused;
  const step = input.step;
  if (step != null && (!Number.isInteger(step) || step < 0)) {
    return { ok: false, outcome: "exception", reason: "step_invalid", message: "step must be a non-negative integer" };
  }
  const measurement = projectMeasurementRecord(input.measurement, {
    correlationId: input.correlationId ?? null,
    step: step ?? null,
    tool: input.tool ?? null,
  });
  if (!measurement.ok) return measurement;
  return {
    ok: true,
    kind: "projection",
    publicView: {
      tool: input.tool ?? null,
      correlationId: input.correlationId ?? null,
      step: step ?? null,
      expiresAt: input.expiresAt ?? null,
      tokenHeld: false,
    },
    measurement: measurement.measurement,
    authorizing: false,
  };
}
