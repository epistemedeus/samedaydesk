/** R2-TOWNSQUARE-05 — Source-backed answer cards (preserve missing/inaccessible). */

export const PACKAGE_ID = "R2-TOWNSQUARE-05";
export const SCHEMA =
  "neomorphic.r2.townsquare.source_backed_answer_cards.v1";

export const CARD_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL: "partial",
  REJECTED: "rejected",
});

export const SOURCE_STATUS = Object.freeze({
  PRESENT: "present",
  MISSING: "missing",
  INACCESSIBLE: "inaccessible",
  UNSPECIFIED: "unspecified",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  FORBIDDEN_CLAIM: "forbidden_claim",
  MISSING_REQUIREMENT: "missing_requirement",
});

/** Same forbidden invented demand/revenue fields as Townsquare-01..04 / Exchange. */
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
  townSquareSanitizeEvidence:
    "scripts/scale-lab/town-square sanitizeEvidence — safe evidence shape idea (uri/label refs only; fetch/execute false)",
  notEquivalentTo: Object.freeze([
    "town-square sanitizeEvidence (does not export answer cards with applicability + missing/inaccessible source status)",
    "R2-TOWNSQUARE-03 contradiction-preserving summaries (multi-claim conflict summary — different artifact)",
    "R2-TOWNSQUARE-01",
    "R2-TOWNSQUARE-02",
    "R2-TOWNSQUARE-04",
  ]),
});

export const CONSUMER_INSTRUCTIONS =
  "Export compact claim/source/observation/applicability answer cards. Preserve missing or inaccessible sources — never invent uri/label/observedAt. Do not treat missing or inaccessible sources as present. source.fetch and source.execute are refused. execute is always false. inventedSources is always false. Do not invent buyers/revenue.";

export const ID_MAX = 128;
export const TEXT_MAX = 4000;
export const URI_MAX = 2048;
