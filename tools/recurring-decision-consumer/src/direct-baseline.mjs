import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { MAX_NODES } from "./limits.mjs";
import {
  BUNDLE_OUTCOMES,
  CAPTURE_SCHEMA,
  INTENT_SCHEMA,
  OUTCOMES,
  PORTABLE_CAPTURE_SCHEMA,
  REASONS,
  RECURRING_CANNOT_ESTABLISH,
  RECURRING_RESULT_SCHEMA,
} from "./pins.mjs";
import { normalizeRecurringInput } from "./schedule.mjs";

const REUSED_WORKFLOW = "eFUkVKYk8xXbM7LV";
const SUPPORTED_CAPTURE_SCHEMAS = [CAPTURE_SCHEMA, PORTABLE_CAPTURE_SCHEMA];

/**
 * Competent direct capture-and-decide path.
 * It does not call the maintained evaluator or the stored-execution reader.
 * Schedule admission is shared so a refused schedule is the same product rule.
 */

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

function invalidResult(message, schedule = null) {
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
    cannotEstablish: [...RECURRING_CANNOT_ESTABLISH],
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
    cannotEstablish: [...RECURRING_CANNOT_ESTABLISH],
    ...partial,
  };
}

function dataFlag(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "absent";
  if (!Object.prototype.hasOwnProperty.call(value, "data") || value.data == null) return "absent";
  if (typeof value.data !== "object" || Array.isArray(value.data)) return "invalid";
  return "present";
}

function failRead(ok, outcome, reason) {
  return { ok, outcome, reason };
}

function isoFromUnixMs(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  const date = new Date(value);
  if (date.getTime() !== value) return null;
  const iso = date.toISOString();
  if (Date.parse(iso) !== value) return null;
  return iso;
}

function captureTimeOf(run) {
  if (!Object.prototype.hasOwnProperty.call(run, "startTime") || run.startTime == null) return { missing: true };
  if (typeof run.startTime === "number") {
    const iso = isoFromUnixMs(run.startTime);
    return iso ? { iso } : { invalid: true };
  }
  if (typeof run.startTime === "string" && /^\d{4}-\d{2}-\d{2}T/.test(run.startTime)) {
    const ms = Date.parse(run.startTime);
    if (!Number.isFinite(ms)) return { invalid: true };
    return { iso: new Date(ms).toISOString() };
  }
  return { invalid: true };
}

function onePayload(run) {
  if (!run.data || typeof run.data !== "object" || !Array.isArray(run.data.main)) {
    return failRead(true, OUTCOMES.unavailable, REASONS.executionItemsMissing);
  }
  if (run.data.main.length > 8) return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
  const branches = [];
  for (const branch of run.data.main) {
    if (Array.isArray(branch) && branch.length > 0) branches.push(branch);
  }
  if (branches.length === 0) return failRead(true, OUTCOMES.unavailable, REASONS.executionItemsMissing);
  if (branches.length !== 1 || branches[0].length !== 1) return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
  const item = branches[0][0];
  if (!item || typeof item !== "object" || !item.json || typeof item.json !== "object" || Array.isArray(item.json)) {
    return failRead(true, OUTCOMES.unavailable, REASONS.executionItemsMissing);
  }
  return { payload: item.json };
}

