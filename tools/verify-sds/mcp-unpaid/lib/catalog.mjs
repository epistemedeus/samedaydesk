/** Apex SDS /mcp five tools (cite W0-B2 / server/lib/mcp-tool-inventory.js). */
export const MCP_TOOLS = Object.freeze([
  "check_ai_readiness",
  "generate_complete_fix_pack",
  "plan_taskmarket_delegation",
  "browse_taskmarket_tasks",
  "track_taskmarket_task",
]);

/** Paid Fix Pack tool — listed free, never called by this verifier. */
export const PAID_TOOL = "generate_complete_fix_pack";

export const FREE_TOOLS = Object.freeze(
  MCP_TOOLS.filter((name) => name !== PAID_TOOL),
);

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

/** Paths that imply Stripe / checkout spend — refuse. */
export const PAYMENT_STOP_PATHS = Object.freeze([
  "/api/checkout",
  "/api/stripe/webhook",
  "/checkout",
  "/mcp?cs=",
]);

export const FEATURE = "mcp-unpaid";

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
});
