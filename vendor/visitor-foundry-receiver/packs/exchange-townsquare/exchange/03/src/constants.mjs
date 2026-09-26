/** R2-EXCHANGE-03 — Revision-aware work agreement constants. */

export const SCHEMA = "neomorphic.r2.exchange.work_agreement.v1";
export const REVISION_SCHEMA = "neomorphic.r2.exchange.brief_revision.v1";

export const AGREEMENT_STATUS = Object.freeze({
  BOUND: "bound",
  DELIVERABLE_ATTACHED: "deliverable_attached",
  SCOPE_CHANGED: "scope_changed",
  SUPERSEDED: "superseded",
  REJECTED_SILENT_ACCEPT: "rejected_silent_accept",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  REVISION_MISMATCH: "revision_mismatch",
  SILENT_ACCEPT_FORBIDDEN: "silent_accept_forbidden",
  FORBIDDEN_CLAIM: "forbidden_claim",
});

export const FORBIDDEN_FIELDS = Object.freeze([
  "reputation",
  "rankingScore",
  "revenue",
  "buyerCount",
  "earnedUsdc",
  "claimAuthority",
  "escrowBalance",
]);