function readDirectCapture({ saved, workflowId, executionId, nodeName, subject }) {
  if (typeof workflowId !== "string" || workflowId.length === 0
    || typeof executionId !== "string" || executionId.length === 0
    || typeof nodeName !== "string" || nodeName.length === 0) {
    return failRead(false, OUTCOMES.unknown, REASONS.invalidInput);
  }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
  }
  const hasExecution = Object.prototype.hasOwnProperty.call(saved, "execution");
  const hasTopIdentity = Object.prototype.hasOwnProperty.call(saved, "id")
    || Object.prototype.hasOwnProperty.call(saved, "workflowId");
  if (hasExecution && hasTopIdentity) return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);

  let metadata;
  let data;
  let envelope;
  if (hasExecution) {
    if (!saved.execution || typeof saved.execution !== "object" || Array.isArray(saved.execution)) {
      return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
    }
    const sibling = dataFlag(saved);
    const nested = dataFlag(saved.execution);
    if (sibling === "invalid" || nested === "invalid") return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
    if (sibling === "present" && nested === "present") return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
    if (sibling === "absent" && nested === "absent") return failRead(true, OUTCOMES.unavailable, REASONS.executionDataMissing);
    data = sibling === "present" ? saved.data : saved.execution.data;
    metadata = saved.execution;
    envelope = sibling === "present" ? "sibling" : "execution-nested";
  } else {
    const sibling = dataFlag(saved);
    if (sibling === "invalid" || sibling !== "present" || !hasTopIdentity) {
      return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
    }
    data = saved.data;
    metadata = saved;
    envelope = "nested-document";
  }
  if (!data?.resultData || typeof data.resultData !== "object" || !Object.prototype.hasOwnProperty.call(data.resultData, "runData")) {
    return failRead(true, OUTCOMES.unavailable, REASONS.executionDataMissing);
  }
  const runData = data.resultData.runData;
  if (!runData || typeof runData !== "object" || Array.isArray(runData)) {
    return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
  }
  if (Object.keys(runData).length > MAX_NODES) return failRead(false, OUTCOMES.unknown, REASONS.invalidInput);
  if (typeof metadata.id !== "string" || metadata.id.length === 0 || typeof metadata.workflowId !== "string" || metadata.workflowId.length === 0) {
    return failRead(false, OUTCOMES.unknown, REASONS.executionIdentityIncomplete);
  }
  if (Object.prototype.hasOwnProperty.call(metadata, "executionId") && metadata.executionId !== metadata.id) {
    return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
  }
  if (metadata.workflowId !== workflowId || metadata.id !== executionId) {
    return failRead(false, OUTCOMES.unknown, REASONS.executionIdentityMismatch);
  }
  if (metadata.status !== "success" || (Object.prototype.hasOwnProperty.call(metadata, "finished") && metadata.finished !== true)) {
    return failRead(false, OUTCOMES.unknown, REASONS.executionStatusRejected);
  }
  if (!Object.prototype.hasOwnProperty.call(runData, nodeName)) {
    return failRead(true, OUTCOMES.unavailable, REASONS.executionNodeMissing);
  }
  const runs = runData[nodeName];
  if (!Array.isArray(runs)) return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
  if (runs.length === 0) return failRead(true, OUTCOMES.unavailable, REASONS.executionItemsMissing);
  if (runs.length !== 1 || !runs[0] || typeof runs[0] !== "object" || Array.isArray(runs[0])) {
    return failRead(false, OUTCOMES.unknown, REASONS.executionAmbiguous);
  }
  const run = runs[0];
  if ((Object.prototype.hasOwnProperty.call(run, "executionStatus") && run.executionStatus !== "success")
    || (Object.prototype.hasOwnProperty.call(run, "error") && run.error != null)) {
    return failRead(false, OUTCOMES.unknown, REASONS.executionStatusRejected);
  }
  const item = onePayload(run);
  if (!item.payload) return item;
  const captureTime = captureTimeOf(run);
  if (!captureTime.iso) {
    return failRead(false, OUTCOMES.unknown, captureTime.missing ? REASONS.executionCaptureTimeMissing : REASONS.executionCaptureTimeInvalid);
  }
  const captureId = `stored-n8n:${workflowId}:${executionId}:${nodeName}`;
  if (captureId.length > 128) return failRead(false, OUTCOMES.unknown, REASONS.invalidInput);
  return {
    ok: true,
    envelope,
    capture: {
      schema: CAPTURE_SCHEMA,
      captureId,
      subject,
      capturedAt: captureTime.iso,
      payload: item.payload,
    },
  };
}

function parseClock(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return { ok: false };
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return { ok: false };
  return { ok: true, ms, iso: new Date(ms).toISOString() };
}

function horizonOf(clockMs, eventIso, horizonHours) {
  if (eventIso == null) return { ok: true, within: false };
  const parsed = parseClock(eventIso);
  if (!parsed.ok) return { ok: false };
  const ageHours = (clockMs - parsed.ms) / 3_600_000;
  if (ageHours < 0) return { ok: true, within: true };
  return { ok: true, within: ageHours <= horizonHours };
}

function controlsFor(outcome, reference) {
  if (!reference || typeof reference !== "object") {
    return { falseChange: false, missedChange: false, referenceMatched: null, referenceLabel: null };
  }
  const expected = reference.expectedOutcome;
  return {
    falseChange: outcome === OUTCOMES.usefulChange && expected === OUTCOMES.usefulNoChange,
    missedChange: outcome === OUTCOMES.usefulNoChange && expected === OUTCOMES.usefulChange,
    referenceMatched: expected === outcome,
    referenceLabel: expected ?? null,
  };
}

function decided({ ok, outcome, useful, reason, within, intent, prior, capture, changed = [], unchanged = [], absent = [], controls }) {
  return {
    ok,
    useful,
    outcome,
    reason,
    freshness: {
      withinHorizon: within,
      captureAt: capture?.capturedAt ?? null,
      priorAt: prior?.capturedAt ?? null,
    },
    decision: {
      intentId: intent?.intentId ?? "",
      subject: intent?.subject ?? "",
      changedFields: changed,
      unchangedFields: unchanged,
      absentFields: absent,
    },
    controls,
  };
}

