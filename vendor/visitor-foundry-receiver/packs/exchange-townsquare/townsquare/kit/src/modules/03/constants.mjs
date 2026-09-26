/** R2-TOWNSQUARE-03 — Contradiction-preserving source-linked summaries. */

export const PACKAGE_ID = "R2-TOWNSQUARE-03";
export const SCHEMA =
  "neomorphic.r2.townsquare.contradiction_preserving_summary.v1";

export const SUMMARY_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL: "partial",
  REJECTED: "rejected",
});

export const ENTRY_ROLE = Object.freeze({
  CLAIM: "claim",
  CORRECTION: "correction",
  SUPERSEDED_CLAIM: "superseded_claim",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  FORBIDDEN_CLAIM: "forbidden_claim",
  CYCLIC_LINEAGE: "cyclic_lineage",
});

/** Same forbidden invented demand/revenue fields as Townsquare-01/02 / Exchange. */
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
  townSquarePostCorrection:
    "scripts/scale-lab/town-square postCorrection / supersedesId lineage vocabulary",
  taskMemoryAssertCorrectionLineage:
    "task-memory contract assertCorrectionLineage (validation only)",
  notEquivalentTo: Object.freeze([
    "town-square postCorrection alone (no contradiction-preserving summary artifact)",
    "task-memory assertCorrectionLineage alone",
    "capability-market applyCorrection",
    "R2-TOWNSQUARE-01",
    "R2-TOWNSQUARE-02",
  ]),
});

export const CONSUMER_INSTRUCTIONS =
  "Build a source-linked summary that keeps conflicting claims and later corrections distinguishable. Never flatten to consensus. Corrections supersede priors via supersedesId but both remain visible. Conflicts stay unresolved. execute is always false. Do not invent buyers/revenue.";

export const TEXT_MAX = 4000;
export const ID_MAX = 128;
