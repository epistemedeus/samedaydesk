/**
 * Seeded refuse paths. Always returns envelope with paymentSent=false, settled=false.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE, SEEDED } from "./catalog.mjs";
import { envelope, failError } from "./envelope.mjs";
import { REPO_ROOT } from "./paths.mjs";
import { classifyFulfillment } from "./classify.mjs";
import {
  assertNoPaymentHeaders,
  assertNotPaymentPath,
  assertOffline,
  assertSettleClaim,
  inspectFulfillment,
} from "./settle.mjs";

function loadJson(rel) {
  return JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8"));
}

function caught(code, message, result, detail) {
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: code === "LIVE_REFUSE" ? "usage" : "fail",
    error: failError(code, message, detail),
    result: { ...result, refused: true, paymentSent: false, settled: false },
  });
}

function unexpectedPass(code, message, result) {
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    error: failError(code, message),
    result: { ...result, refused: false },
  });
}

export function refuseSettlePartial() {
  const input = loadJson("tools/result-reuse/fixtures/incomplete-failed-extract.json");
  const classification = classifyFulfillment(input);
  try {
    assertSettleClaim({ settled: true, delivery: "in_full" }, classification);
    return unexpectedPass("SETTLE_PARTIAL", "expected refuse for settled=true on partial extract-batch", {
      seed: "settle-partial",
    });
  } catch (e) {
    return caught(e.code || "SETTLE_PARTIAL", e.message, { seed: "settle-partial", kind: classification.kind }, e.detail);
  }
}

export function refuseForgedComplete() {
  const input = loadJson("tools/result-reuse/fixtures/accepted-extract-batch.json");
  const classification = classifyFulfillment(input);
  try {
    assertSettleClaim({ complete: true, delivery: "in_full" }, classification);
    return unexpectedPass("FORGED_COMPLETE", "expected refuse for complete/in-full on mixed partial extract-batch", {
      seed: "forged-complete",
    });
  } catch (e) {
    return caught(e.code || "FORGED_COMPLETE", e.message, { seed: "forged-complete", kind: classification.kind }, e.detail);
  }
}

export function refuseSilentOkPartial() {
  const input = loadJson("tools/result-reuse/fixtures/incomplete-failed-extract.json");
  const { classification } = inspectFulfillment(input);
  try {
    assertSettleClaim({ ok: true, settled: true, treatPartialAsComplete: true }, classification);
    return unexpectedPass("SILENT_OK_PARTIAL", "expected refuse for {ok:true, settled:true} on partial", {
      seed: "silent-ok-partial",
    });
  } catch (e) {
    return caught(e.code || "SILENT_OK_PARTIAL", e.message, { seed: "silent-ok-partial", flagPartial: true }, e.detail);
  }
}

export function refuseReceiptOnPartial() {
  const input = loadJson("tools/result-reuse/fixtures/accepted-extract-batch.json");
  const classification = classifyFulfillment(input);
  try {
    assertSettleClaim(
      {
        settlementReceipt: {
          schemaVersion: "samedaydesk.settlement-receipt.v1",
          transactionHash: "0x" + "a".repeat(64),
        },
      },
      classification,
    );
    return unexpectedPass("RECEIPT_ON_PARTIAL", "expected refuse for settlement receipt on partial job", {
      seed: "receipt-on-partial",
    });
  } catch (e) {
    return caught(e.code || "RECEIPT_ON_PARTIAL", e.message, { seed: "receipt-on-partial" }, e.detail);
  }
}

export function refusePaymentSignature({
  header = "PAYMENT-SIGNATURE",
  value = "seeded-fake-sig",
} = {}) {
  try {
    assertNoPaymentHeaders({ [header]: value });
    return unexpectedPass("PAYMENT_HEADER_REFUSE", `expected refuse for header ${header}`, {
      seed: "payment-signature",
      header,
    });
  } catch (e) {
    return caught(e.code || "PAYMENT_HEADER_REFUSE", e.message, {
      seed: "payment-signature",
      header: e.detail?.header || header,
      headerNeverSent: true,
    }, e.detail);
  }
}

export function refuseStripePath({ path = "/api/checkout" } = {}) {
  try {
    assertNotPaymentPath(path);
    return unexpectedPass("STRIPE_PATH_REFUSE", `expected refuse for path ${path}`, {
      seed: "stripe-path",
      path,
    });
  } catch (e) {
    return caught(e.code || "STRIPE_PATH_REFUSE", e.message, {
      seed: "stripe-path",
      path,
      neverOpenedCheckout: true,
    }, e.detail);
  }
}

export function refuseLive({ flag = "--live", origin = "https://agents.samedaydesk.com/commerce/settlement-proof" } = {}) {
  try {
    assertOffline(origin);
    return unexpectedPass("LIVE_REFUSE", `expected refuse for ${flag}`, { seed: "live", flag });
  } catch (e) {
    return caught(e.code || "LIVE_REFUSE", e.message, {
      seed: "live",
      flag,
      origin,
      liveFetch: false,
      paymentSent: false,
    }, e.detail);
  }
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
  if (seedId === "settle-partial") return refuseSettlePartial();
  if (seedId === "forged-complete") return refuseForgedComplete();
  if (seedId === "silent-ok-partial") return refuseSilentOkPartial();
  if (seedId === "receipt-on-partial") return refuseReceiptOnPartial();
  if (seedId === "payment-signature") return refusePaymentSignature(opts);
  if (seedId === "stripe-path") return refuseStripePath({ path: opts.path || "/api/checkout" });
  if (seedId === "live") return refuseLive(opts);
  return envelope({
    ok: false,
    command: "seeded",
    status: "usage",
    error: failError("USAGE", `unhandled seed: ${seedId}`),
  });
}
