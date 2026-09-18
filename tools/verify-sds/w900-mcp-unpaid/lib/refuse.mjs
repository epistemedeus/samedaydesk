/**
 * Seeded refuse paths for paid-tool / payment-signature / stripe / sha / paid-as-unpaid.
 * Always returns envelope with boundary.paymentSent=false, paidToolsCallPosted=false.
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
import { PINNED_TOOLS_BLOCK_SHA256, readPinnedSource } from "./source-pin.mjs";

const refuseBoundary = Object.freeze({
  paymentSent: false,
  paidToolsCallPosted: false,
  unpaidSafeCallPosted: false,
});

export function refusePaidToolCall({ tool = PAID_TOOL } = {}) {
  try {
    assertUnpaidCallAllowed("tools/call", { name: tool });
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "fail",
      error: failError("PAID_REFUSE", `expected refuse for ${tool}`, { tool }),
      boundary: refuseBoundary,
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
      boundary: refuseBoundary,
      result: {
        seed: "paid-tool-call",
        tool: e.tool || tool,
        refused: true,
        paymentSent: false,
        paidToolsCallPosted: false,
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
      boundary: refuseBoundary,
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
      boundary: refuseBoundary,
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
      boundary: refuseBoundary,
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
    boundary: refuseBoundary,
    result: {
      seed: "stripe-path",
      path,
      refused: true,
      paymentSent: false,
      paidToolsCallPosted: false,
      neverOpenedCheckout: true,
    },
  });
}

export function refuseToolsShaMismatch({
  expectedSha = "0000000000000000000000000000000000000000000000000000000000000000",
} = {}) {
  const pin = readPinnedSource();
  if (pin.sha256 === expectedSha) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError(
        "TOOLS_SHA_MISMATCH",
        "seed expected a mismatch but source matched seeded sha",
        { sha: pin.sha256 },
      ),
      boundary: refuseBoundary,
      result: { seed: "tools-sha-mismatch", refused: false, got: pin.sha256, want: expectedSha },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "TOOLS_SHA_MISMATCH",
      `tools-block sha mismatch: got ${pin.sha256} want ${expectedSha}`,
      {
        got: pin.sha256,
        want: expectedSha,
        pinned: PINNED_TOOLS_BLOCK_SHA256,
        source: pin.mcpPath,
      },
    ),
    boundary: refuseBoundary,
    result: {
      seed: "tools-sha-mismatch",
      refused: true,
      got: pin.sha256,
      want: expectedSha,
      paymentSent: false,
      paidToolsCallPosted: false,
    },
  });
}

export function refusePaidAsUnpaid(claim = {}) {
  const tool = claim.tool || PAID_TOOL;
  const isError = claim.isError;
  const paid = claim.paid === true;
  const licensePresented = claim.licensePresented === true;
  const dishonest =
    tool === PAID_TOOL &&
    isError === false &&
    paid !== true &&
    licensePresented !== true;

  if (!dishonest) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("PAID_AS_UNPAID", "expected dishonest unpaid success claim", { claim }),
      boundary: refuseBoundary,
      result: { seed: "paid-as-unpaid", refused: false, claim },
    });
  }

  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "PAID_AS_UNPAID",
      "refusing paid Fix Pack result labeled unpaid (isError=false without license/settlement)",
      { tool, isError, paid, licensePresented },
    ),
    boundary: refuseBoundary,
    result: {
      seed: "paid-as-unpaid",
      tool,
      refused: true,
      paymentSent: false,
      paidToolsCallPosted: false,
      neverPostedCall: true,
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
  if (seedId === "tools-sha-mismatch") return refuseToolsShaMismatch(opts);
  if (seedId === "paid-as-unpaid") {
    return refusePaidAsUnpaid(
      opts.claim || {
        tool: opts.tool || PAID_TOOL,
        isError: opts.isError ?? false,
        paid: opts.paid ?? false,
        licensePresented: opts.licensePresented ?? false,
        text: opts.text,
      },
    );
  }
  return envelope({
    ok: false,
    command: "seeded",
    status: "usage",
    error: failError("USAGE", `unhandled seed: ${seedId}`),
  });
}
