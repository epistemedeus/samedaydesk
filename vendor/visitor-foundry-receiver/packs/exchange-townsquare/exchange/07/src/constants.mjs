/** R2-EXCHANGE-07 — Dispute evidence packet. */

export const SCHEMA = "neomorphic.r2.exchange.dispute_packet.v1";

export const PACKET_STATUS = Object.freeze({
  ASSEMBLED: "assembled",
  INCOMPLETE: "incomplete",
  MALFORMED: "malformed",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  FORBIDDEN_CLAIM: "forbidden_claim",
});

export const FORBIDDEN_FIELDS = Object.freeze([
  "winner",
  "loser",
  "ruling",
  "adjudication",
  "automaticDecision",
  "reputation",
  "rankingScore",
  "revenue",
  "earnedUsdc",
  "claimAuthority",
]);
