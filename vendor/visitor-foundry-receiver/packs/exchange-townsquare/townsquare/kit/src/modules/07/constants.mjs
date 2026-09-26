/** R2-TOWNSQUARE-07 — Conversation abuse cost controls. */

export const PACKAGE_ID = "R2-TOWNSQUARE-07";
export const SCHEMA =
  "neomorphic.r2.townsquare.conversation_abuse_controls.v1";

export const CONTROL_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL: "partial",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  FORBIDDEN_CLAIM: "forbidden_claim",
  MISSING_REQUIREMENT: "missing_requirement",
});

/** Same forbidden invented demand/revenue fields as Townsquare-01..06 / Exchange. */
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
  townSquareLimits:
    "scripts/scale-lab/town-square LIMITS / duplicate_id / change dedupe — reuse bounded-write principle only",
  r2Townsquare06:
    "R2-TOWNSQUARE-06 export bounds — byte budget for export; different surface",
  notEquivalentTo: Object.freeze([
    "town-square LIMITS alone (no per-thread conversation budgets + replay policy preserving corrections)",
    "R2-TOWNSQUARE-06 (export byte budget)",
    "R2-TOWNSQUARE-01",
    "R2-TOWNSQUARE-02",
    "R2-TOWNSQUARE-03",
    "R2-TOWNSQUARE-04",
    "R2-TOWNSQUARE-05",
  ]),
});

export const CONSUMER_INSTRUCTIONS =
  "Pure conversation write-control evaluation. Admit/reject proposed writes against per-thread budgets with bounded duplicate/replay handling. Corrections that fix prior content are preserved (correctionsPreferBudget:true). execute:false always. Do not mutate a live store from this package. Do not invent buyers/revenue.";

export const ID_MAX = 128;
export const TEXT_MAX = 8000;

/** Default per-thread budgets. */
export const DEFAULT_MAX_WRITES = 20;
export const DEFAULT_MAX_BYTES = 16384;
export const DEFAULT_MAX_DUPLICATES = 2;
export const DEFAULT_CORRECTION_RESERVE = 2;

export const HARD_MAX_WRITES = 200;
export const HARD_MAX_BYTES = 65536;
export const HARD_MAX_DUPLICATES = 20;
export const HARD_CORRECTION_RESERVE = 20;

/** Documented policy: corrections may still admit near/over budget. */
export const CORRECTIONS_PREFER_BUDGET = true;
