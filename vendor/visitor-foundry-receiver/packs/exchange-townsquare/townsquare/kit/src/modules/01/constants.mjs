/** R2-TOWNSQUARE-01 — Question-to-capability routing constants. */

export const PACKAGE_ID = "R2-TOWNSQUARE-01";
export const SCHEMA = "neomorphic.r2.townsquare.question_capability_route.v1";

export const ROUTE_STATUS = Object.freeze({
  ROUTED: "routed",
  PARTIAL: "partial",
  UNKNOWN: "unknown",
  REJECTED: "rejected",
});

export const SIGNAL_SOURCE = Object.freeze({
  NEEDED_OUTCOMES: "neededOutcomes",
  TAGS: "tags",
  TEXT_TOKENS: "text_tokens",
  NONE: "none",
});

export const CONFIDENCE = Object.freeze({
  EXACT: "exact",
  PARTIAL: "partial",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  FORBIDDEN_CLAIM: "forbidden_claim",
});

/** Same forbidden invented demand/revenue fields as Exchange / Capabilities. */
export const FORBIDDEN_FIELDS = Object.freeze([
  "buyerCount",
  "revenue",
  "earnedUsd",
  "earnedUsdc",
  "rankingScore",
  "reputation",
  "escrowBalance",
  "claimAuthority",
]);

export const REUSE_FROM = Object.freeze({
  townSquareQuestionShape: "scripts/scale-lab/town-square",
  capabilityOutcomeOverlap:
    "scripts/scale-lab/capability-market matchCapabilities (semantics only)",
  notEquivalentTo: Object.freeze([
    "capability-market matchCapabilities request shape",
    "town-square board alone",
  ]),
});

export const CONSUMER_INSTRUCTIONS =
  "Pass a task-linked town-square question plus a capabilities[] catalog. Prefer neededOutcomes; else tags; else text tokens that overlap capability outcomes/titles. Read matches[].reasons, nonMatches[].reasons, and unknowns[]. Never invent buyers/revenue or auto-execute.";

export const QUESTION_TEXT_ECHO_MAX = 240;

/** Tokens of length <= 2 are dropped when deriving text signal. */
export const STOPWORD_MAX_LEN = 2;
