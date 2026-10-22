import { digestJson } from "./canonical.mjs";
import { parseInstant } from "./clock.mjs";
import { MonitorError } from "./errors.mjs";
import { parseRevisionPatch, parseSubscription } from "./subscription.mjs";

export const STATE_SCHEMA = "change-monitor.state.v1";
export const EVENT_SCHEMA = "change-monitor.event.v1";

export function emptyUsage() {
  return {
    checks: 0,
    unchanged: 0,
    baselinesEstablished: 0,
    usefulEvents: 0,
    contentChanged: 0,
    serviceRestored: 0,
    evidenceUnavailable: 0,
    suppressedByBudget: 0,
    admissionsRefused: 0,
  };
}

export function emptyState() {
  return {
    schema: STATE_SCHEMA,
    subscriptions: {},
    evidence: {},
    events: {},
    deliveries: {},
    acknowledgements: {},
    corrections: [],
    usage: {},
  };
}

export function selectMaterial(material, fields) {
  if (!fields) return material;
  const out = {};
  for (const key of [...fields].sort()) {
    out[key] = material[key] === undefined ? null : material[key];
  }
  return out;
}

export function sealObservation(partial) {
  const comparable = partial.evidenceClass === "comparable";
  const material = comparable
    ? {
        ...partial.material,
        sourceVersion: partial.sourceVersion ?? null,
        coverage: partial.coverage ?? null,
      }
    : null;
  const materialDigest = material == null ? null : digestJson(material);
  const failureFingerprint = comparable
    ? null
    : digestJson({
        evidenceClass: partial.evidenceClass,
        failureCode: partial.failureCode || partial.evidenceClass,
        sourceVersion: partial.sourceVersion ?? null,
        coverage: partial.coverage ?? null,
      });
  const sealed = {
    ...partial,
    material,
    materialDigest,
    failureFingerprint,
  };
  sealed.evidenceId = digestJson({
    schema: "change-monitor.evidence-identity.v1",
    sourceKind: sealed.sourceKind,
    sourceScope: sealed.sourceScope,
    sourceVersion: sealed.sourceVersion ?? null,
    evidenceClass: sealed.evidenceClass,
    materialDigest,
    failureFingerprint,
    correctsEvidenceId: sealed.correctsEvidenceId ?? null,
  });
  return sealed;
}

export function eventIdFor(identity) {
  return digestJson({
    schema: "change-monitor.event-identity.v1",
    subscriptionId: identity.subscriptionId,
    subscriptionRevision: identity.subscriptionRevision,
    priorBaselineDigest: identity.priorBaselineDigest ?? null,
    evidenceClass: identity.evidenceClass,
    materialDigest: identity.materialDigest ?? null,
    failureFingerprint: identity.failureFingerprint ?? null,
    transition: identity.transition,
    admissionOrdinal: identity.admissionOrdinal,
  });
}

function requireSubscription(state, subscriptionId) {
  const subscription = state.subscriptions[subscriptionId];
  if (!subscription) throw new MonitorError("subscription not found", { code: "unknown_subscription" });
  return subscription;
}

function touchExpiry(subscription, now) {
  if (subscription.status !== "active" && subscription.status !== "paused") return;
  if (parseInstant(now, "now") < parseInstant(subscription.expiresAt, "expiresAt")) return;
  subscription.status = "expired";
  subscription.statusReason = "expired";
  subscription.updatedAt = now;
  subscription.revisionLog.push({ revision: subscription.revision, at: now, action: "expired", baselineReset: false });
}

function baselineFrom(sealed) {
  return {
    evidenceId: sealed.evidenceId,
    materialDigest: sealed.materialDigest,
    sourceVersion: sealed.sourceVersion ?? null,
    observedAt: sealed.observedAt ?? null,
    coverage: sealed.coverage ?? null,
  };
}

function rememberEvidence(state, subscription, sealed, now) {
  if (state.evidence[sealed.evidenceId]) return;
  state.evidence[sealed.evidenceId] = {
    evidenceId: sealed.evidenceId,
    subscriptionId: subscription.subscriptionId,
    receivedAt: now,
    sourceKind: sealed.sourceKind,
    sourceScope: sealed.sourceScope,
    sourceVersion: sealed.sourceVersion ?? null,
    observedAt: sealed.observedAt ?? null,
    evidenceClass: sealed.evidenceClass,
    material: sealed.material,
    materialDigest: sealed.materialDigest,
    coverage: sealed.coverage ?? null,
    nonSemantic: sealed.nonSemantic ?? null,
    failureCode: sealed.failureCode ?? null,
    failureFingerprint: sealed.failureFingerprint,
    correctsEvidenceId: sealed.correctsEvidenceId ?? null,
    adapterId: sealed.adapterId,
    schemaId: sealed.schemaId ?? null,
  };
}

