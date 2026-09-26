/**
 * recipe-cost-compare — Cap04 dry-run quotes vs free alternative.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCostDryRunComparison } from "../../../04/src/index.mjs";
import { BOT, DRY_RUN_NOTE, SCHEMA } from "../constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "../../fixtures");

const FIXED_CLOCK = () => Date.parse("2026-09-10T12:48:15.801Z");

export const RECIPE_ID = "recipe-cost-compare";
export const RECIPE_TITLE = "Cap04 dry-run quotes vs free alternative";
export const CAP = "04";

export function loadDefaultInput() {
  return JSON.parse(
    readFileSync(join(fixtures, "recipe-cost-compare.input.json"), "utf8"),
  );
}

/**
 * @param {object} [input] Cap04 cost dry-run input
 * @param {{ clock?: () => number }} [opts]
 */
export function runRecipeCostCompare(input = loadDefaultInput(), opts = {}) {
  const clock = opts.clock || FIXED_CLOCK;
  const comparison = buildCostDryRunComparison(input, { clock });

  const rows = (comparison.comparisons || []).map((c) => ({
    quoteId: c.quoteId,
    label: c.label,
    priceState: c.priceState,
    amountAtomic: c.amountAtomic,
    currency: c.currency,
    freeAlternatives: (c.freeAlternatives || []).map((fa) => ({
      id: fa.id,
      state: fa.state,
      label: fa.label,
    })),
  }));

  const equivalentFree = rows.flatMap((r) =>
    (r.freeAlternatives || []).filter((fa) => fa.state === "equivalent"),
  );

  return {
    schema: SCHEMA,
    bot: BOT,
    recipeId: RECIPE_ID,
    cap: CAP,
    dryRun: true,
    paidCalls: false,
    dryRunNote: DRY_RUN_NOTE,
    generatedAt: new Date(clock()).toISOString(),
    comparisonStatus: comparison.status,
    taskId: comparison.taskId ?? input.taskId ?? null,
    capabilityId: comparison.capabilityId ?? input.capabilityId ?? null,
    quoteComparisons: rows,
    equivalentFreeCount: equivalentFree.length,
    missingInputs: comparison.missingInputs ?? [],
    note: "Dry-run only — caller-supplied quotes; not live offers. Empty free list ≠ unavailable.",
  };
}
