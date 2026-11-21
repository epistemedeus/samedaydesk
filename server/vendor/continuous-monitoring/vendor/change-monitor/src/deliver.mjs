import { assertLoopbackBaseUrl } from "./receivers.mjs";

export function publicEvent(event) {
  return {
    schema: event.schema,
    eventId: event.eventId,
    idempotencyKey: event.idempotencyKey,
    subscriptionId: event.subscriptionId,
    subscriptionRevision: event.subscriptionRevision,
    owner: event.owner,
    source: event.source,
    transition: event.transition,
    serviceRestored: event.serviceRestored,
    evidenceId: event.evidenceId,
    evidenceClass: event.evidenceClass,
    materialDigest: event.materialDigest,
    material: event.material,
    failureCode: event.failureCode,
    capture: event.capture ?? null,
    correctsEvidenceId: event.correctsEvidenceId,
    priorEventId: event.priorEventId,
    admittedAt: event.admittedAt,
    destination: event.destination,
    task: event.task,
  };
}

export function classifyDeliveryResponse(status, parsed, key) {
  const httpStatus = Number.isInteger(status) ? status : null;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    if (httpStatus === null || httpStatus >= 500 || httpStatus === 408 || httpStatus === 429) {
      return { outcome: "unknown", httpStatus, error: "unreadable_body" };
    }
    if (httpStatus >= 400) return { outcome: "failed", httpStatus, error: "rejected_unreadable" };
    return { outcome: "unknown", httpStatus, error: "success_unconfirmed" };
  }
  const echoed = typeof parsed.idempotencyKey === "string" ? parsed.idempotencyKey : null;
  if (httpStatus !== null && httpStatus >= 200 && httpStatus < 300) {
    if (echoed !== key || parsed.accepted !== true) {
      return { outcome: "unknown", httpStatus, error: "success_not_confirmed" };
    }
    if (parsed.duplicate === true) return { outcome: "duplicate", httpStatus, error: null };
    return { outcome: "accepted", httpStatus, error: null };
  }
  if (httpStatus === 409 && echoed === key) return { outcome: "duplicate", httpStatus, error: null };
  if (httpStatus === 408 || httpStatus === 429 || (httpStatus !== null && httpStatus >= 500)) {
    return { outcome: "unknown", httpStatus, error: typeof parsed.error === "string" ? parsed.error : "unavailable" };
  }
  if (httpStatus !== null && httpStatus >= 400) {
    return { outcome: "failed", httpStatus, error: typeof parsed.error === "string" ? parsed.error : "rejected" };
  }
  return { outcome: "unknown", httpStatus, error: "unclassified" };
}

export function classifyReconcileResponse(status, parsed, key) {
  if (status === 404) return { outcome: "absent", httpStatus: 404, error: null };
  if (
    status >= 200 &&
    status < 300 &&
    parsed &&
    typeof parsed === "object" &&
    parsed.found === true &&
    parsed.idempotencyKey === key
  ) {
    return { outcome: "accepted", httpStatus: status, error: null };
  }
  return { outcome: "unknown", httpStatus: status ?? null, error: "reconcile_unconfirmed" };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function sendLocalHttp({ baseUrl, event, timeoutMs = 5000, fetchImpl = globalThis.fetch }) {
  const origin = assertLoopbackBaseUrl(`${baseUrl}/`);
  const body = JSON.stringify({
    schema: "change-monitor.delivery.v1",
    idempotencyKey: event.idempotencyKey,
    event: publicEvent(event),
  });
  try {
    const response = await fetchImpl(`${origin}/deliver`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": event.idempotencyKey,
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      return { outcome: "failed", httpStatus: response.status, error: "redirect_refused" };
    }
    const parsed = await readJson(response);
    return classifyDeliveryResponse(response.status, parsed, event.idempotencyKey);
  } catch (error) {
    const name = error && error.name === "TimeoutError" ? "timeout" : "send_failed";
    return { outcome: "unknown", httpStatus: null, error: name };
  }
}

export async function reconcileLocalHttp({ baseUrl, idempotencyKey, timeoutMs = 5000, fetchImpl = globalThis.fetch }) {
  const origin = assertLoopbackBaseUrl(`${baseUrl}/`);
  try {
    const response = await fetchImpl(`${origin}/events/${encodeURIComponent(idempotencyKey)}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      return { outcome: "unknown", httpStatus: response.status, error: "redirect_refused" };
    }
    const parsed = await readJson(response);
    return classifyReconcileResponse(response.status, parsed, idempotencyKey);
  } catch {
    return { outcome: "unknown", httpStatus: null, error: "reconcile_failed" };
  }
}
