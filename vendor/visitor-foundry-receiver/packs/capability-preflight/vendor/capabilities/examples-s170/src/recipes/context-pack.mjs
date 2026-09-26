/**
 * recipe-context-pack — Cap07 pack + dry-run readback with redaction.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBuyerContextPack, REDACTED } from "../../../07/src/index.mjs";
import { BOT, DRY_RUN_NOTE, SCHEMA } from "../constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "../../fixtures");

const FIXED_CLOCK = () => Date.parse("2026-09-10T12:48:15.801Z");

export const RECIPE_ID = "recipe-context-pack";
export const RECIPE_TITLE = "Cap07 context pack + redacted dry-run readback";
export const CAP = "07";

export function loadDefaultInput() {
  return JSON.parse(
    readFileSync(join(fixtures, "recipe-context-pack.input.json"), "utf8"),
  );
}

/**
 * @param {object} [input] Cap07 buyer context pack input
 * @param {{ clock?: () => number }} [opts]
 */
export function runRecipeContextPack(input = loadDefaultInput(), opts = {}) {
  const clock = opts.clock || FIXED_CLOCK;
  const pack = buildBuyerContextPack(input, { clock });
  const readback = pack.dryRunReadback || {};
  const headers = readback.headers || {};

  const authRedacted =
    headers.Authorization === REDACTED || headers.authorization === REDACTED;

  return {
    schema: SCHEMA,
    bot: BOT,
    recipeId: RECIPE_ID,
    cap: CAP,
    dryRun: true,
    paidCalls: false,
    dryRunNote: DRY_RUN_NOTE,
    generatedAt: new Date(clock()).toISOString(),
    packStatus: pack.status,
    taskId: pack.taskId ?? input.taskId ?? null,
    includedInputIds: (pack.includedInputs || []).map((i) => i.id),
    excludedExtras: pack.excludedExtras ?? [],
    missingInputs: pack.missingInputs ?? [],
    dryRunReadback: {
      method: readback.method,
      url: readback.url,
      headers,
      bodyPreview: readback.bodyPreview ?? null,
    },
    redaction: {
      token: REDACTED,
      authorizationRedacted: authRedacted,
      note: "Secrets in dry-run readback must show [REDACTED], never raw tokens.",
    },
  };
}
