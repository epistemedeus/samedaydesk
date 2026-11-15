import { join } from "node:path";
import { evaluateDecision } from "./evaluate.mjs";
import { parseClock, withinHorizon } from "./freshness.mjs";
import { readStoredCapture } from "./n8n-stored.mjs";
import {
  BUNDLE_OUTCOMES,
  OUTCOMES,
  REASONS,
  RECURRING_CANNOT_ESTABLISH,
  RECURRING_RESULT_SCHEMA,
} from "./pins.mjs";
import { normalizeRecurringInput } from "./schedule.mjs";
import { removeState, updateState } from "./state.mjs";

const REUSED_WORKFLOW = "eFUkVKYk8xXbM7LV";

function cannotEstablish() {
  return [...RECURRING_CANNOT_ESTABLISH];
}

function installation(source) {
  const reused = source?.kind === "stored-n8n"
    && source.workflowId === REUSED_WORKFLOW
    && source.newCharge === false
    && source.newExecution === false;
  return {
    status: "prepared",
    installed: false,
    workflowId: reused ? source.workflowId : null,
    workflowReuse: reused ? "existing-unpublished-no-new-charge" : null,
    newCharge: false,
    newExecution: false,
    newCredentialRecipient: false,
    standingWatcher: false,
  };
}

export function invalidRecurringResult(message, schedule = null) {
  return {
    schema: RECURRING_RESULT_SCHEMA,
    ok: false,
    useful: false,
    complete: false,
    outcome: OUTCOMES.unknown,
    reason: REASONS.invalidInput,
    message,
    decisions: [],
    adaptation: null,
    cancellation: null,
    freshness: null,
    capture: null,
    captureDisposition: null,
    schedule,
    installation: installation(null),
    priorsClass: null,
    customerObservation: false,
    cannotEstablish: cannotEstablish(),
  };
}

function shell(prepared, partial) {
  return {
    schema: RECURRING_RESULT_SCHEMA,
    ok: false,
    useful: false,
    complete: true,
    outcome: OUTCOMES.unknown,
    reason: REASONS.invalidInput,
    message: null,
    decisions: [],
    adaptation: null,
    cancellation: null,
    freshness: null,
    capture: null,
    captureDisposition: null,
    schedule: prepared.schedule,
    installation: installation(prepared.schedule.scope.source),
    priorsClass: prepared.ownerQaPriors ? "owner-qa" : "caller-supplied",
    customerObservation: false,
    cannotEstablish: cannotEstablish(),
    ...partial,
  };
}

function cancelResult(prepared) {
  const removed = [];
  if (prepared.stateDir) {
    for (const intent of prepared.intents) {
      const path = join(prepared.stateDir, `${intent.intentId}.json`);
      const result = removeState(path);
      removed.push({ intentId: intent.intentId, path, removed: result.removed === true });
    }
  }
  const schedule = { ...prepared.schedule, status: "cancelled" };
  return shell(prepared, {
    ok: true,
    useful: false,
    outcome: BUNDLE_OUTCOMES.cancelled,
    reason: REASONS.scheduleCancelled,
    decisions: [],
    cancellation: {
      scheduleId: prepared.schedule.scheduleId,
      subject: prepared.schedule.subject,
      scopeIntentIds: prepared.schedule.scope.intentIds.slice(),
      cancelled: true,
      standingWatcher: false,
      removed,
    },
    schedule,
  });
}

function dispositionResult(prepared, read) {
  return shell(prepared, {
    ok: read.ok === true,
    useful: false,
    outcome: read.outcome,
    reason: read.reason,
    message: read.message ?? null,
    freshness: read.freshness ?? null,
    captureDisposition: {
      preserved: true,
      outcome: read.outcome,
      reason: read.reason,
    },
  });
}

function priorFor(prepared, intentId) {
  if (Object.prototype.hasOwnProperty.call(prepared.priors.byIntent, intentId)) {
    return prepared.priors.byIntent[intentId];
  }
  return prepared.priors.default;
}

function selectedFields(payload, fields) {
  const out = {};
  if (!payload || typeof payload !== "object") return out;
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) out[field] = payload[field];
  }
  return out;
}

function adaptPrior(prior, capture, changedFields) {
  const payload = { ...prior.payload };
  for (const field of changedFields) {
    if (Object.prototype.hasOwnProperty.call(capture.payload, field)) payload[field] = capture.payload[field];
  }
  return {
    schema: prior.schema,
    captureId: `${prior.captureId}#adapted`,
    subject: prior.subject,
    capturedAt: capture.capturedAt,
    payload,
    permission: prior.permission,
    adaptedFrom: { captureId: prior.captureId, capturedAt: prior.capturedAt },
  };
}

