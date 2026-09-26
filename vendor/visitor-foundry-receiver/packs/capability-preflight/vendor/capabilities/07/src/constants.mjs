/**
 * R2-CAPABILITIES-07 — Buyer-controlled context pack constants.
 *
 * Bounded invocation pack: only required/allowed caller data + endpoint scope,
 * with dry-run readback (no network / paid calls).
 *
 * Cap01 requiredInputs / capabilityContract.inputs shapes are mirrored locally
 * (semantics reused; no hard cross-branch import).
 *
 * Forbidden: buyerCount, revenue, ranking, escrow, custody, claimAuthority,
 * live paid calls.
 */

export const SCHEMA = "pilot.r2.capabilities.buyer_context_pack.v1";
export const INPUT_SCHEMA = "pilot.r2.capabilities.buyer_context_pack_input.v1";

/** Cap01-shaped capability contract inputs reuse marker. */
export const REUSE_FROM = Object.freeze(["R2-CAPABILITIES-01"]);

export const PACK_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL_INPUT: "partial_input",
  REJECTED: "rejected",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  FORBIDDEN_CLAIM: "forbidden_claim",
  FORBIDDEN_ENDPOINT: "forbidden_endpoint",
});

/**
 * Same forbidden-field spirit as Cap01 / Cap04 / Exchange01.
 * Reject invented demand/revenue/ranking/escrow/custody claims.
 */
export const FORBIDDEN_FIELDS = Object.freeze([
  "buyerCount",
  "revenue",
  "earnedUsd",
  "earnedUsdc",
  "rankingScore",
  "rankScore",
  "universalRank",
  "reputation",
  "reputationScore",
  "escrow",
  "escrowBalance",
  "custody",
  "claimAuthority",
  "investmentRecommendation",
  "buySellAdvice",
  "investAdvice",
  "revenueProjection",
  "marketDemand",
  "payToBroadcast",
]);

export const ALLOWED_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

/** Placeholder used in dry-run readback for secret:true values. */
export const REDACTED = "[REDACTED]";

export const MUTATION_BOUNDARY =
  "Isolated feature-branch source/tests only. Root owns merge, publication, and paid actions.";

export const DRY_RUN_NOTE =
  "Dry-run readback only: echo bounded method/url/headers/bodyPreview; never make network or paid calls.";

export const CAP01_NOT_HARD_DEP_NOTE =
  "Cap01 requiredInputs / capabilityContract.inputs shapes mirrored locally; no hard cross-branch import.";
