/**
 * recipe-fallback — Cap05 from a failed outcome (preserve ambiguous mutation honesty).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFailureFallbackPlan } from "../../../05/src/index.mjs";
import { BOT, DRY_RUN_NOTE, SCHEMA } from "../constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "../../fixtures");

const FIXED_CLOCK = () => Date.parse("2026-09-10T12:48:15.801Z");

export const RECIPE_ID = "recipe-fallback";
export const RECIPE_TITLE = "Cap05 fallback from failed outcome (ambiguous honesty)";
export const CAP = "05";

export function loadDefaultInput() {
  return JSON.parse(
    readFileSync(join(fixtures, "recipe-fallback.failed-outcome.json"), "utf8"),
  );
}

/**
 * @param {object} [input] Cap05 failure_outcome
 * @param {{ clock?: () => number }} [opts]
 */
export function runRecipeFallback(input = loadDefaultInput(), opts = {}) {
  const clock = opts.clock || FIXED_CLOCK;
  const plan = buildFailureFallbackPlan(input, { clock });
  const mp = plan.mutationPreservation || {};

  return {
    schema: SCHEMA,
    bot: BOT,
    recipeId: RECIPE_ID,
    cap: CAP,
    dryRun: true,
    paidCalls: false,
    dryRunNote: DRY_RUN_NOTE,
    generatedAt: new Date(clock()).toISOString(),
    planStatus: plan.status,
    capabilityId: plan.capabilityId ?? input.capabilityId ?? null,
    attemptId: plan.attemptId ?? input.attemptId ?? null,
    failureClass: plan.failureClass ?? input.failureClass ?? null,
    mutationPreservation: {
      mutationState: mp.mutationState,
      preserveAmbiguity: mp.preserveAmbiguity === true,
      rolled_back: mp.rolled_back === true,
      sideEffectsClean: mp.sideEffectsClean === true,
      note: mp.note ?? null,
    },
    stepKinds: (plan.steps || []).map((s) => s.kind),
    honesty: {
      ambiguousPreserved:
        mp.mutationState === "ambiguous" &&
        mp.preserveAmbiguity === true &&
        mp.rolled_back !== true &&
        mp.sideEffectsClean !== true,
      note:
        "Ambiguous mutation must never invent rolled_back:true or sideEffectsClean:true.",
    },
  };
}