function storeUseful(stateDir, intent, clock, result) {
  if (!stateDir || !result?.ok || result.useful !== true) return null;
  const path = join(stateDir, `${intent.intentId}.json`);
  const saved = updateState(path, {
    subject: intent.subject,
    intentId: intent.intentId,
    clock,
    retainedResult: result,
  });
  if (!saved.ok) return { ok: false, path, message: saved.message };
  return { ok: true, path, sequence: saved.state.sequence };
}

function compareResult(prepared, capture, envelope) {
  const decisions = [];
  let stateOk = true;
  for (const intent of prepared.intents) {
    const prior = priorFor(prepared, intent.intentId);
    const reference = Object.prototype.hasOwnProperty.call(prepared.references, intent.intentId)
      ? prepared.references[intent.intentId]
      : null;
    const result = evaluateDecision({
      intent,
      prior,
      capture,
      clock: prepared.clock,
      horizonHours: prepared.horizonHours,
      reference,
    });
    let adaptation = null;
    let retained = result;
    if (prepared.adapt && result.ok && result.useful && result.outcome === OUTCOMES.usefulChange
      && Array.isArray(result.decision?.changedFields) && result.decision.changedFields.length > 0 && prior) {
      const adaptedPrior = adaptPrior(prior, capture, result.decision.changedFields);
      const adapted = evaluateDecision({
        intent,
        prior: adaptedPrior,
        capture,
        clock: prepared.clock,
        horizonHours: prepared.horizonHours,
      });
      const applied = adapted.ok === true && adapted.useful === true && adapted.outcome === OUTCOMES.usefulNoChange;
      adaptation = {
        applied,
        changedFields: result.decision.changedFields.slice(),
        before: selectedFields(prior.payload, result.decision.changedFields),
        after: selectedFields(adaptedPrior.payload, result.decision.changedFields),
        adaptedPrior: applied ? adaptedPrior : null,
        result: adapted,
      };
      if (applied) retained = adapted;
    }
    const state = storeUseful(prepared.stateDir, intent, prepared.clock, retained);
    if (state && state.ok === false) stateOk = false;
    decisions.push({ intentId: intent.intentId, result, adaptation, state });
  }
  const clock = parseClock(prepared.clock, "clock");
  const captureFresh = clock.ok ? withinHorizon(clock.ms, capture.capturedAt, prepared.horizonHours) : { ok: false };
  const appliedAdaptations = decisions.filter((decision) => decision.adaptation?.applied === true);
  return shell(prepared, {
    ok: stateOk && decisions.every((decision) => decision.result.ok === true),
    useful: decisions.some((decision) => decision.result.useful === true),
    outcome: BUNDLE_OUTCOMES.compared,
    reason: REASONS.oneCaptureManyDecisions,
    message: null,
    decisions,
    adaptation: appliedAdaptations.length > 0
      ? { applied: appliedAdaptations.length, intentIds: appliedAdaptations.map((decision) => decision.intentId) }
      : null,
    freshness: {
      clock: clock.ok ? clock.iso : prepared.clock,
      horizonHours: prepared.horizonHours,
      captureAt: capture.capturedAt,
      captureWithinHorizon: captureFresh.ok === true && captureFresh.within === true,
    },
    capture: {
      captureId: capture.captureId,
      subject: capture.subject,
      capturedAt: capture.capturedAt,
      schema: capture.schema,
      payload: capture.payload,
      envelope,
      derivedFixture: prepared.derivedFixture,
      newExecution: false,
      newApiCall: false,
    },
    preservedDispositions: [...new Set(decisions.map((decision) => decision.result.outcome))],
  });
}

/**
 * One permitted capture compared with the schedule's decision intents.
 * Uses the maintained evaluator and stored-execution reader. No n8n call.
 */
export function produceRecurringResult(input) {
  const normalized = normalizeRecurringInput(input);
  if (normalized.error) return invalidRecurringResult(normalized.error, input?.schedule ?? null);
  const prepared = normalized.value;
  if (prepared.cancel) return cancelResult(prepared);
  if (prepared.saved) {
    const read = readStoredCapture({
      saved: prepared.saved,
      workflowId: prepared.source.workflowId,
      executionId: prepared.source.executionId,
      nodeName: prepared.source.nodeName,
      subject: prepared.schedule.subject,
      clock: prepared.clock,
      horizonHours: prepared.horizonHours,
    });
    if (!read.capture) return dispositionResult(prepared, read);
    return compareResult(prepared, read.capture, read.envelope);
  }
  return compareResult(prepared, prepared.capture, null);
}
