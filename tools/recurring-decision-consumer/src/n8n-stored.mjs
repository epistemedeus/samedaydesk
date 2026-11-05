import { evaluateDecision } from "./evaluate.mjs";
import { parseClock } from "./freshness.mjs";
import { MAX_NODES } from "./limits.mjs";
import { CAPTURE_SCHEMA, OUTCOMES, REASONS, RESULT_SCHEMA } from "./pins.mjs";

const MAX_OUTPUT_BRANCHES = 8;

/**
 * Explicit saved-execution envelopes:
 * - sibling: { execution: metadata, data: { resultData: { runData } } } and no execution.data
 * - execution-nested: data lives only inside execution
 * - nested document: the document itself is the execution, with no execution wrapper
 * Any other wrapper is rejected. Sibling data is never ignored in favor of execution.data.
 * Node startTime is the only capture clock. It is never replaced with the evaluation clock
 * or execution.startedAt.
 */

function shell(partial) {
  return {
    schema: RESULT_SCHEMA,
    useful: false,
    previous: partial.previous ?? null,
    statePath: partial.statePath ?? null,
    cannotEstablish: [
      "This run-once consumer does not claim live recurrence.",
      "It does not establish that later callers accepted the same decision.",
      "Voluntary paid choice remains an outside experiment, not a fixture assertion.",
    ],
    ...partial,
  };
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function rejection({
  ok = false,
  outcome = OUTCOMES.unknown,
  reason,
  message,
  clock = null,
  horizonHours = null,
  captureAt = null,
  previous = null,
  statePath = null,
}) {
  return {
    ok,
    ...shell({
      outcome,
      useful: false,
      reason,
      message,
      freshness: {
        clock,
        horizonHours,
        priorAt: null,
        captureAt,
        withinHorizon: false,
      },
      decision: {
        intentId: "",
        subject: "",
        changedFields: [],
        unchangedFields: [],
        digestPrior: null,
        digestCapture: null,
      },
      controls: {
        falseChange: false,
        missedChange: false,
        referenceMatched: null,
        referenceLabel: null,
      },
      previous,
      statePath,
    }),
  };
}

function clockFields(clock, horizonHours) {
  const parsed = parseClock(clock, "clock");
  return {
    clock: parsed.ok ? parsed.iso : null,
    horizonHours: Number.isFinite(horizonHours) ? horizonHours : null,
  };
}

function dataPresence(value) {
  if (!isPlainObject(value) || !Object.prototype.hasOwnProperty.call(value, "data") || value.data == null) {
    return "absent";
  }
  return isPlainObject(value.data) ? "present" : "invalid";
}

function runDataFrom(data) {
  if (!isPlainObject(data) || !isPlainObject(data.resultData)) return { ok: false, missing: true };
  if (!Object.prototype.hasOwnProperty.call(data.resultData, "runData")) return { ok: false, missing: true };
  if (!isPlainObject(data.resultData.runData)) return { ok: false, invalid: true };
  return { ok: true, runData: data.resultData.runData };
}

function resolveEnvelope(saved) {
  if (!isPlainObject(saved)) {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "saved execution must be one JSON object" };
  }
  const hasExecution = Object.prototype.hasOwnProperty.call(saved, "execution");
  const hasTopIdentity = Object.prototype.hasOwnProperty.call(saved, "id")
    || Object.prototype.hasOwnProperty.call(saved, "workflowId");
  if (hasExecution && hasTopIdentity) {
    return {
      ok: false,
      reason: REASONS.executionAmbiguous,
      message: "saved execution has both an execution wrapper and top-level identity",
    };
  }
  if (hasExecution) {
    if (!isPlainObject(saved.execution)) {
      return { ok: false, reason: REASONS.executionAmbiguous, message: "execution wrapper must be an object" };
    }
    const sibling = dataPresence(saved);
    const nested = dataPresence(saved.execution);
    if (sibling === "invalid" || nested === "invalid") {
      return { ok: false, reason: REASONS.executionAmbiguous, message: "execution data must be an object" };
    }
    if (sibling === "present" && nested === "present") {
      return {
        ok: false,
        reason: REASONS.executionAmbiguous,
        message: "saved execution has both sibling data and execution.data",
      };
    }
    if (sibling === "absent" && nested === "absent") {
      return { ok: false, reason: REASONS.executionDataMissing, message: "saved execution has no result data" };
    }
    const selected = sibling === "present" ? saved.data : saved.execution.data;
    const found = runDataFrom(selected);
    if (!found.ok && found.invalid) {
      return { ok: false, reason: REASONS.executionAmbiguous, message: "runData must be an object" };
    }
    if (!found.ok) {
      return { ok: false, reason: REASONS.executionDataMissing, message: "saved execution data is missing resultData.runData" };
    }
    return {
      ok: true,
      metadata: saved.execution,
      runData: found.runData,
      envelope: sibling === "present" ? "sibling" : "execution-nested",
    };
  }
  const sibling = dataPresence(saved);
  if (sibling === "invalid") {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "execution data must be an object" };
  }
  if (!hasTopIdentity || sibling !== "present") {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "saved execution wrapper is not a supported envelope" };
  }
  const found = runDataFrom(saved.data);
  if (!found.ok && found.invalid) {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "runData must be an object" };
  }
  if (!found.ok) {
    return { ok: false, reason: REASONS.executionDataMissing, message: "saved execution data is missing resultData.runData" };
  }
  return { ok: true, metadata: saved, runData: found.runData, envelope: "nested-document" };
}

