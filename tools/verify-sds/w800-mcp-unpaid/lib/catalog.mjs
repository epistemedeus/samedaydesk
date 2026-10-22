/** Apex SDS /mcp five tools for w800 unpaid fixtures. Cite server/lib/mcp-tool-inventory.js. */
export const WAVE = "w800";

export const MCP_TOOLS = Object.freeze([
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
]);

/** Paid Fix Pack tool — listed free, never POSTed by this verifier. */
export const PAID_TOOL = "generate_complete_fix_pack";

/** Default free tool for unpaid tools/call → isError (missing url, no fetch). */
export const UNPAID_CALL_TOOL = "check_ai_readiness";

export const FREE_TOOLS = Object.freeze(MCP_TOOLS.filter((name) => name !== PAID_TOOL));

export const MCP_PROTOCOL = "2024-11-05";
export const MCP_SERVER_INFO = Object.freeze({
  name: "samedaydesk-agent-tools",
  version: "1.2.0",
});

export const APEX_ORIGIN = "https://samedaydesk.com";
export const GATEWAY_ORIGIN = "https://agents.samedaydesk.com";

/** Headers this harness must never send. */
export const FORBIDDEN_HEADERS = Object.freeze([
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
  "stripe-signature",
]);

/** Paths / hosts that imply Stripe / checkout spend — refuse before any socket. */
export const PAYMENT_STOP_PATHS = Object.freeze([
  "/api/checkout",
  "/api/stripe/webhook",
  "/checkout",
  "/mcp?cs=",
  "buy.stripe.com",
]);

export const FEATURE = "w800-mcp-unpaid";

export const SEEDED = Object.freeze({
  "paid-tool-call": {
    id: "paid-tool-call",
    why: "tools/call of generate_complete_fix_pack is a paid path; harness must refuse without POSTing call or payment.",
    errorCode: "PAID_REFUSE",
    expectExit: 1,
  },
  "payment-signature": {
    id: "payment-signature",
    why: "Never send PAYMENT-SIGNATURE / X-PAYMENT. Seed proves the refuse.",
    errorCode: "PAYMENT_HEADER_REFUSE",
    expectExit: 1,
  },
  "stripe-path": {
    id: "stripe-path",
    why: "Stripe checkout / webhook / cs_ license redemption paths are out of unpaid scope.",
    errorCode: "STRIPE_PATH_REFUSE",
    expectExit: 1,
  },
  "tools-sha-mismatch": {
    id: "tools-sha-mismatch",
    why: "Tampered expected tools-block sha must fail closed against committed server/routes/mcp.js.",
    errorCode: "TOOLS_SHA_MISMATCH",
    expectExit: 1,
  },
  "paid-as-unpaid": {
    id: "paid-as-unpaid",
    why: "A paid Fix Pack result labeled unpaid (isError=false without license) must be rejected.",
    errorCode: "PAID_AS_UNPAID",
    expectExit: 1,
  },
});

/**
 * True when a URL or path is a Stripe / checkout / cs_ license path.
 * Fail-closed so --origin cannot POST to payment surfaces.
 */
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
