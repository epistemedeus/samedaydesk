import { adapterFor, failureObservation, normalizeDocument } from "./adapters/registry.mjs";
import { systemClock } from "./clock.mjs";
import { reconcileLocalHttp, sendLocalHttp } from "./deliver.mjs";
import { MonitorError } from "./errors.mjs";
import { validateReceiverRegistry } from "./receivers.mjs";
import { sealObservation, selectMaterial } from "./transition.mjs";
import {
  applyAck,
  applyCancel,
  applyDeliveryReport,
  applyObservation,
  applyPause,
  applyResume,
  applyRevise,
  applySubscribe,
} from "./transition.mjs";
import { listConsumable, usageReceipt } from "./usage.mjs";

const DOCUMENT_LIMIT = 256000;

function knownReceivers(registry) {
  return new Set(Object.keys(registry));
}

function assertDocumentSize(document) {
  if (document === undefined) {
    throw new MonitorError("observation document is required", { code: "invalid_observation" });
  }
  const encoded = JSON.stringify(document);
  if (encoded && encoded.length > DOCUMENT_LIMIT) {
    throw new MonitorError("observation document is too large", { code: "document_too_large" });
  }
}

function prepareNormalized(subscription, document, sourceFailure, correctsEvidenceId) {
  const raw = sourceFailure
    ? failureObservation(subscription, sourceFailure, { correctsEvidenceId })
    : normalizeDocument(subscription, document, { correctsEvidenceId });
  raw.correctsEvidenceId = correctsEvidenceId ?? null;
  if (raw.evidenceClass === "comparable" && subscription.comparison.materialFields) {
    raw.material = selectMaterial(raw.material, subscription.comparison.materialFields);
  }
  return sealObservation(raw);
}

async function dispatch(registry, event, fetchImpl, timeoutMs) {
  const receiver = registry[event.destination.receiverId];
  if (!receiver) {
    return { outcome: "unknown", httpStatus: null, error: "receiver_not_registered" };
  }
  if (receiver.kind === "injected") return receiver.send(event);
  return sendLocalHttp({ baseUrl: receiver.baseUrl, event, fetchImpl, timeoutMs });
}

async function probe(registry, event, fetchImpl, timeoutMs) {
  const receiver = registry[event.destination.receiverId];
  if (!receiver) return { outcome: "unknown", httpStatus: null, error: "receiver_not_registered" };
  if (receiver.kind === "injected") {
    if (!receiver.reconcile) return { outcome: "unknown", httpStatus: null, error: "reconcile_unsupported" };
    return receiver.reconcile(event.idempotencyKey);
  }
  return reconcileLocalHttp({ baseUrl: receiver.baseUrl, idempotencyKey: event.idempotencyKey, fetchImpl, timeoutMs });
}

