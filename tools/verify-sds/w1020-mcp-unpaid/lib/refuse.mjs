/**
 * Seeded refuse paths for paid-tool / payment-signature / stripe.
 * Always returns envelope with boundary.paymentSent=false, toolsCalled=false.
 */
import {
  PAID_TOOL,
  PAYMENT_STOP_PATHS,
  FORBIDDEN_HEADERS,
  SEEDED,
  FEATURE,
  looksLikePaymentUrl,
} from "./catalog.mjs";
import { envelope, failError } from "./envelope.mjs";
import { assertNoPaymentHeaders, assertUnpaidCallAllowed } from "./client.mjs";

export function refusePaidToolCall({ tool = PAID_TOOL } = {}) {
  try {
    assertUnpaidCallAllowed("tools/call", { name: tool }, { allowFreeCall: false });
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "fail",
      error: failError("PAID_REFUSE", `expected refuse for ${tool}`, { tool }),
      result: { seed: "paid-tool-call", tool, refused: false },
    });
  } catch (e) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "fail",
      error: failError(e.code || "PAID_REFUSE", e.message, {
        tool: e.tool || tool,
        seed: "paid-tool-call",
      }),
      result: {
        seed: "paid-tool-call",
        tool: e.tool || tool,
        refused: true,
        paymentSent: false,
        toolsCalled: false,
        neverPostedCall: true,
      },
    });
  }
}

export function refusePaymentSignature({
  header = "PAYMENT-SIGNATURE",
  value = "seeded-fake-sig",
} = {}) {
  const headers = { [header]: value };
  try {
    assertNoPaymentHeaders(headers);
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError(
        "PAYMENT_HEADER_REFUSE",
        `expected refuse for header ${header}`,
        { header },
      ),
      result: { seed: "payment-signature", header, refused: false },
    });
  } catch (e) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "fail",
      error: failError(e.code || "PAYMENT_HEADER_REFUSE", e.message, {
        header: e.header || header,
        seed: "payment-signature",
        forbidden: [...FORBIDDEN_HEADERS],
      }),
      result: {
        seed: "payment-signature",
        header: e.header || header,
        refused: true,
        paymentSent: false,
        headerNeverSent: true,
      },
    });
  }
}

export function refuseStripePath({ path = "/api/checkout" } = {}) {
  if (!looksLikePaymentUrl(path)) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("STRIPE_PATH_REFUSE", `path not recognized as payment stop: ${path}`, {
        path,
        stops: [...PAYMENT_STOP_PATHS],
      }),
      result: { seed: "stripe-path", path, refused: false },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "STRIPE_PATH_REFUSE",
      `refusing Stripe/checkout path in unpaid harness: ${path}`,
      { path, stops: [...PAYMENT_STOP_PATHS] },
    ),
    result: {
      seed: "stripe-path",
      path,
      refused: true,
      paymentSent: false,
      toolsCalled: false,
      neverOpenedCheckout: true,
    },
  });
}

export function runSeeded(seedId, opts = {}) {
  const seed = SEEDED[seedId];
  if (!seed) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "usage",
      error: failError("USAGE", `unknown seeded failure: ${seedId}`, {
        known: Object.keys(SEEDED),
      }),
    });
  }
  if (seedId === "paid-tool-call") return refusePaidToolCall(opts);
  if (seedId === "payment-signature") return refusePaymentSignature(opts);
  if (seedId === "stripe-path") {
    return refuseStripePath({ path: opts.path || "/api/checkout" });
  }
  return envelope({
    ok: false,
    command: "seeded",
    status: "usage",
    error: failError("USAGE", `unhandled seed: ${seedId}`),
  });
}
