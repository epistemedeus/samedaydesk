/** R2-EXCHANGE-05 — Correction request workflow constants. */

export const SCHEMA = "neomorphic.r2.exchange.correction_request.v1";

export const CORRECTION_STATUS = Object.freeze({
  NONE_NEEDED: "none_needed",
  NEEDS_VERIFICATION: "needs_verification",
  AMEND_REQUESTED: "amend_requested",
  MALFORMED: "malformed",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  FORBIDDEN_CLAIM: "forbidden_claim",
});

export const FORBIDDEN_FIELDS = Object.freeze([
  "revenue",
  "buyerCount",
  "reputation",
  "rankingScore",
  "earnedUsdc",
  "claimAuthority",
]);
