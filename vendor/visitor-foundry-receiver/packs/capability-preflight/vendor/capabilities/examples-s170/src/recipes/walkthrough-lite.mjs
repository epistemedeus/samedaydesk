/**
 * recipe-walkthrough-lite — Cap08 dry-run + journey-s162 status (read-only).
 * Documents how a customer runs the journey; does not rewrite journey-s162.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInstallFirstResultWalkthrough } from "../../../08/src/index.mjs";
import {
  adapterStatusTable,
  HEAVY_PIN,
  IMPORT_PATHS,
  NATIVE_CAPS,
  NATIVE_TIPS,
  S161_HONESTY_NOTES,
} from "../../../journey-s162/src/index.mjs";
import {
  BOT,
  DRY_RUN_NOTE,
  HEAVY_PIN_CONSUMED_BY_JOURNEY,
  SCHEMA,
} from "../constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "../../fixtures");

const FIXED_CLOCK = () => Date.parse("2026-09-10T12:48:15.801Z");

export const RECIPE_ID = "recipe-walkthrough-lite";
export const RECIPE_TITLE =
  "Cap08 walkthrough-lite + journey-s162 status (read-only)";
export const CAP = "08+journey-s162";

export function loadDefaultWalkthroughInput() {
  return {
    taskId: "s170-walkthrough-lite",
    requirements: JSON.parse(
      readFileSync(join(fixtures, "recipe-walkthrough-lite.requirements.json"), "utf8"),
    ),
    costInput: JSON.parse(
      readFileSync(join(fixtures, "recipe-walkthrough-lite.cost.json"), "utf8"),
    ),
    artifact: JSON.parse(
      readFileSync(join(fixtures, "recipe-walkthrough-lite.artifact.json"), "utf8"),
    ),
    discovery: { capabilityId: "observe_public_docs_json" },
    prerequisites: { prerequisites: ["node20", "offline_fixtures"] },
  };
}

/**
 * Read-only journey status snapshot (no journey rewrite).
 */
export function readJourneyStatusLite() {
  const adapters = adapterStatusTable();
  return {
    heavyPin: HEAVY_PIN,
    heavyPinMatchesConsumed: HEAVY_PIN === HEAVY_PIN_CONSUMED_BY_JOURNEY,
    nativeCaps: [...NATIVE_CAPS],
    nativeTips: { ...NATIVE_TIPS },
    importPaths: { ...IMPORT_PATHS },
    adapters,
    readyForRelease: false,
    accepted: false,
    howCustomerRunsJourney: {
      fromPackage: [
        "cd experiments/scale-r2-20260910/capabilities/journey-s162",
        "node src/cli.mjs install",
        "node src/cli.mjs status",
        "node src/cli.mjs demo",
        "npm test",
      ],
      fromRepoRoot: [
        "node experiments/scale-r2-20260910/capabilities/journey-s162/src/cli.mjs status",
        "node experiments/scale-r2-20260910/capabilities/journey-s162/src/cli.mjs demo",
        "node --test experiments/scale-r2-20260910/capabilities/journey-s162/tests/*.test.mjs",
      ],
      note:
        "Heavy pin already consumed by journey-s162 — do not fork Heavy trees. TAP/#pass is not release acceptance.",
    },
    honestyNotes: [...S161_HONESTY_NOTES],
  };
}

/**
 * @param {object} [input] Cap08 walkthrough input
 * @param {{ clock?: () => number }} [opts]
 */
export async function runRecipeWalkthroughLite(
  input = loadDefaultWalkthroughInput(),
  opts = {},
) {
  const clock = opts.clock || FIXED_CLOCK;
  const walkthrough = await runInstallFirstResultWalkthrough(input, { clock });
  const journeyStatus = readJourneyStatusLite();

  return {
    schema: SCHEMA,
    bot: BOT,
    recipeId: RECIPE_ID,
    cap: CAP,
    dryRun: true,
    paidCalls: false,
    paidInstall: false,
    liveNetwork: false,
    dryRunNote: DRY_RUN_NOTE,
    generatedAt: new Date(clock()).toISOString(),
    walkthroughStatus: walkthrough.status,
    walkthroughStages: (walkthrough.stages || []).map((s) => ({
      id: s.id,
      status: s.status,
    })),
    journeyStatusLite: journeyStatus,
    customerNote:
      "This recipe documents Cap08 thin walkthrough + journey-s162 status. Full eight-component journey lives in journey-s162; Heavy pin already consumed there.",
  };
}
