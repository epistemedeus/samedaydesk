import { MAX_INTENTS } from "./limits.mjs";
import { SCHEDULE_SCHEMA } from "./pins.mjs";

const INTENT_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * A product schedule is admitted only when the caller states its scope,
 * keeps it cancellable, and does not install a watcher or a charge.
 */
export function scheduleProblem(schedule, { horizonHours, intentIds, source }) {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) return "schedule required";
  if (schedule.schema !== SCHEDULE_SCHEMA) return "schedule schema unsupported";
  if (schedule.explicit !== true) return "schedule must be explicit";
  if (schedule.cancellable !== true) return "schedule must be cancellable";
  if (schedule.resident === true || schedule.standingWatcher === true) {
    return "schedule must not install a standing watcher";
  }
  if (schedule.paidPromise === true) return "schedule must not make a paid promise";
  if (typeof schedule.scheduleId !== "string" || schedule.scheduleId.length < 1) return "scheduleId required";
  if (typeof schedule.subject !== "string" || schedule.subject.length < 1) return "schedule subject required";
  if (!schedule.cadence || schedule.cadence.kind !== "caller-invoked" || schedule.cadence.resident !== false) {
    return "schedule cadence must be caller-invoked and not resident";
  }
  if (schedule.status !== "prepared" && schedule.status !== "cancelled") {
    return "schedule status must be prepared or cancelled";
  }
  const scope = schedule.scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return "schedule scope required";
  if (!Array.isArray(scope.intentIds) || scope.intentIds.length < 1 || scope.intentIds.length > MAX_INTENTS) {
    return `schedule scope requires 1 to ${MAX_INTENTS} intent ids`;
  }
  if (scope.horizonHours !== horizonHours) return "schedule horizon does not match the run";
  if (new Set(scope.intentIds).size !== scope.intentIds.length) return "schedule intent ids must be unique";
  for (const id of scope.intentIds) {
    if (typeof id !== "string" || !INTENT_ID.test(id)) return "schedule intent id is not a portable state name";
  }
  const left = [...scope.intentIds].sort();
  const right = [...intentIds].sort();
  if (left.length !== right.length || left.some((id, index) => id !== right[index])) {
    return "schedule scope intent ids do not match the supplied intents";
  }
  const src = scope.source;
  if (!src || typeof src !== "object" || src.kind !== source.kind) return "schedule source does not match the run";
  if (src.newCharge !== false) return "schedule must not add a charge";
  if (src.newExecution !== false) return "schedule must not request a new execution";
  if (source.kind === "stored-n8n") {
    if (src.workflowId !== source.workflowId || src.executionId !== source.executionId || src.nodeName !== source.nodeName) {
      return "schedule source identity does not match the stored execution";
    }
  } else if (source.kind === "permitted-capture") {
    if (src.captureId !== source.captureId) return "schedule source capture id does not match";
  } else {
    return "schedule source kind is unsupported";
  }
  return null;
}

export function intentIdProblem(intentId) {
  if (typeof intentId !== "string" || !INTENT_ID.test(intentId)) return "intent id is not a portable state name";
  return null;
}

function sourceOf(input) {
  const hasSaved = input.saved != null;
  const hasCapture = input.capture != null;
  if (hasSaved === hasCapture) return { error: "provide one stored execution or one permitted capture" };
  if (hasSaved) {
    return {
      kind: "stored-n8n",
      workflowId: input.workflowId,
      executionId: input.executionId,
      nodeName: input.nodeName,
    };
  }
  if (!input.capture || typeof input.capture !== "object" || typeof input.capture.captureId !== "string") {
    return { error: "permitted capture requires captureId" };
  }
  return { kind: "permitted-capture", captureId: input.capture.captureId };
}

export function normalizeRecurringInput(input) {
  if (!input || typeof input !== "object") return { error: "recurring input required" };
  if (!Array.isArray(input.intents) || input.intents.length < 1 || input.intents.length > MAX_INTENTS) {
    return { error: `provide 1 to ${MAX_INTENTS} decision intents` };
  }
  if (!Number.isFinite(input.horizonHours) || input.horizonHours < 0) {
    return { error: "horizonHours must be a non-negative number" };
  }
  if (typeof input.clock !== "string") return { error: "clock required" };
  if (input.adapt === true && input.cancel === true) return { error: "adapt and cancel are separate caller actions" };
  const ids = [];
  for (const intent of input.intents) {
    if (!intent || typeof intent !== "object") return { error: "each intent must be an object" };
    const idProblem = intentIdProblem(intent.intentId);
    if (idProblem) return { error: idProblem };
    ids.push(intent.intentId);
  }
  const source = sourceOf(input);
  if (source.error) return { error: source.error };
  const scheduleError = scheduleProblem(input.schedule, {
    horizonHours: input.horizonHours,
    intentIds: ids,
    source,
  });
  if (scheduleError) return { error: scheduleError };
  const priors = input.priors ?? { default: null, byIntent: {} };
  if (!priors || typeof priors !== "object" || Array.isArray(priors)) return { error: "priors must be an object" };
  const byIntent = priors.byIntent ?? {};
  if (!byIntent || typeof byIntent !== "object" || Array.isArray(byIntent)) return { error: "priors.byIntent must be an object" };
  const references = input.references ?? { byIntent: {} };
  const referenceByIntent = references.byIntent ?? {};
  if (!referenceByIntent || typeof referenceByIntent !== "object" || Array.isArray(referenceByIntent)) {
    return { error: "references.byIntent must be an object" };
  }
  const idSet = new Set(ids);
  for (const key of Object.keys(byIntent)) {
    if (!idSet.has(key)) return { error: "priors.byIntent names an intent outside the schedule" };
  }
  for (const key of Object.keys(referenceByIntent)) {
    if (!idSet.has(key)) return { error: "references.byIntent names an intent outside the schedule" };
  }
  const orderedIntents = input.schedule.scope.intentIds.map((id) => input.intents.find((intent) => intent.intentId === id));
  return {
    value: {
      saved: input.saved ?? null,
      capture: input.capture ?? null,
      source,
      intents: orderedIntents,
      priors: { default: priors.default ?? null, byIntent },
      references: referenceByIntent,
      clock: input.clock,
      horizonHours: input.horizonHours,
      schedule: input.schedule,
      stateDir: input.stateDir ?? null,
      adapt: input.adapt === true,
      cancel: input.cancel === true || input.schedule.status === "cancelled",
      ownerQaPriors: input.ownerQaPriors === true,
      derivedFixture: input.saved?.derived === true,
    },
  };
}