function identityOf(metadata) {
  if (!isPlainObject(metadata)) {
    return { ok: false, reason: REASONS.executionIdentityIncomplete, message: "execution metadata is incomplete" };
  }
  const id = metadata.id;
  const workflowId = metadata.workflowId;
  if (typeof id !== "string" || id.length === 0 || typeof workflowId !== "string" || workflowId.length === 0) {
    return { ok: false, reason: REASONS.executionIdentityIncomplete, message: "execution id and workflow id must be strings" };
  }
  if (Object.prototype.hasOwnProperty.call(metadata, "executionId") && metadata.executionId !== id) {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "execution id and executionId disagree" };
  }
  return { ok: true, id, workflowId };
}

function statusOf(metadata) {
  if (metadata.status !== "success") {
    return { ok: false, message: "execution status must be success" };
  }
  if (Object.prototype.hasOwnProperty.call(metadata, "finished") && metadata.finished !== true) {
    return { ok: false, message: "execution finished must be true when present" };
  }
  return { ok: true };
}

function isoFromUnixMs(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  const date = new Date(value);
  if (date.getTime() !== value) return null;
  try {
    const iso = date.toISOString();
    if (Date.parse(iso) !== value) return null;
    return iso;
  } catch {
    return null;
  }
}

function nodeCaptureTime(run) {
  if (!Object.prototype.hasOwnProperty.call(run, "startTime") || run.startTime == null) {
    return { ok: false, missing: true };
  }
  if (typeof run.startTime === "number") {
    const iso = isoFromUnixMs(run.startTime);
    return iso ? { ok: true, iso } : { ok: false, invalid: true };
  }
  if (typeof run.startTime === "string") {
    const parsed = parseClock(run.startTime, "startTime");
    return parsed.ok ? { ok: true, iso: parsed.iso } : { ok: false, invalid: true };
  }
  return { ok: false, invalid: true };
}

function selectedRun(runData, nodeName) {
  const names = Object.keys(runData);
  if (names.length > MAX_NODES) {
    return { ok: false, reason: REASONS.invalidInput, message: `runData exceeds ${MAX_NODES} nodes` };
  }
  if (!Object.prototype.hasOwnProperty.call(runData, nodeName)) {
    return { ok: false, reason: REASONS.executionNodeMissing, message: "selected node is not in this execution" };
  }
  const runs = runData[nodeName];
  if (!Array.isArray(runs)) {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "selected node runs must be an array" };
  }
  if (runs.length === 0) {
    return { ok: false, reason: REASONS.executionItemsMissing, message: "selected node has no runs" };
  }
  if (runs.length !== 1) {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "selected node has more than one run" };
  }
  if (!isPlainObject(runs[0])) {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "selected node run must be an object" };
  }
  return { ok: true, run: runs[0] };
}

function runSucceeded(run) {
  if (Object.prototype.hasOwnProperty.call(run, "executionStatus") && run.executionStatus !== "success") {
    return { ok: false, message: "selected node executionStatus must be success" };
  }
  if (Object.prototype.hasOwnProperty.call(run, "error") && run.error != null) {
    return { ok: false, message: "selected node recorded an error" };
  }
  return { ok: true };
}

