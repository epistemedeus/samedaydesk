import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { assertF08Receipt } from "./receipt-shape.mjs";
import { assertLoopbackCallbackUrl, callbackOrigin } from "./loopback.mjs";
import { deliveryTermsFromReceipt, eventIdFromTermsHash, hashBody, hashTerms } from "./hash-terms.mjs";
import { redactResultReferences } from "./redact.mjs";
import { parseAck, postCallbackOnce } from "./http-post.mjs";
import { refuse } from "./errors.mjs";

function nowIso() {
  return new Date().toISOString();
}

export async function enqueue(store, { receipt, callbackUrl, eventId }) {
  const rec = assertF08Receipt(receipt);
  const url = assertLoopbackCallbackUrl(callbackUrl);
  const origin = callbackOrigin(url);
  const terms = deliveryTermsFromReceipt(rec, origin);
  const termsHash = hashTerms(terms);
  const id = eventId || eventIdFromTermsHash(termsHash);
  const payload = redactResultReferences({
    eventId: id,
    receipt: rec,
    termsHash,
    termsVersion: terms.termsVersion,
    callbackOrigin: origin,
  });
  const bodyHash = hashBody({ callbackUrl: url.toString(), payload });
  const event = {
    eventId: id,
    bodyHash,
    termsHash,
    termsVersion: terms.termsVersion,
    deliveryState: "queued",
    sample: Boolean(rec.sample),
    sold: false,
    buyerAccepted: false,
    sale: false,
    callbackAcknowledged: false,
    callbackUrl: url.toString(),
    payload,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    attempts: [],
  };
  const result = await store.putNew(event);
  return {
    ok: true,
    duplicate: result.duplicate,
    event: publicEvent(result.event),
    network: false,
  };
}

export async function deliverOnce(store, { eventId, optIn, attemptReadyPath, timeoutMs }) {
  if (!optIn) {
    refuse("opt-in-required", "deliver-once requires --opt-in; default is no network");
  }
  const event = await store.get(eventId);
  if (!event) refuse("event-not-found", "Unknown eventId", { eventId });
  if (event.deliveryState === "delivered") {
    return { ok: true, already: true, event: publicEvent(event), network: false };
  }
  if (event.deliveryState === "unknown") {
    refuse("unknown-outcome-no-auto-replay", "Unknown delivery outcome is not failed or delivered; automatic POST replay is refused", {
      eventId,
      deliveryState: "unknown",
    });
  }
  if (event.deliveryState === "failed") {
    refuse("failed-no-auto-replay", "Failed delivery is not replayed automatically", {
      eventId,
      deliveryState: "failed",
    });
  }
  assertLoopbackCallbackUrl(event.callbackUrl);

  const attempt = {
    attemptId: `att_${randomUUID()}`,
    recordedAt: nowIso(),
    outcome: "unknown",
    httpStatus: null,
    ack: null,
    error: null,
  };
  await store.recordAttempt({ eventId, attempt });
  if (attemptReadyPath) {
    writeFileSync(attemptReadyPath, `${JSON.stringify({ eventId, attemptId: attempt.attemptId })}\n`);
  }

  const httpResult = await postCallbackOnce({
    url: event.callbackUrl,
    payload: event.payload,
    eventId,
    attemptId: attempt.attemptId,
    timeoutMs,
  });

  if (httpResult.kind !== "complete") {
    const updated = await store.completeAttempt({
      eventId,
      attemptId: attempt.attemptId,
      outcome: "unknown",
      httpStatus: null,
      ack: null,
      error: httpResult.error || "incomplete-http",
    });
    return {
      ok: true,
      event: publicEvent(updated),
      deliveryState: "unknown",
      network: true,
      note: "Incomplete HTTP is unknown, not failed or delivered",
    };
  }

  const ack = parseAck(httpResult.raw, eventId);
  if (httpResult.status >= 200 && httpResult.status < 300 && ack.ok) {
    const updated = await store.completeAttempt({
      eventId,
      attemptId: attempt.attemptId,
      outcome: "delivered",
      httpStatus: httpResult.status,
      ack: ack.ack,
      error: null,
    });
    return {
      ok: true,
      event: publicEvent(updated),
      deliveryState: "delivered",
      network: true,
      note: "Callback ack is not buyer acceptance or a sale",
    };
  }

  const updated = await store.completeAttempt({
    eventId,
    attemptId: attempt.attemptId,
    outcome: "failed",
    httpStatus: httpResult.status,
    ack: ack.parsed || null,
    error: ack.reason || `http-${httpResult.status}`,
  });
  return {
    ok: true,
    event: publicEvent(updated),
    deliveryState: "failed",
    network: true,
  };
}

export async function status(store, { eventId } = {}) {
  if (eventId) {
    const event = await store.get(eventId);
    if (!event) refuse("event-not-found", "Unknown eventId", { eventId });
    return { ok: true, event: publicEvent(event) };
  }
  const events = await store.list();
  return { ok: true, count: events.length, events: events.map(publicEvent) };
}

export async function reconcile(store) {
  const events = (await store.list()).map(publicEvent);
  const unknown = events.filter((e) => e.deliveryState === "unknown");
  return {
    ok: true,
    network: false,
    autoReplay: false,
    counts: {
      queued: events.filter((e) => e.deliveryState === "queued").length,
      unknown: unknown.length,
      failed: events.filter((e) => e.deliveryState === "failed").length,
      delivered: events.filter((e) => e.deliveryState === "delivered").length,
    },
    unknownEventIds: unknown.map((e) => e.eventId),
    note: "Reconcile never POSTs. Unknown stays unknown until an operator inspects. Callback ack is not a sale.",
    events,
  };
}

export function publicEvent(event) {
  return {
    eventId: event.eventId,
    deliveryState: event.deliveryState,
    sample: Boolean(event.sample),
    sold: false,
    sale: false,
    buyerAccepted: false,
    callbackAcknowledged: event.deliveryState === "delivered" || event.callbackAcknowledged === true,
    termsHash: event.termsHash,
    termsVersion: event.termsVersion,
    bodyHash: event.bodyHash,
    callbackUrl: event.callbackUrl,
    payload: event.payload,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    attempts: event.attempts || [],
  };
}