function taskFor(transition, evidenceClass) {
  if (transition === "content_changed") {
    return { rerun: true, disposition: "rerun_affected_task", reason: "Material task fields changed." };
  }
  if (transition === "service_restored") {
    return { rerun: true, disposition: "rerun_affected_task", reason: "Comparable evidence returned for this scope." };
  }
  return {
    rerun: false,
    disposition: "do_not_treat_as_content_change",
    reason: `Evidence is ${evidenceClass}. This is not a content change and not a zero value.`,
  };
}

function decideTransition(subscription, sealed) {
  if (sealed.evidenceClass !== "comparable") {
    if (
      subscription.currentClass === sealed.evidenceClass &&
      subscription.lastFailureFingerprint === sealed.failureFingerprint
    ) {
      return { emit: false, transition: "unchanged", serviceRestored: false };
    }
    return { emit: true, transition: "evidence_unavailable", serviceRestored: false };
  }
  if (!subscription.baseline) {
    return { emit: false, transition: "baseline_established", serviceRestored: false };
  }
  const sameMaterial = sealed.materialDigest === subscription.baseline.materialDigest;
  const sameVersion = (sealed.sourceVersion ?? null) === (subscription.baseline.sourceVersion ?? null);
  const wasDown = Boolean(subscription.currentClass) && subscription.currentClass !== "comparable";
  if (sameMaterial && sameVersion && wasDown) {
    return { emit: true, transition: "service_restored", serviceRestored: true };
  }
  if (sameMaterial && sameVersion) {
    return { emit: false, transition: "unchanged", serviceRestored: false };
  }
  return { emit: true, transition: "content_changed", serviceRestored: wasDown };
}

function recordCorrection(state, subscription, sealed, now, eventId) {
  if (!sealed.correctsEvidenceId) return;
  state.corrections.push({
    at: now,
    subscriptionId: subscription.subscriptionId,
    correctsEvidenceId: sealed.correctsEvidenceId,
    evidenceId: sealed.evidenceId,
    eventId,
  });
}

function acceptCursor(subscription, sealed, now) {
  if (sealed.evidenceClass === "comparable") {
    subscription.baseline = baselineFrom(sealed);
    subscription.lastFailureFingerprint = null;
  } else {
    subscription.lastFailureFingerprint = sealed.failureFingerprint;
  }
  subscription.currentClass = sealed.evidenceClass;
  subscription.lastAcceptedEvidenceId = sealed.evidenceId;
  subscription.updatedAt = now;
}

export function applySubscribe(state, input, ctx) {
  const subscription = parseSubscription(input, ctx);
  if (state.subscriptions[subscription.subscriptionId]) {
    throw new MonitorError("subscription already exists", { code: "subscription_exists" });
  }
  state.subscriptions[subscription.subscriptionId] = subscription;
  state.usage[subscription.subscriptionId] = emptyUsage();
  return { subscription };
}

export function applyRevise(state, { subscriptionId, patch }, ctx) {
  const subscription = requireSubscription(state, subscriptionId);
  touchExpiry(subscription, ctx.now);
  if (subscription.status === "cancelled" || subscription.status === "expired") {
    throw new MonitorError("a terminal subscription cannot be revised", { code: "terminal" });
  }
  const next = parseRevisionPatch(patch, { ...ctx, current: subscription });
  subscription.expiresAt = next.expiresAt;
  subscription.budget = next.budget;
  subscription.destination = next.destination;
  subscription.comparison = next.comparison;
  subscription.revision += 1;
  subscription.updatedAt = ctx.now;
  if (next.baselineReset) {
    subscription.baseline = null;
    subscription.currentClass = null;
    subscription.lastAcceptedEvidenceId = null;
    subscription.lastFailureFingerprint = null;
  }
  subscription.revisionLog.push({
    revision: subscription.revision,
    at: ctx.now,
    action: "revise",
    baselineReset: next.baselineReset,
  });
  return { subscription, baselineReset: next.baselineReset };
}