function oneItem(run) {
  if (!isPlainObject(run.data) || !Array.isArray(run.data.main)) {
    return { ok: false, reason: REASONS.executionItemsMissing, message: "selected node has no items" };
  }
  if (run.data.main.length > MAX_OUTPUT_BRANCHES) {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "selected node output is ambiguous" };
  }
  const branches = [];
  for (const branch of run.data.main) {
    if (!Array.isArray(branch) || branch.length === 0) continue;
    branches.push(branch);
  }
  if (branches.length === 0) {
    return { ok: false, reason: REASONS.executionItemsMissing, message: "selected node has no items" };
  }
  if (branches.length !== 1 || branches[0].length !== 1) {
    return { ok: false, reason: REASONS.executionAmbiguous, message: "selected node has more than one item" };
  }
  const item = branches[0][0];
  if (!isPlainObject(item) || !isPlainObject(item.json)) {
    return { ok: false, reason: REASONS.executionItemsMissing, message: "selected node item json is missing" };
  }
  return { ok: true, payload: item.json };
}

function captureIdFor(workflowId, executionId, nodeName) {
  const captureId = `stored-n8n:${workflowId}:${executionId}:${nodeName}`;
  if (captureId.length > 128) return null;
  return captureId;
}

function unavailable(reason, message, fields) {
  return rejection({ ok: true, outcome: OUTCOMES.unavailable, reason, message, ...fields });
}

/**
 * Consume one already saved n8n execution. Field comparison is evaluateDecision only.
 */
export function evaluateStoredN8n({
  saved,
  workflowId,
  executionId,
  nodeName,
  intent,
  prior,
  clock,
  horizonHours,
  previous = null,
  reference = null,
  statePath = null,
}) {
  const fields = { ...clockFields(clock, horizonHours), previous, statePath };
  if (typeof workflowId !== "string" || workflowId.length === 0
    || typeof executionId !== "string" || executionId.length === 0
    || typeof nodeName !== "string" || nodeName.length === 0) {
    return rejection({
      ...fields,
      reason: REASONS.invalidInput,
      message: "expected workflow id, execution id, and node are required",
    });
  }

  const envelope = resolveEnvelope(saved);
  if (!envelope.ok) {
    if (envelope.reason === REASONS.executionDataMissing) {
      return unavailable(envelope.reason, envelope.message, fields);
    }
    return rejection({ ...fields, reason: envelope.reason, message: envelope.message });
  }

  const identity = identityOf(envelope.metadata);
  if (!identity.ok) {
    return rejection({ ...fields, reason: identity.reason, message: identity.message });
  }
  if (identity.workflowId !== workflowId || identity.id !== executionId) {
    return rejection({
      ...fields,
      reason: REASONS.executionIdentityMismatch,
      message: "stored workflow id or execution id does not match the expected identity",
    });
  }

  const status = statusOf(envelope.metadata);
  if (!status.ok) {
    return rejection({ ...fields, reason: REASONS.executionStatusRejected, message: status.message });
  }

  const selected = selectedRun(envelope.runData, nodeName);
  if (!selected.ok) {
    if (selected.reason === REASONS.executionNodeMissing || selected.reason === REASONS.executionItemsMissing) {
      return unavailable(selected.reason, selected.message, fields);
    }
    return rejection({ ...fields, reason: selected.reason, message: selected.message });
  }

  const nodeStatus = runSucceeded(selected.run);
  if (!nodeStatus.ok) {
    return rejection({ ...fields, reason: REASONS.executionStatusRejected, message: nodeStatus.message });
  }

  const item = oneItem(selected.run);
  if (!item.ok) {
    if (item.reason === REASONS.executionItemsMissing) return unavailable(item.reason, item.message, fields);
    return rejection({ ...fields, reason: item.reason, message: item.message });
  }

  const captureTime = nodeCaptureTime(selected.run);
  if (!captureTime.ok) {
    return rejection({
      ...fields,
      reason: captureTime.missing ? REASONS.executionCaptureTimeMissing : REASONS.executionCaptureTimeInvalid,
      message: captureTime.missing
        ? "selected node startTime is missing"
        : "selected node startTime is not a valid timestamp",
    });
  }

  const captureId = captureIdFor(workflowId, executionId, nodeName);
  if (!captureId) {
    return rejection({ ...fields, reason: REASONS.invalidInput, message: "stored capture id exceeds 128 characters" });
  }

  const subject = typeof intent?.subject === "string" ? intent.subject : "";
  return evaluateDecision({
    intent,
    prior,
    capture: {
      schema: CAPTURE_SCHEMA,
      captureId,
      subject,
      capturedAt: captureTime.iso,
      payload: item.payload,
    },
    clock,
    horizonHours,
    previous,
    reference,
    statePath,
  });
}
