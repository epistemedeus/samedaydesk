/**
 * recipe-envelope — Cap01 envelope from sample requirements → requiredInputs summary.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTaskRequirementsEnvelope } from "../../../01/src/index.mjs";
import { BOT, DRY_RUN_NOTE, SCHEMA } from "../constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "../../fixtures");

const FIXED_CLOCK = () => Date.parse("2026-09-10T12:48:15.801Z");

export const RECIPE_ID = "recipe-envelope";
export const RECIPE_TITLE = "Cap01 envelope → requiredInputs summary";
export const CAP = "01";

export function loadDefaultInput() {
  return JSON.parse(
    readFileSync(join(fixtures, "recipe-envelope.requirements.json"), "utf8"),
  );
}

/**
 * @param {object} [input] Cap01 requirements (or wrapped form)
 * @param {{ clock?: () => number }} [opts]
 */
export function runRecipeEnvelope(input = loadDefaultInput(), opts = {}) {
  const clock = opts.clock || FIXED_CLOCK;
  const envelope = buildTaskRequirementsEnvelope(input, { clock });

  const requiredInputsSummary = (envelope.requiredInputs || []).map((ri) => ({
    id: ri.id,
    name: ri.name,
    kind: ri.kind,
    required: ri.required !== false,
    source: ri.source ?? null,
  }));

  return {
    schema: SCHEMA,
    bot: BOT,
    recipeId: RECIPE_ID,
    cap: CAP,
    dryRun: true,
    paidCalls: false,
    dryRunNote: DRY_RUN_NOTE,
    generatedAt: new Date(clock()).toISOString(),
    envelopeStatus: envelope.status,
    taskId: envelope.taskId ?? input.taskId ?? null,
    requiredInputsSummary,
    requiredInputCount: requiredInputsSummary.length,
    missingInputs: envelope.missingInputs ?? [],
    objectiveCheckCount: envelope.outputConstraints?.objectiveChecks?.length ?? 0,
    subjectiveUnresolved:
      envelope.acceptableEvidence?.subjectiveUnresolved?.map((s) => s.id) ?? [],
    requirementsRef: envelope.requirementsRef ?? null,
  };
}