function finish(outcome, reason, useful, reference, rest) {
  const controls = controlsFor(outcome, reference);
  let nextReason = reason;
  let nextUseful = useful;
  if (controls.falseChange) {
    nextReason = REASONS.referenceFalseChange;
    nextUseful = false;
  }
  if (controls.missedChange) {
    nextReason = REASONS.referenceMissedChange;
    nextUseful = false;
  }
  return decided({ ok: true, ...rest, outcome, reason: nextReason, useful: nextUseful, controls });
}

function directEvaluate({ intent, prior, capture, clock, horizonHours, reference }) {
  if (!intent || intent.schema !== INTENT_SCHEMA || !intent.intentId || !intent.subject
    || !Array.isArray(intent.fields) || intent.fields.length < 1
    || (intent.compare !== "field_equality" && intent.compare !== "payload_digest")) {
    return decided({
      ok: false,
      outcome: OUTCOMES.unknown,
      useful: false,
      reason: REASONS.invalidInput,
      within: false,
      intent,
      prior,
      capture,
      controls: controlsFor(OUTCOMES.unknown, null),
    });
  }
  const clockParsed = parseClock(clock);
  if (!clockParsed.ok || !Number.isFinite(horizonHours) || horizonHours < 0) {
    return decided({
      ok: false,
      outcome: OUTCOMES.unknown,
      useful: false,
      reason: REASONS.invalidInput,
      within: false,
      intent,
      prior,
      capture,
      controls: controlsFor(OUTCOMES.unknown, null),
    });
  }
  if (capture == null) {
    return finish(OUTCOMES.unavailable, REASONS.captureMissing, false, reference, {
      within: false, intent, prior, capture,
    });
  }
  const captureUnsupported = !SUPPORTED_CAPTURE_SCHEMAS.includes(capture.schema)
    || (Array.isArray(intent.supportedCaptureSchemas) && !intent.supportedCaptureSchemas.includes(capture.schema));
  if (captureUnsupported || (prior && !SUPPORTED_CAPTURE_SCHEMAS.includes(prior.schema))) {
    return finish(OUTCOMES.unsupported, REASONS.captureUnsupported, false, reference, {
      within: false, intent, prior, capture,
    });
  }
  if (capture.permission?.permitted === false || prior?.permission?.permitted === false) {
    return finish(OUTCOMES.unavailable, REASONS.notPermitted, false, reference, {
      within: false, intent, prior, capture,
    });
  }
  if (capture.subject !== intent.subject || (prior && prior.subject !== intent.subject)) {
    return finish(OUTCOMES.unsupported, REASONS.subjectMismatch, false, reference, {
      within: false, intent, prior, capture,
    });
  }
  const captureFresh = horizonOf(clockParsed.ms, capture.capturedAt, horizonHours);
  if (!captureFresh.ok) {
    return decided({
      ok: false, outcome: OUTCOMES.unknown, useful: false, reason: REASONS.invalidInput, within: false,
      intent, prior, capture, controls: controlsFor(OUTCOMES.unknown, null),
    });
  }
  if (!captureFresh.within) {
    return finish(OUTCOMES.stale, REASONS.captureStale, false, reference, {
      within: false, intent, prior, capture,
    });
  }
  if (prior == null) {
    return finish(OUTCOMES.unavailable, REASONS.priorMissing, false, reference, {
      within: true, intent, prior, capture, unchanged: intent.fields.slice(),
    });
  }
  const priorFresh = horizonOf(clockParsed.ms, prior.capturedAt, horizonHours);
  if (!priorFresh.ok) {
    return decided({
      ok: false, outcome: OUTCOMES.unknown, useful: false, reason: REASONS.invalidInput, within: false,
      intent, prior, capture, controls: controlsFor(OUTCOMES.unknown, null),
    });
  }
  if (!priorFresh.within) {
    return finish(OUTCOMES.stale, REASONS.priorStale, false, reference, {
      within: false, intent, prior, capture,
    });
  }
  if (intent.compare !== "field_equality") {
    return decided({
      ok: false, outcome: OUTCOMES.unknown, useful: false, reason: REASONS.invalidInput, within: true,
      intent, prior, capture, controls: controlsFor(OUTCOMES.unknown, null),
    });
  }
  const changed = [];
  const unchanged = [];
  const absent = [];
  for (const field of intent.fields) {
    const leftPresent = Object.prototype.hasOwnProperty.call(prior.payload ?? {}, field);
    const rightPresent = Object.prototype.hasOwnProperty.call(capture.payload ?? {}, field);
    if (!leftPresent && !rightPresent) {
      absent.push(field);
      continue;
    }
    const left = leftPresent ? prior.payload[field] : undefined;
    const right = rightPresent ? capture.payload[field] : undefined;
    if (leftPresent && rightPresent && JSON.stringify(left) === JSON.stringify(right)) unchanged.push(field);
    else changed.push(field);
  }
  if (changed.length > 0) {
    return finish(OUTCOMES.usefulChange, REASONS.fieldsDiffer, true, reference, {
      within: true, intent, prior, capture, changed, unchanged, absent,
    });
  }
  if (absent.length > 0) {
    return finish(OUTCOMES.unknown, REASONS.fieldsAbsent, false, reference, {
      within: true, intent, prior, capture, changed, unchanged, absent,
    });
  }
  return finish(OUTCOMES.usefulNoChange, REASONS.fieldsMatch, true, reference, {
    within: true, intent, prior, capture, changed, unchanged, absent,
  });
}