export function applyPause(state, { subscriptionId, now }) {
  const subscription = requireSubscription(state, subscriptionId);
  touchExpiry(subscription, now);
  if (subscription.status === "expired") return { subscription, outcome: "expired" };
  if (subscription.status === "cancelled") {
    throw new MonitorError("cancelled subscription cannot be paused", { code: "terminal" });
  }
  if (subscription.status === "paused") return { subscription, outcome: "paused", replay: true };
  subscription.status = "paused";
  subscription.statusReason = "paused";
  subscription.updatedAt = now;
  subscription.revisionLog.push({ revision: subscription.revision, at: now, action: "pause", baselineReset: false });
  return { subscription, outcome: "paused" };
}

export function applyResume(state, { subscriptionId, now }) {
  const subscription = requireSubscription(state, subscriptionId);
  touchExpiry(subscription, now);
  if (subscription.status === "expired") return { subscription, outcome: "expired" };
  if (subscription.status === "cancelled") {
    throw new MonitorError("cancelled subscription cannot be resumed", { code: "terminal" });
  }
  if (subscription.status !== "paused") {
    throw new MonitorError("only a paused subscription can be resumed", { code: "not_paused" });
  }
  subscription.status = "active";
  subscription.statusReason = null;
  subscription.updatedAt = now;
  subscription.revisionLog.push({ revision: subscription.revision, at: now, action: "resume", baselineReset: false });
  return { subscription, outcome: "active" };
}

export function applyCancel(state, { subscriptionId, now }) {
  const subscription = requireSubscription(state, subscriptionId);
  const eventCount = Object.keys(state.events).length;
  if (subscription.status === "cancelled") {
    return { subscription, outcome: "cancelled", replay: true, eventCount };
  }
  if (subscription.status === "expired") {
    return { subscription, outcome: "expired", eventCount };
  }
  subscription.status = "cancelled";
  subscription.statusReason = "cancelled";
  subscription.updatedAt = now;
  subscription.revisionLog.push({ revision: subscription.revision, at: now, action: "cancel", baselineReset: false });
  return { subscription, outcome: "cancelled", eventCount: Object.keys(state.events).length };
}

function refused(usage, outcome) {
  usage.checks += 1;
  usage.admissionsRefused += 1;
  return { admitted: false, outcome, eventId: null, evidenceId: null, evidenceClass: null };
}

export function applyObservation(state, { subscriptionId, normalized, now }) {
  const subscription = requireSubscription(state, subscriptionId);
  const usage = state.usage[subscriptionId];
  touchExpiry(subscription, now);
  if (subscription.status !== "active") {
    const outcome = subscription.status === "paused" ? "paused" : subscription.status;
    return refused(usage, outcome);
  }
  const sealed = normalized.evidenceId ? normalized : sealObservation(normalized);
  if (sealed.sourceScope !== subscription.source.scope || sealed.sourceKind !== subscription.source.kind) {
    throw new MonitorError("normalized observation scope does not match the subscription", { code: "scope" });
  }
  if (subscription.lastAcceptedEvidenceId === sealed.evidenceId) {
    usage.checks += 1;
    usage.unchanged += 1;
    return {
      admitted: false,
      outcome: "unchanged",
      replay: true,
      eventId: null,
      evidenceId: sealed.evidenceId,
      evidenceClass: sealed.evidenceClass,
    };
  }
  const decision = decideTransition(subscription, sealed);
  if (decision.emit && usage.usefulEvents >= subscription.budget.maxUsefulEvents) {
    usage.checks += 1;
    usage.suppressedByBudget += 1;
    usage.admissionsRefused += 1;
    return {
      admitted: false,
      outcome: "budget_exhausted",
      eventId: null,
      evidenceId: null,
      evidenceClass: sealed.evidenceClass,
      transition: decision.transition,
    };
  }
  rememberEvidence(state, subscription, sealed, now);
  if (!decision.emit) {
    acceptCursor(subscription, sealed, now);
    usage.checks += 1;
    if (decision.transition === "baseline_established") usage.baselinesEstablished += 1;
    if (decision.transition === "unchanged") usage.unchanged += 1;
    recordCorrection(state, subscription, sealed, now, null);
    return {
      admitted: false,
      outcome: decision.transition,
      eventId: null,
      evidenceId: sealed.evidenceId,
      evidenceClass: sealed.evidenceClass,
    };
  }
  const identity = {
    subscriptionId,
    subscriptionRevision: subscription.revision,
    priorBaselineDigest: subscription.baseline?.materialDigest ?? null,
    evidenceClass: sealed.evidenceClass,
    materialDigest: sealed.materialDigest,
    failureFingerprint: sealed.failureFingerprint,
    transition: decision.transition,
    admissionOrdinal: usage.usefulEvents,
  };
  const eventId = eventIdFor(identity);
  let created = false;
  if (!state.events[eventId]) {
    created = true;
    state.events[eventId] = {
      schema: EVENT_SCHEMA,
      eventId,
      idempotencyKey: eventId,
      subscriptionId,
      subscriptionRevision: subscription.revision,
      admissionOrdinal: identity.admissionOrdinal,
      owner: subscription.owner,
      source: {
        kind: subscription.source.kind,
        scope: subscription.source.scope,
        version: sealed.sourceVersion ?? null,
      },
      transition: decision.transition,
      serviceRestored: decision.serviceRestored,
      priorBaselineDigest: identity.priorBaselineDigest,
      evidenceId: sealed.evidenceId,
      evidenceClass: sealed.evidenceClass,
      materialDigest: sealed.materialDigest,
      material: sealed.material,
      failureCode: sealed.failureCode ?? null,
      capture: sealed.nonSemantic?.capture ?? null,
      correctsEvidenceId: sealed.correctsEvidenceId ?? null,
      priorEventId: subscription.lastEventId,
      admittedAt: now,
      destination: { receiverId: subscription.destination.receiverId },
      task: taskFor(decision.transition, sealed.evidenceClass),
      identity,
    };
    state.deliveries[eventId] = {
      eventId,
      idempotencyKey: eventId,
      state: "pending",
      delivered: false,
      attempts: [],
    };
    usage.usefulEvents += 1;
    if (decision.transition === "content_changed") usage.contentChanged += 1;
    if (decision.transition === "service_restored") usage.serviceRestored += 1;
    if (decision.transition === "evidence_unavailable") usage.evidenceUnavailable += 1;
  }
  acceptCursor(subscription, sealed, now);
  subscription.lastEventId = eventId;
  usage.checks += 1;
  recordCorrection(state, subscription, sealed, now, eventId);
  return {
    admitted: created,
    outcome: decision.transition,
    eventId,
    evidenceId: sealed.evidenceId,
    evidenceClass: sealed.evidenceClass,
    replayedEvent: !created,
  };
}

