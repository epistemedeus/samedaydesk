/**
 * Settle gate: partial SDS fulfillment is never settleable.
 * Complete fulfillment is eligible-unpaid — this pack never pays or writes a receipt.
 */
import { FORBIDDEN_HEADERS, looksLikeLiveOrigin, looksLikePaymentUrl } from "./catalog.mjs";
import { classifyFulfillment } from "./classify.mjs";

function coded(code, message, detail) {
  const err = new Error(message);
  err.code = code;
  if (detail !== undefined) err.detail = detail;
  return err;
}

export function decideSettle(classification) {
  if (!classification || typeof classification !== "object") {
    throw coded("UNRECOGNIZED", "settle decision requires a classification");
  }
  if (classification.partial) {
    return {
      decision: "refuse",
      code: "PARTIAL_FULFILL",
      settled: false,
      paymentSent: false,
      message: "partial fulfillment is not settleable",
      reasons: [...(classification.reasons || [])],
    };
  }
  return {
    decision: "eligible-unpaid",
    code: "UNPAID_BOUNDARY",
    settled: false,
    paymentSent: false,
    message: "complete fulfillment is settle-eligible; this pack never settles or pays",
    reasons: [...(classification.reasons || [])],
  };
}

export function inspectFulfillment(input) {
  const classification = classifyFulfillment(input);
  const settle = decideSettle(classification);
  return { classification, settle };
}

/**
 * A claim that a job is settled/delivered-in-full. Throws when the claim
 * is incompatible with the fulfillment (partial, forged complete, receipt).
 */
export function assertSettleClaim(claim, classification) {
  const c = claim && typeof claim === "object" ? claim : {};
  if (
    classification.partial &&
    c.ok === true &&
    (c.settled === true || c.treatPartialAsComplete === true)
  ) {
    throw coded(
      "SILENT_OK_PARTIAL",
      "refusing {ok:true} settle on a partial fulfillment",
      {
        okClaim: true,
        reasons: classification.reasons,
        kind: classification.kind,
      },
    );
  }
  if (c.settled === true && classification.partial) {
    throw coded(
      "SETTLE_PARTIAL",
      "refusing settle on partial fulfillment: delivery is not in full",
      {
        settledClaim: true,
        deliveryClaim: c.delivery || null,
        reasons: classification.reasons,
        kind: classification.kind,
      },
    );
  }
  if ((c.complete === true || c.delivery === "in_full") && classification.partial) {
    throw coded(
      "FORGED_COMPLETE",
      "refusing complete/in-full label on a partial fulfillment",
      {
        completeClaim: c.complete === true,
        deliveryClaim: c.delivery || null,
        reasons: classification.reasons,
        kind: classification.kind,
      },
    );
  }
  if ((c.receipt || c.settlementReceipt || c.transactionHash) && classification.partial) {
    throw coded(
      "RECEIPT_ON_PARTIAL",
      "refusing settlement receipt attached to a partial fulfillment",
      {
        hasReceipt: true,
        reasons: classification.reasons,
        kind: classification.kind,
      },
    );
  }
  if (c.settled === true && !classification.partial) {
    throw coded(
      "UNPAID_BOUNDARY",
      "this pack never settles, even on complete fulfillment",
      { settledClaim: true, kind: classification.kind },
    );
  }
  return {
    accepted: false,
    settled: false,
    paymentSent: false,
    classification,
  };
}

export function assertNoPaymentHeaders(headers = {}) {
  const entries = Object.entries(headers || {});
  for (const [name, value] of entries) {
    const matched = FORBIDDEN_HEADERS.some((h) => h.toLowerCase() === String(name).toLowerCase());
    if (matched && value) {
      throw coded("PAYMENT_HEADER_REFUSE", `refusing to send forbidden payment header: ${name}`, {
        header: name,
        headerNeverSent: true,
        forbidden: [...FORBIDDEN_HEADERS],
      });
    }
  }
  return true;
}

export function assertOffline(origin) {
  if (!origin) return true;
  if (looksLikeLiveOrigin(origin) || looksLikePaymentUrl(origin)) {
    throw coded(
      "LIVE_REFUSE",
      "refusing live/origin settle: partial-fulfill is offline (committed fixtures only). Never fetch settlement-proof, Stripe, or PAYMENT-SIGNATURE.",
      {
        origin,
        never: ["--live", "agents.samedaydesk.com", "PAYMENT-SIGNATURE", "X-PAYMENT", "/commerce/settlement-proof"],
      },
    );
  }
  return true;
}

export function assertNotPaymentPath(path) {
  if (!path) return true;
  if (looksLikePaymentUrl(path)) {
    throw coded("STRIPE_PATH_REFUSE", `refusing Stripe/checkout/settlement path in unpaid harness: ${path}`, {
      path,
    });
  }
  return true;
}
