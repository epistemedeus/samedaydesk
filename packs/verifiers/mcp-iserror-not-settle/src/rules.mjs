/** Invariant: MCP tool-result isError is never settlement. */

export const PACK_ID = "mcp-iserror-not-settle";
export const VERIFIER = "mcp-iserror-not-settle";
export const CASE_SCHEMA = "samedaydesk.mcp-iserror-not-settle.case.v1";
export const REPORT_SCHEMA = "samedaydesk.mcp-iserror-not-settle.report.v1";
export const MCP_REL = "server/routes/mcp.js";

export const PAYMENT_RESPONSE_META_KEY = "x402/payment-response";
export const PAYMENT_META_KEY = "x402/payment";

export const FORBIDDEN_FLAGS = Object.freeze([
  "--live",
  "--pay",
  "--paid",
  "--payment",
  "--publish",
  "--neo",
  "--deploy",
  "--facilitator",
  "--checkout",
]);

export const NAIVE_SETTLE_BASES = Object.freeze([
  "http_ok",
  "http_200",
  "http_status",
  "jsonrpc_result",
  "no_error_field",
  "jsonrpc_ok",
  "payment_verified_text",
  "text_mentions_payment",
  "iserror_ignored",
]);

export const CODES = Object.freeze({
  ISERROR_NOT_SETTLE: "iserror_not_settle",
  ISERROR_PAYMENT_REQUIRED: "iserror_payment_required",
  ISERROR_SETTLEMENT_FAILED: "iserror_settlement_failed",
  JSONRPC_ERROR_NOT_SETTLE: "jsonrpc_error_not_settle",
  HTTP_NOT_SETTLE: "http_not_settle",
  NO_RESULT_NOT_SETTLE: "no_result_not_settle",
  SETTLE_CLAIM_ON_ISERROR: "settle_claim_on_iserror",
  SETTLE_CLAIM_ON_JSONRPC_ERROR: "settle_claim_on_jsonrpc_error",
  ISERROR_WITH_SUCCESSFUL_PAYMENT_RESPONSE: "iserror_with_successful_payment_response",
  HTTP_200_ISERROR_CLAIMED_SETTLE: "http_200_iserror_claimed_settle",
  PAYMENT_VERIFIED_TEXT_ISERROR: "payment_verified_text_iserror",
  SETTLEMENT_NOT_PROVEN: "settlement_not_proven_by_this_pack",
  INVARIANT_HOLDS: "invariant_holds",
  MALFORMED_CASE: "malformed_case",
  FORBIDDEN_FLAG: "forbidden_flag",
  PUBLISH_ATTEMPTED: "publish_attempted",
  CHECKOUT_TOUCHED: "checkout_touched",
  COMMITTED_SURFACES_UNAVAILABLE: "committed_surfaces_unavailable",
  OKMSG_MISSING: "okmsg_missing",
  ISERROR_SITES_MISSING: "iserror_sites_missing",
  ISERROR_NOT_VIA_OKMSG: "iserror_not_via_okmsg",
  HTTP_JSON_MISSING: "http_json_missing",
  DERIVED_SETTLE_CLAIM_NOT_REJECTED: "derived_settle_claim_not_rejected",
  USAGE: "usage",
});

export const HONESTY_NOTES = Object.freeze([
  "Independent oracle over SameDayDesk MCP tool results. isError true is never settlement.",
  "HTTP 200 and a JSON-RPC result (no error field) are the MCP success envelope, not a paid receipt.",
  "server/routes/mcp.js is the committed surface. This pack records it; it does not rewrite it.",
  "okMsg(id, result) is the SDS isError envelope. errMsg is a protocol error. Neither is settle.",
  "This pack does not call Stripe, x402 facilitators, or https://samedaydesk.com/mcp.",
  "A successful tool result without isError is not_proven settlement here.",
  "purchaseAuthority is always false. paid is always false. liveTouched is always false.",
]);
