#!/usr/bin/env node
/**
 * Fresh-consumer CLI for BOT-S170 Cap journey examples.
 *
 *   node src/cli.mjs list
 *   node src/cli.mjs run <recipe>
 *   node src/cli.mjs demo-all
 */

import {
  BOT,
  DRY_RUN_NOTE,
  HEAVY_PIN_CONSUMED_BY_JOURNEY,
  MUTATION_BOUNDARY,
  OUT_OF_SCOPE,
  QUOTA_RESET_PT,
  QUOTA_RESET_UTC,
  RECIPE_IDS,
} from "./constants.mjs";
import {
  RECIPE_ID as ENVELOPE_ID,
  RECIPE_TITLE as ENVELOPE_TITLE,
  runRecipeEnvelope,
} from "./recipes/envelope.mjs";
import {
  RECIPE_ID as COST_ID,
  RECIPE_TITLE as COST_TITLE,
  runRecipeCostCompare,
} from "./recipes/cost-compare.mjs";
import {
  RECIPE_ID as FALLBACK_ID,
  RECIPE_TITLE as FALLBACK_TITLE,
  runRecipeFallback,
} from "./recipes/fallback.mjs";
import {
  RECIPE_ID as PACK_ID,
  RECIPE_TITLE as PACK_TITLE,
  runRecipeContextPack,
} from "./recipes/context-pack.mjs";
import {
  RECIPE_ID as WT_ID,
  RECIPE_TITLE as WT_TITLE,
  runRecipeWalkthroughLite,
} from "./recipes/walkthrough-lite.mjs";

const FIXED_CLOCK = () => Date.parse(QUOTA_RESET_UTC);

const RECIPES = Object.freeze({
  [ENVELOPE_ID]: {
    id: ENVELOPE_ID,
    title: ENVELOPE_TITLE,
    cap: "01",
    run: () => runRecipeEnvelope(undefined, { clock: FIXED_CLOCK }),
  },
  [COST_ID]: {
    id: COST_ID,
    title: COST_TITLE,
    cap: "04",
    run: () => runRecipeCostCompare(undefined, { clock: FIXED_CLOCK }),
  },
  [FALLBACK_ID]: {
    id: FALLBACK_ID,
    title: FALLBACK_TITLE,
    cap: "05",
    run: () => runRecipeFallback(undefined, { clock: FIXED_CLOCK }),
  },
  [PACK_ID]: {
    id: PACK_ID,
    title: PACK_TITLE,
    cap: "07",
    run: () => runRecipeContextPack(undefined, { clock: FIXED_CLOCK }),
  },
  [WT_ID]: {
    id: WT_ID,
    title: WT_TITLE,
    cap: "08+journey-s162",
    run: () => runRecipeWalkthroughLite(undefined, { clock: FIXED_CLOCK }),
  },
});

function usage() {
  console.error(`Usage:
  node src/cli.mjs list
  node src/cli.mjs run <recipe>
  node src/cli.mjs demo-all

Recipes:
${RECIPE_IDS.map((id) => `  - ${id}`).join("\n")}`);
  process.exit(2);
}

function printList() {
  const list = {
    bot: BOT,
    package: "r2-capabilities-examples-s170",
    dryRunNote: DRY_RUN_NOTE,
    mutationBoundary: MUTATION_BOUNDARY,
    heavyPinConsumedByJourneyS162: HEAVY_PIN_CONSUMED_BY_JOURNEY,
    quotaResetNote: {
      utc: QUOTA_RESET_UTC,
      pt: QUOTA_RESET_PT,
      scope: "docs only",
    },
    outOfScope: [...OUT_OF_SCOPE],
    recipes: RECIPE_IDS.map((id) => ({
      id,
      title: RECIPES[id].title,
      cap: RECIPES[id].cap,
    })),
  };
  console.log(JSON.stringify(list, null, 2));
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

try {
  if (cmd === "list") {
    printList();
  } else if (cmd === "run") {
    if (!a) usage();
    const recipe = RECIPES[a];
    if (!recipe) {
      console.error(
        JSON.stringify({
          error: "unknown_recipe",
          message: `Unknown recipe: ${a}`,
          known: [...RECIPE_IDS],
        }),
      );
      process.exit(2);
    }
    const result = await recipe.run();
    console.log(JSON.stringify(result, null, 2));
  } else if (cmd === "demo-all") {
    const results = {};
    for (const id of RECIPE_IDS) {
      results[id] = await RECIPES[id].run();
    }
    console.log(
      JSON.stringify(
        {
          bot: BOT,
          demo: "all",
          dryRun: true,
          paidCalls: false,
          quotaResetNote: { utc: QUOTA_RESET_UTC, pt: QUOTA_RESET_PT },
          recipes: results,
        },
        null,
        2,
      ),
    );
  } else {
    usage();
  }
} catch (err) {
  console.error(
    JSON.stringify({
      error: err.code || "error",
      message: err.message,
      details: err.details || null,
    }),
  );
  process.exit(1);
}
