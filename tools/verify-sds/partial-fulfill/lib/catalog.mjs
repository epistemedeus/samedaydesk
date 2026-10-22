/** SDS partial-fulfill refuse-settle pin. */

export const FEATURE = "partial-fulfill";

export const APEX_ORIGIN = "https://samedaydesk.com";
export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";
export const SETTLEMENT_PROOF_CITE = `${GATEWAY_ORIGIN}/commerce/settlement-proof`;

export const PRODUCT_EXTRACT_BATCH = "samedaydesk-extract-batch";
export const SCHEMA_EXTRACT_BATCH = "samedaydesk.extract-batch.v0";
export const SCHEMA_PAGE_CHANGE = "pilot/page-change-brief/v1";

/**
 * Real committed SDS artifacts (read-only, outside this write boundary).
 * Cold refuse-settle uses the failed extract-batch: all sources failed, partial:true.
 */
export const REAL_PARTIAL_EXTRACT =
  "tools/result-reuse/fixtures/incomplete-failed-extract.json";
export const REAL_MIXED_EXTRACT =
  "tools/result-reuse/fixtures/accepted-extract-batch.json";
export const REAL_INCOMPLETE_PAGE_CHANGE =
  "tools/result-reuse/fixtures/accepted-page-change.json";
export const REAL_PARTIAL_RECORD =
  "tools/result-reuse/fixtures/accepted-record-report.json";
export const REAL_COMPLETE_PAGE_CHANGE =
  "tools/result-reuse/fixtures/accepted-complete-changed-page-change.json";

export const PACK_COMPLETE_EXTRACT =
  "tools/verify-sds/partial-fulfill/fixtures/complete-extract-batch.json";

export const DEFAULT_PARTIAL_ARTIFACT = REAL_PARTIAL_EXTRACT;
export const DEFAULT_COMPLETE_ARTIFACT = REAL_COMPLETE_PAGE_CHANGE;

export const FORBIDDEN_HEADERS = Object.freeze([
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
  "stripe-signature",
]);

export const PAYMENT_STOP_PATHS = Object.freeze([
  "/api/checkout",
  "/api/stripe/webhook",
  "/checkout",
  "/mcp?cs=",
  "buy.stripe.com",
  "/extract/batch",
  "/commerce/settlement-proof",
]);

export function looksLikePaymentUrl(value) {
  const s = String(value || "");
  if (!s) return false;
  const lower = s.toLowerCase();
  for (const p of PAYMENT_STOP_PATHS) {
    if (lower.includes(p.toLowerCase())) return true;
  }
  if (/(?:^|[?&/])cs=|cs_test_|cs_live_|\/api\/stripe\b/i.test(s)) return true;
  try {
    const u = new URL(s);
    if (u.searchParams.has("cs") && String(u.searchParams.get("cs") || "").length > 0) {
      return true;
    }
    if (/(^|\.)stripe\.com$/i.test(u.hostname)) return true;
  } catch {
    /* relative path or non-URL */
  }
  return false;
}

export function looksLikeLiveOrigin(value) {
  const s = String(value || "").toLowerCase();
  if (!s) return false;
  return (
    s.includes("samedaydesk.com") ||
    s.includes("agents.samedaydesk.com") ||
    s.includes("buy.stripe.com")
  );
}

export const SEEDED = Object.freeze({
  "settle-partial": {
    id: "settle-partial",
    why: "A partial extract-batch must not be marked settled / delivered-in-full.",
    errorCode: "SETTLE_PARTIAL",
    expectExit: 1,
  },
  "forged-complete": {
    id: "forged-complete",
    why: "Accounting with failed/partial rows labeled complete is not a settleable delivery.",
    errorCode: "FORGED_COMPLETE",
    expectExit: 1,
  },
  "silent-ok-partial": {
    id: "silent-ok-partial",
    why: "{ok:true, partial:true} is not a complete delivery and must not settle.",
    errorCode: "SILENT_OK_PARTIAL",
    expectExit: 1,
  },
  "receipt-on-partial": {
    id: "receipt-on-partial",
    why: "A settlement receipt attached to a partial job is not proof of full delivery.",
    errorCode: "RECEIPT_ON_PARTIAL",
    expectExit: 1,
  },
  "payment-signature": {
    id: "payment-signature",
    why: "Never send PAYMENT-SIGNATURE / X-PAYMENT. Seed proves the refuse before any wire I/O.",
    errorCode: "PAYMENT_HEADER_REFUSE",
    expectExit: 1,
  },
  "stripe-path": {
    id: "stripe-path",
    why: "Stripe checkout / webhook / cs_ paths are out of this unpaid refuse-settle pack.",
    errorCode: "STRIPE_PATH_REFUSE",
    expectExit: 1,
  },
  live: {
    id: "live",
    why: "This pack is offline. Never fetch agents.samedaydesk.com settlement-proof or pay.",
    errorCode: "LIVE_REFUSE",
    expectExit: 2,
  },
});
