export const RESPONSE_SCHEMA = "samedaydesk.distribution.first_use_response.v1";
export const OUTCOME = Object.freeze({
  SUCCESS: "success",
  FAILURE: "failure",
});
export const NEXT_ACTION = Object.freeze({
  OPEN_LISTING: "open_listing",
  CONFIRM_BUDGET: "confirm_budget_before_paid_invoke",
  RETRY_DISCOVERY: "retry_discovery",
  STOP_PAID_RISK: "stop_paid_risk",
  USE_LOCAL_OFFLINE: "use_local_offline_pack",
  HOLD_AGENSI: "hold_agensi_pending_review",
});
export const GREXAL_LISTING = Object.freeze({
  url: "https://grexal.ai/marketplace/j970cajvv6wbrmy64s2f4ajzw18e5j2q",
  agentId: "j970cajvv6wbrmy64s2f4ajzw18e5j2q",
  listPriceUsd: 0.02,
  estimateReserveUsd: 0.025,
  estimateReserveIsCharge: false,
});
export const ERROR_CODES = Object.freeze({
  MALFORMED: "malformed_first_use_attempt",
  MISSING: "missing_required_field",
  INVENTED_TRAFFIC: "invented_traffic_forbidden",
  PAID_INVOKE: "paid_invoke_forbidden",
});