function priorFor(prepared, intentId) {
  if (Object.prototype.hasOwnProperty.call(prepared.priors.byIntent, intentId)) return prepared.priors.byIntent[intentId];
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

function removeDirect(stateDir, intentId) {
  if (!stateDir) return { intentId, removed: false };
  const path = join(stateDir, `${intentId}.json`);
  try {
    unlinkSync(path);
    return { intentId, path, removed: true };
  } catch (error) {
    if (error?.code === "ENOENT") return { intentId, path, removed: false };
    throw error;
  }
}

function cancelResult(prepared) {
  const removed = prepared.stateDir
    ? prepared.intents.map((intent) => removeDirect(prepared.stateDir, intent.intentId))
    : [];
  return shell(prepared, {
    ok: true,
    outcome: BUNDLE_OUTCOMES.cancelled,
    reason: REASONS.scheduleCancelled,
    cancellation: {
      scheduleId: prepared.schedule.scheduleId,
      subject: prepared.schedule.subject,
      scopeIntentIds: prepared.schedule.scope.intentIds.slice(),
      cancelled: true,
      standingWatcher: false,
      removed,
    },
    schedule: { ...prepared.schedule, status: "cancelled" },
  });
}

function dispositionResult(prepared, read) {
  return shell(prepared, {
    ok: read.ok === true,
    outcome: read.outcome,
    reason: read.reason,
    captureDisposition: { preserved: true, outcome: read.outcome, reason: read.reason },
  });
}

function compareResult(prepared, capture, envelope) {
  const decisions = [];
  for (const intent of prepared.intents) {
    const prior = priorFor(prepared, intent.intentId);
    const reference = Object.prototype.hasOwnProperty.call(prepared.references, intent.intentId)
      ? prepared.references[intent.intentId]
      : null;
    const result = directEvaluate({
      intent,
      prior,
      capture,
      clock: prepared.clock,
      horizonHours: prepared.horizonHours,
      reference,
    });
    let adaptation = null;
    if (prepared.adapt && result.ok && result.useful && result.outcome === OUTCOMES.usefulChange
      && result.decision.changedFields.length > 0 && prior) {
      const adaptedPrior = adaptPrior(prior, capture, result.decision.changedFields);
      const adapted = directEvaluate({
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
    }
    decisions.push({ intentId: intent.intentId, result, adaptation, state: null });
  }
  const clock = parseClock(prepared.clock);
  const captureFresh = clock.ok ? horizonOf(clock.ms, capture.capturedAt, prepared.horizonHours) : { ok: false };
  const appliedAdaptations = decisions.filter((decision) => decision.adaptation?.applied === true);
  return shell(prepared, {
    ok: decisions.every((decision) => decision.result.ok === true),
    useful: decisions.some((decision) => decision.result.useful === true),
    outcome: BUNDLE_OUTCOMES.compared,
    reason: REASONS.oneCaptureManyDecisions,
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

export function directRecurringResult(input) {
  const normalized = normalizeRecurringInput(input);
  if (normalized.error) return invalidResult(normalized.error, input?.schedule ?? null);
  const prepared = normalized.value;
  if (prepared.cancel) return cancelResult(prepared);
  if (prepared.saved) {
    const read = readDirectCapture({
      saved: prepared.saved,
      workflowId: prepared.source.workflowId,
      executionId: prepared.source.executionId,
      nodeName: prepared.source.nodeName,
      subject: prepared.schedule.subject,
    });
    if (!read.capture) return dispositionResult(prepared, read);
    return compareResult(prepared, read.capture, read.envelope);
  }
  return compareResult(prepared, prepared.capture, null);
}
