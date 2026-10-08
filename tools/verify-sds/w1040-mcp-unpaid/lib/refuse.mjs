/**
 * Seeded refuse paths for paid-tool / payment-signature / stripe / cs= / sha.
 * Always returns envelope with boundary.paymentSent=false, toolsCalled=false.
 */
import {
  PAID_TOOL,
  PAYMENT_STOP_PATHS,
  FORBIDDEN_HEADERS,
  SEEDED,
  FEATURE,
  WINDOW,
  looksLikePaymentUrl,
} from "./catalog.mjs";
import { envelope, failError } from "./envelope.mjs";
import { assertNoPaymentHeaders, assertUnpaidCallAllowed } from "./client.mjs";
import { readPinnedSource, PINNED_TOOLS_BLOCK_SHA256 } from "./source-pin.mjs";

export function refusePaidToolCall({ tool = PAID_TOOL } = {}) {
  try {
    assertUnpaidCallAllowed("tools/call", { name: tool }, { allowFreeCall: false });
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      window: WINDOW,
      status: "fail",
      error: failError("PAID_REFUSE", `expected refuse for ${tool}`, { tool }),
      result: { seed: "paid-tool-call", tool, refused: false },
    });
  } catch (e) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      window: WINDOW,
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
      window: WINDOW,
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
      window: WINDOW,
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

export function refuseStripePath({
  path = "/api/checkout",
  seed = "stripe-path",
} = {}) {
  if (!looksLikePaymentUrl(path)) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      window: WINDOW,
      error: failError("STRIPE_PATH_REFUSE", `path not recognized as payment stop: ${path}`, {
        path,
        stops: [...PAYMENT_STOP_PATHS],
        seed,
      }),
      result: { seed, path, refused: false },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    window: WINDOW,
    status: "fail",
    error: failError(
      "STRIPE_PATH_REFUSE",
      `refusing Stripe/checkout path in unpaid harness: ${path}`,
      { path, stops: [...PAYMENT_STOP_PATHS], seed },
    ),
    result: {
      seed,
      path,
      refused: true,
      paymentSent: false,
      toolsCalled: false,
      neverOpenedCheckout: true,
    },
  });
}

export function refuseCsQuery({ path = "/mcp?cs=cs_test_fake" } = {}) {
  return refuseStripePath({ path, seed: "cs-query" });
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
      window: WINDOW,
      error: failError(
        "TOOLS_SHA_MISMATCH",
        "seed expected a mismatch but source matched seeded sha",
        { sha: pin.sha256 },
      ),
      result: {
        seed: "tools-sha-mismatch",
        refused: false,
        got: pin.sha256,
        want: expectedSha,
      },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    window: WINDOW,
    status: "fail",
    error: failError(
      "TOOLS_SHA_MISMATCH",
      `tools-block sha mismatch: got ${pin.sha256} want ${expectedSha}`,
      { got: pin.sha256, want: expectedSha, pinned: PINNED_TOOLS_BLOCK_SHA256 },
    ),
    result: {
      seed: "tools-sha-mismatch",
      refused: true,
      got: pin.sha256,
      want: expectedSha,
      paymentSent: false,
      toolsCalled: false,
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
      window: WINDOW,
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
  if (seedId === "cs-query") {
    return refuseCsQuery({ path: opts.path || "/mcp?cs=cs_test_fake" });
  }
  if (seedId === "tools-sha-mismatch") return refuseToolsShaMismatch(opts);
  return envelope({
    ok: false,
    command: "seeded",
    status: "usage",
    error: failError("USAGE", `unhandled seed: ${seedId}`),
  });
}
