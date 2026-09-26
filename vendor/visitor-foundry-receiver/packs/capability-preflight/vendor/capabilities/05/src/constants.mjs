/**
 * R2-CAPABILITIES-05 — Failure fallback plan constants.
 *
 * Cap05 builds a bounded, provider-neutral dry-run fallback plan from a
 * failed capability outcome record. It does NOT invent a new provider brand
 * as “the fix”, does not run live retries, and preserves ambiguous mutation
 * state (never claims rollback succeeded or side effects are clean).
 *
 * Preflight:
 *   - commons n45: task-memory / correspondence replay kit — not a generator
 *     of provider-neutral plans from failed capability outcomes.
 *   - revenue-swarm-0907/c4 memory-transport: in-memory correspondence
 *     transport for work-request exchange QA — not an equivalent Cap05
 *     fallback planner. Cap05 is built here instead.
 *
 * Optional Cap04 reference: freeAlternativeState may unlock a
 * use_free_baseline step only when the input already includes it
 * (do not invent a free alternative).
 *
 * No ranking, reputation, invest advice, revenue, escrow, custody, or
 * claimAuthority.
 */

export const SCHEMA = "pilot.r2.capabilities.failure_fallback_plan.v1";
export const INPUT_SCHEMA = "pilot.r2.capabilities.failure_outcome.v1";

export const PLAN_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL_INPUT: "partial_input",
  REJECTED: "rejected",
});

export const FAILURE_CLASS = Object.freeze({
  TIMEOUT: "timeout",
  VALIDATION: "validation",
  AUTH: "auth",
  DEPENDENCY_UNAVAILABLE: "dependency_unavailable",
  PARTIAL_DELIVERY: "partial_delivery",
  UNKNOWN: "unknown",
});

export const MUTATION_STATE = Object.freeze({
  NONE: "none",
  KNOWN: "known",
  AMBIGUOUS: "ambiguous",
});

export const PLAN_STEP_KIND = Object.freeze({
  RETRY_BOUNDED: "retry_bounded",
  REDUCE_SCOPE: "reduce_scope",
  USE_FREE_BASELINE: "use_free_baseline",
  HUMAN_REVIEW: "human_review",
  STOP: "stop",
});

/**
 * Cap04 / Consumer07 free-alternative states — optional on input only.
 * Cap05 never invents a free baseline; it may reference one already supplied.
 */
export const FREE_ALTERNATIVE_STATE = Object.freeze({
  EQUIVALENT: "equivalent",
  NOT_EQUIVALENT: "not_equivalent",
  UNAVAILABLE: "unavailable",
});

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: "invalid_input",
  MISSING_REQUIREMENT: "missing_requirement",
  FORBIDDEN_CLAIM: "forbidden_claim",
});

/**
 * Reject inputs that invent ranking / reputation / invest / revenue / escrow /
 * custody / claimAuthority. Same forbidden-field spirit as Cap01 / Cap04 /
 * Consumer07. Also reject provider-switch invention fields.
 */
export const FORBIDDEN_FIELDS = Object.freeze([
  "buyerCount",
  "revenue",
  "revenueProjection",
  "earnedUsd",
  "earnedUsdc",
  "rankingScore",
  "rankScore",
  "universalRank",
  "reputation",
  "reputationScore",
  "rating",
  "reviews",
  "investmentRecommendation",
  "buySellAdvice",
  "investAdvice",
  "escrow",
  "escrowBalance",
  "custody",
  "payToBroadcast",
  "claimAuthority",
  "providerBrand",
  "switchToProvider",
  "recommendedVendor",
  "paidProviderFix",
]);

export const MUTATION_BOUNDARY =
  "Isolated feature-branch source/tests only. Root owns merge, publication, and paid actions.";

export const DRY_RUN_NOTE =
  "Dry-run plan only: generate provider-neutral fallback steps from a failed " +
  "outcome fixture; never execute live retries or paid calls.";

export const PREFLIGHT_NOT_REUSED_NOTE =
  "Preflight: commons n45 is task-memory/correspondence replay; " +
  "revenue-swarm-0907/c4 memory-transport is in-memory correspondence for " +
  "work-request exchange QA. Neither generates provider-neutral fallback " +
  "plans from failed capability outcomes. Cap05 built here.";

export const DEFAULT_RETRY_BOUNDS = Object.freeze({
  maxAttempts: 2,
  sameContract: true,
  paidCalls: false,
  liveExecution: false,
});
