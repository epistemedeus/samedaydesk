/** R2-EXCHANGE-02 — Bid-to-requirement comparison constants. */

export const SCHEMA = "neomorphic.r2.exchange.bid_comparison.v1";
export const PROPOSAL_SCHEMA = "neomorphic.r2.exchange.proposal.v1";

export const MATCH_STATUS = Object.freeze({
  MEETS: "meets",
  UNVERIFIED_EVIDENCE: "unverified_evidence",
  PARTIAL: "partial",
  MISSING_EVIDENCE: "missing_evidence",
  CONFLICTS: "conflicts",
  MALFORMED: "malformed",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  FORBIDDEN_CLAIM: "forbidden_claim",
  MISSING_BRIEF: "missing_brief",
});

/** Never invent reputation or commercial ranking. */
export const FORBIDDEN_PROPOSAL_FIELDS = Object.freeze([
  "reputation",
  "rankingScore",
  "buyerCount",
  "revenue",
  "earnedUsd",
  "earnedUsdc",
  "trustScore",
  "stars",
  "escrowBalance",
  "claimAuthority",
]);

export const FORBIDDEN_COMPARISON_FIELDS = Object.freeze([
  ...FORBIDDEN_PROPOSAL_FIELDS,
  "winner",
  "rank",
  "bestBid",
]);
