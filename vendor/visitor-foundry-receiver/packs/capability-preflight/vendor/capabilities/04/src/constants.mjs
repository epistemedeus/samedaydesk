/**
 * R2-CAPABILITIES-04 — Cost-aware dry-run comparison constants.
 *
 * Cap04 is the capability-side dry-run comparison (quotes + free alternatives
 * for a capability job). It is NOT a full procurement brief (see Consumer07).
 *
 * Cost vocabulary MUST match Consumer07 exactly (authoritative shared states).
 *
 * reuseFrom / sharedWith: R2-CONSUMER-JOBS-07
 *   PRICE_STATE, FREE_ALTERNATIVE_STATE, PRICE_SOURCE, forbidden-field spirit.
 *
 * Preflight: experiments/revenue-swarm-0907/c9 quote.mjs derives unpaid payment
 * offers (x402 accepts / payTo). That is payment-offer oriented — NOT an
 * equivalent for Cap04 quote-vs-free comparison. Cap04 is built here instead.
 *
 * No ranking, reputation, invest advice, revenue projections, escrow, or custody.
 */

export const SHARED_WITH = Object.freeze(["R2-CONSUMER-JOBS-07"]);
export const REUSE_FROM = Object.freeze(["R2-CONSUMER-JOBS-07"]);

export const SCHEMA = "pilot.r2.capabilities.cost_dry_run_comparison.v1";
export const INPUT_SCHEMA = "pilot.r2.capabilities.cost_dry_run_input.v1";

export const COMPARISON_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL_INPUT: "partial_input",
  REJECTED: "rejected",
});

/**
 * Dry-run price states — exact Consumer07 strings.
 * Priority (derivePriceState): missing_price → stale_or_untrusted_source →
 * external_cost → quoted.
 */
export const PRICE_STATE = Object.freeze({
  QUOTED: "quoted",
  MISSING_PRICE: "missing_price",
  /** Cost outside the quoted amount / not included in the quote. */
  EXTERNAL_COST: "external_cost",
  /** Stale observation or fixture-labelled / not-a-live-offer source. */
  STALE_OR_UNTRUSTED_SOURCE: "stale_or_untrusted_source",
});

/**
 * Caller-supplied price source labels for dry-run fixtures.
 * FIXTURE_DEMO and STALE_OBSERVED map to PRICE_STATE.STALE_OR_UNTRUSTED_SOURCE.
 * Exact Consumer07 strings.
 */
export const PRICE_SOURCE = Object.freeze({
  CALLER_SUPPLIED: "caller.supplied.quote",
  FIXTURE_DEMO: "fixture.demo.not-a-live-offer",
  STALE_OBSERVED: "observed.stale",
  SAMEDAYDESK_BATCH_QUOTE: "samedaydesk.extract-batch.quote",
});

/**
 * Free alternative states — exact Consumer07 strings.
 * Keep `unavailable` distinct from empty/no-users.
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
 * Reject inputs that invent ranking / reputation / invest / revenue / escrow / custody.
 * Same forbidden-field spirit as Consumer07 / Cap01 / Exchange01.
 */
export const FORBIDDEN_FIELDS = Object.freeze([
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
  "revenue",
  "revenueProjection",
  "earnedUsd",
  "earnedUsdc",
  "buyerCount",
  "marketDemand",
  "escrow",
  "escrowBalance",
  "custody",
  "payToBroadcast",
  "claimAuthority",
]);

export const MUTATION_BOUNDARY =
  "Isolated feature-branch source/tests only. Root owns merge, publication, and paid actions.";

export const DRY_RUN_NOTE =
  "Dry-run only: compare caller-supplied quotes and free alternatives; never fetch live paid offers.";

export const C9_NOT_REUSED_NOTE =
  "Preflight: revenue-swarm-0907/c9 quote.mjs derives unpaid x402 payment offers " +
  "(payTo / accepts). Payment-offer oriented — not Cap04 quote-vs-free comparison. Cap04 built here.";