export function createMonitor({
  store,
  clock = systemClock(),
  receivers = {},
  fetchImpl = globalThis.fetch,
  deliveryTimeoutMs = 5000,
  afterClaim = null,
  afterSend = null,
} = {}) {
  if (!store || typeof store.transact !== "function") {
    throw new MonitorError("store is required", { code: "store_required" });
  }
  const registry = validateReceiverRegistry(receivers);
  const names = knownReceivers(registry);

  return {
    async subscribe(input) {
      return store.transact((draft) => applySubscribe(draft, input, { now: clock.now(), knownReceivers: names, adapterFor }));
    },
    async revise(subscriptionId, patch) {
      return store.transact((draft) =>
        applyRevise(draft, { subscriptionId, patch }, { now: clock.now(), knownReceivers: names, adapterFor }),
      );
    },
    async pause(subscriptionId) {
      return store.transact((draft) => applyPause(draft, { subscriptionId, now: clock.now() }));
    },
    async resume(subscriptionId) {
      return store.transact((draft) => applyResume(draft, { subscriptionId, now: clock.now() }));
    },
    async cancel(subscriptionId) {
      return store.transact((draft) => applyCancel(draft, { subscriptionId, now: clock.now() }));
    },
    async observe({ subscriptionId, document, sourceFailure = null }) {
      if (!sourceFailure) assertDocumentSize(document);
      return store.transact((draft) => {
        const subscription = draft.subscriptions[subscriptionId];
        if (!subscription) throw new MonitorError("subscription not found", { code: "unknown_subscription" });
        const normalized = prepareNormalized(subscription, document, sourceFailure, null);
        return applyObservation(draft, { subscriptionId, normalized, now: clock.now() });
      });
    },
    async correct({ subscriptionId, correctsEvidenceId, document }) {
      assertDocumentSize(document);
      return store.transact((draft) => {
        const prior = draft.evidence[correctsEvidenceId];
        if (!prior || prior.subscriptionId !== subscriptionId) {
          throw new MonitorError("correction target is unknown", { code: "unknown_evidence" });
        }
        const subscription = draft.subscriptions[subscriptionId];
        const normalized = prepareNormalized(subscription, document, null, correctsEvidenceId);
        return applyObservation(draft, { subscriptionId, normalized, now: clock.now() });
      });
    },
    async deliver({ subscriptionId = null, eventId = null, limit = 10 } = {}) {
      const bounded = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 10;
      const snapshot = await store.read();
      const pending = Object.values(snapshot.deliveries)
        .filter((delivery) => delivery.state === "pending")
        .filter((delivery) => {
          if (eventId && delivery.eventId !== eventId) return false;
          if (!subscriptionId) return true;
          return snapshot.events[delivery.eventId]?.subscriptionId === subscriptionId;
        })
        .slice(0, bounded);
      const results = [];
      for (const delivery of pending) {
        const claimed = await store.transact((draft) => {
          const live = draft.deliveries[delivery.eventId];
          if (!live || live.state !== "pending") return null;
          const event = draft.events[delivery.eventId];
          applyDeliveryReport(draft, {
            eventId: event.eventId,
            at: clock.now(),
            outcome: "unknown",
            httpStatus: null,
            error: "dispatch_started",
          });
          return structuredClone(event);
        });
        if (!claimed) continue;
        if (typeof afterClaim === "function") await afterClaim(claimed);
        let report;
        try {
          report = await dispatch(registry, claimed, fetchImpl, deliveryTimeoutMs);
        } catch {
          report = { outcome: "unknown", httpStatus: null, error: "send_failed" };
        }
        if (typeof afterSend === "function") await afterSend(claimed, report);
        const recorded = await store.transact((draft) =>
          applyDeliveryReport(draft, {
            eventId: claimed.eventId,
            at: clock.now(),
            outcome: report.outcome,
            httpStatus: report.httpStatus ?? null,
            error: report.error ?? null,
          }),
        );
        results.push(recorded);
      }
      return results;
    },
    async reconcile({ subscriptionId = null, limit = 10 } = {}) {
      const bounded = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 10;
      const snapshot = await store.read();
      const unknown = Object.values(snapshot.deliveries)
        .filter((delivery) => delivery.state === "unknown")
        .filter((delivery) => {
          if (!subscriptionId) return true;
          return snapshot.events[delivery.eventId]?.subscriptionId === subscriptionId;
        })
        .slice(0, bounded);
      const results = [];
      for (const delivery of unknown) {
        const current = await store.read();
        const live = current.deliveries[delivery.eventId];
        if (!live || live.state !== "unknown") continue;
        const event = current.events[delivery.eventId];
        const report = await probe(registry, event, fetchImpl, deliveryTimeoutMs);
        const recorded = await store.transact((draft) =>
          applyDeliveryReport(draft, {
            eventId: event.eventId,
            at: clock.now(),
            outcome: report.outcome,
            httpStatus: report.httpStatus ?? null,
            error: report.error ?? null,
          }),
        );
        results.push(recorded);
      }
      return results;
    },
    async acknowledge({ eventId, by, note = null }) {
      return store.transact((draft) => applyAck(draft, { eventId, by, at: clock.now(), note }));
    },
    async usage(subscriptionId) {
      const state = await store.read();
      return usageReceipt(state, subscriptionId, clock.now());
    },
    async list(subscriptionId) {
      const state = await store.read();
      return listConsumable(state, subscriptionId);
    },
    async read() {
      return store.read();
    },
  };
}
