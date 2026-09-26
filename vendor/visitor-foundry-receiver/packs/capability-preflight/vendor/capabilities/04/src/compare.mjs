import {
  C9_NOT_REUSED_NOTE,
  COMPARISON_STATUS,
  DRY_RUN_NOTE,
  ERROR_CODES,
  FREE_ALTERNATIVE_STATE,
  MUTATION_BOUNDARY,
  PRICE_SOURCE,
  PRICE_STATE,
  REUSE_FROM,
  SCHEMA,
  SHARED_WITH,
} from "./constants.mjs";
import { compareError, validateCostDryRunInput } from "./validate.mjs";

const STALE_SOURCES = new Set([
  PRICE_SOURCE.FIXTURE_DEMO,
  PRICE_SOURCE.STALE_OBSERVED,
  "fixture.demo.not-a-live-offer",
  "observed.stale",
]);

/**
 * Derive Cap04 / Consumer07-aligned price state from a normalized quote.
 * Priority: missing_price → stale_or_untrusted_source → external_cost → quoted.
 */
export function derivePriceState(quote) {
  const pricePresent = quote.present === true && quote.amountAtomic != null;
  if (!pricePresent) {
    return PRICE_STATE.MISSING_PRICE;
  }
  if (quote.stale === true || (quote.priceSource && STALE_SOURCES.has(quote.priceSource))) {
    return PRICE_STATE.STALE_OR_UNTRUSTED_SOURCE;
  }
  if (Array.isArray(quote.externalCosts) && quote.externalCosts.length > 0) {
    return PRICE_STATE.EXTERNAL_COST;
  }
  return PRICE_STATE.QUOTED;
}

function sharedCostVocabulary() {
  return {
    reuseFrom: [...REUSE_FROM],
    sharedWith: [...SHARED_WITH],
    PRICE_STATE: { ...PRICE_STATE },
    FREE_ALTERNATIVE_STATE: { ...FREE_ALTERNATIVE_STATE },
    PRICE_SOURCE: { ...PRICE_SOURCE },
    note:
      "Exact Consumer07 Cap04-aligned strings. unavailable ≠ empty/no-users. " +
      "Price-state priority: missing_price → stale_or_untrusted_source → external_cost → quoted.",
  };
}

function buildQuoteComparison(quote, freeAlternatives) {
  const priceState = derivePriceState(quote);
  const freeAltRows = freeAlternatives.map((fa) => ({
    id: fa.id,
    state: fa.state,
    label: fa.label,
    basis: fa.basis,
  }));

  const notes = [];
  if (priceState === PRICE_STATE.MISSING_PRICE) {
    notes.push("quote_missing_price");
  }
  if (priceState === PRICE_STATE.EXTERNAL_COST) {
    notes.push("quote_has_external_costs_outside_amount");
  }
  if (priceState === PRICE_STATE.STALE_OR_UNTRUSTED_SOURCE) {
    notes.push("quote_stale_or_untrusted_source");
  }
  if (freeAlternatives.length === 0) {
    // Empty list ≠ unavailable; callers should supply freeAlternatives with state unavailable.
    notes.push("no_free_alternatives_supplied");
  } else if (freeAlternatives.every((fa) => fa.state === FREE_ALTERNATIVE_STATE.UNAVAILABLE)) {
    notes.push("all_free_alternatives_unavailable");
  }

  return {
    quoteId: quote.id,
    label: quote.label,
    priceState,
    amountAtomic: priceState === PRICE_STATE.MISSING_PRICE ? null : quote.amountAtomic,
    currency: priceState === PRICE_STATE.MISSING_PRICE ? null : quote.currency,
    priceSource: quote.priceSource,
    externalCosts: quote.externalCosts,
    unit: quote.unit,
    freeAlternatives: freeAltRows,
    notes,
  };
}

function collectMissingInputs(input, comparisons) {
  const missing = [];
  for (const c of comparisons) {
    if (c.priceState === PRICE_STATE.MISSING_PRICE) {
      missing.push(`quotes[${c.quoteId}].amountAtomic`);
    }
  }
  if (input.freeAlternatives.length === 0) {
    missing.push("freeAlternatives[]");
  }
  return missing;
}

/**
 * Build cost-aware dry-run comparison from caller-supplied quotes + free alternatives.
 * Dry-run only — never fetches live paid offers. No paid calls.
 */
export function buildCostDryRunComparison(rawInput, { clock = () => Date.now() } = {}) {
  let input;
  try {
    input = validateCostDryRunInput(rawInput);
  } catch (err) {
    if (err && err.code) {
      return {
        schema: SCHEMA,
        taskId: isPlainTaskId(rawInput) ? String(rawInput.taskId).trim() : null,
        generatedAt: new Date(clock()).toISOString(),
        status: COMPARISON_STATUS.REJECTED,
        error: {
          code: err.code,
          message: err.message,
          details: err.details ?? null,
        },
        comparisons: [],
        missingInputs: [],
        dryRun: true,
        paidCalls: false,
        dryRunNote: DRY_RUN_NOTE,
        sharedCostVocabulary: sharedCostVocabulary(),
        mutationBoundary: MUTATION_BOUNDARY,
        c9NotReused: C9_NOT_REUSED_NOTE,
      };
    }
    throw err;
  }

  const comparisons = input.quotes.map((q) =>
    buildQuoteComparison(q, input.freeAlternatives),
  );
  const missingInputs = collectMissingInputs(input, comparisons);

  const hasMissingPrice = comparisons.some((c) => c.priceState === PRICE_STATE.MISSING_PRICE);
  const hasNoFreeAlts = input.freeAlternatives.length === 0;

  let status = COMPARISON_STATUS.READY;
  if (hasMissingPrice || hasNoFreeAlts) {
    status = COMPARISON_STATUS.PARTIAL_INPUT;
  }

  const out = {
    schema: SCHEMA,
    taskId: input.taskId,
    capabilityId: input.capabilityId,
    generatedAt: new Date(clock()).toISOString(),
    status,
    demo: input.demo === true,
    notes: input.notes,
    comparisons,
    missingInputs: status === COMPARISON_STATUS.PARTIAL_INPUT ? missingInputs : [],
    dryRun: true,
    paidCalls: false,
    dryRunNote: DRY_RUN_NOTE,
    sharedCostVocabulary: sharedCostVocabulary(),
    mutationBoundary: MUTATION_BOUNDARY,
    c9NotReused: C9_NOT_REUSED_NOTE,
    consumerInstructions:
      "Supply taskId + quotes[] + freeAlternatives[] as JSON fixtures. " +
      "Run `node src/cli.mjs compare <input.json>`. Compare price/free states only. " +
      "Do not treat this as an investment recommendation or procurement brief " +
      "(see R2-CONSUMER-JOBS-07 for need-coverage briefs).",
  };

  // Hard guarantee: never emit investmentRecommendation / ranking / revenue
  for (const key of ["investmentRecommendation", "rankingScore", "revenue", "buyerCount"]) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw compareError(ERROR_CODES.FORBIDDEN_CLAIM, `${key} must not appear on comparison`);
    }
  }

  return out;
}

function isPlainTaskId(raw) {
  return (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof raw.taskId === "string" &&
    raw.taskId.trim()
  );
}

export { derivePriceState as _derivePriceStateForTests };