function reduceDeliveryState(current, outcome) {
  if (current === "accepted" || current === "failed") return current;
  if (outcome === "accepted" || outcome === "duplicate") return "accepted";
  if (outcome === "failed" || outcome === "rejected") return "failed";
  if (outcome === "unknown") return "unknown";
  if (outcome === "absent") return current === "unknown" ? "pending" : current;
  return current;
}

export function applyDeliveryReport(state, { eventId, at, outcome, httpStatus = null, error = null }) {
  const delivery = state.deliveries[eventId];
  if (!delivery || !state.events[eventId]) {
    throw new MonitorError("delivery event not found", { code: "unknown_event" });
  }
  const next = reduceDeliveryState(delivery.state, outcome);
  const applied = next !== delivery.state;
  delivery.attempts.push({
    n: delivery.attempts.length + 1,
    at,
    outcome,
    httpStatus,
    error: typeof error === "string" ? error.slice(0, 200) : null,
    applied,
  });
  if (delivery.attempts.length > 50) delivery.attempts.splice(0, delivery.attempts.length - 50);
  delivery.state = next;
  delivery.delivered = next === "accepted";
  return { eventId, state: next, outcome, applied, delivered: delivery.delivered };
}

export function applyAck(state, { eventId, by, at, note = null }) {
  const event = state.events[eventId];
  const delivery = state.deliveries[eventId];
  if (!event || !delivery) throw new MonitorError("event not found", { code: "unknown_event" });
  if (typeof by !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,80}$/.test(by)) {
    throw new MonitorError("acknowledgedBy must be a short name", { code: "bad_ack" });
  }
  if (delivery.state !== "accepted") {
    throw new MonitorError("acknowledgement requires an accepted delivery and does not create success", {
      code: "ack_not_accepted",
    });
  }
  if (state.acknowledgements[eventId]) {
    return { acknowledgement: state.acknowledgements[eventId], replay: true };
  }
  const acknowledgement = {
    eventId,
    acknowledgedBy: by,
    acknowledgedAt: at,
    note,
    deliveryStateAtAck: delivery.state,
    provenance: {
      evidenceId: event.evidenceId,
      transition: event.transition,
      subscriptionRevision: event.subscriptionRevision,
      materialDigest: event.materialDigest,
      correctsEvidenceId: event.correctsEvidenceId,
    },
  };
  state.acknowledgements[eventId] = acknowledgement;
  return { acknowledgement, replay: false };
}
