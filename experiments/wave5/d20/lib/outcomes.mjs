export const OUTCOME = Object.freeze({
  RETRIEVED: "retrieved",
  RETRIEVED_SAMPLE: "retrieved-sample",
  ANALYSIS_REFUSAL: "analysis-refusal",
  TRANSPORT_UNKNOWN: "transport-unknown",
  CALLBACK_ACKED: "callback-acked",
  QUEUED: "queued",
  FAILED_DELIVERY: "failed-delivery",
});

export function mailboxPickupOutcome(body) {
  const status = body?.status || body?.code || null;
  const ok = body?.ok === true;
  const sold = body?.sold === true;
  const sample = body?.sample === true;
  const retrieved =
    ok === true && (status === "retrieved" || status === "retrieved-sample");
  const analysisRefusal = body?.ok === false && (body?.refused === true || typeof body?.code === "string");
  return {
    class: retrieved
      ? status === "retrieved-sample"
        ? OUTCOME.RETRIEVED_SAMPLE
        : OUTCOME.RETRIEVED
      : analysisRefusal
        ? OUTCOME.ANALYSIS_REFUSAL
        : status,
    retrieved,
    analysisRefusal,
    transportUnknown: false,
    pickupLabelledDeliveredToBuyer: body?.deliveredToBuyer === true,
    callbackAck: false,
    sold,
    sale: body?.sale === true,
    purchaseAuthority: body?.purchaseAuthority === true,
    sample,
    status,
    usefulDelivery: false,
    completePaidDelivery: false,
  };
}

export function outboxEventOutcome(event) {
  const state = event?.deliveryState || null;
  const callbackAck = event?.callbackAcknowledged === true && state === "delivered";
  const transportUnknown = state === "unknown";
  return {
    class:
      state === "queued"
        ? OUTCOME.QUEUED
        : transportUnknown
          ? OUTCOME.TRANSPORT_UNKNOWN
          : callbackAck
            ? OUTCOME.CALLBACK_ACKED
            : state === "failed"
              ? OUTCOME.FAILED_DELIVERY
              : state,
    retrieved: false,
    analysisRefusal: false,
    transportUnknown,
    pickupLabelledDeliveredToBuyer: false,
    callbackAck,
    sold: event?.sold === true,
    sale: event?.sale === true,
    buyerAccepted: event?.buyerAccepted === true,
    sample: event?.sample === true,
    deliveryState: state,
    usefulDelivery: false,
    completePaidDelivery: false,
  };
}

export function assertNotSale(assert, body) {
  assert.equal(body.sold, false);
  if ("sale" in (body || {})) assert.equal(body.sale, false);
  if ("purchaseAuthority" in (body || {})) assert.equal(body.purchaseAuthority, false);
  if ("buyerAccepted" in (body || {})) assert.equal(body.buyerAccepted, false);
}
