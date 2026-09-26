/** R2-EXCHANGE-06 — Cancellation and stale continuation. */

export const SCHEMA = "neomorphic.r2.exchange.lifecycle_state.v1";
export const EVENT_SCHEMA = "neomorphic.r2.exchange.lifecycle_event.v1";

export const TASK_STATUS = Object.freeze({
  OPEN: "open",
  PROPOSAL_PENDING: "proposal_pending",
  AGREED: "agreed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
});

export const PROPOSAL_STATUS = Object.freeze({
  ACTIVE: "active",
  WITHDRAWN: "withdrawn",
  STALE: "stale",
});

export const EVENT_TYPE = Object.freeze({
  TASK_OPENED: "task_opened",
  PROPOSAL_SUBMITTED: "proposal_submitted",
  PROPOSAL_WITHDRAWN: "proposal_withdrawn",
  REQUESTER_CANCELLED: "requester_cancelled",
  RESULT_SUBMITTED: "result_submitted",
  AGREEMENT_BOUND: "agreement_bound",
});

export const RESULT_DISPOSITION = Object.freeze({
  ACCEPTED: "accepted",
  LATE_AFTER_CANCEL: "late_after_cancel",
  LATE_AFTER_WITHDRAW: "late_after_withdraw",
  REJECTED_UNBOUND: "rejected_unbound",
  IGNORED_PAYMENT_ATTEMPT: "ignored_payment_attempt",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  FORBIDDEN_CLAIM: "forbidden_claim",
  UNKNOWN_EVENT: "unknown_event",
});

/** Never process payment/refund side effects in this reducer. */
export const FORBIDDEN_EVENT_FIELDS = Object.freeze([
  "payment",
  "refund",
  "payout",
  "escrowRelease",
  "charge",
  "revenue",
  "earnedUsdc",
  "claimAuthority",
]);
