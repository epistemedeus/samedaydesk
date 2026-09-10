#!/usr/bin/env node
/**
 * Fresh-consumer CLI for R2-DISTRIBUTION-06.
 *
 *   node src/cli.mjs demo
 *   node src/cli.mjs build <job.json>
 *   node src/cli.mjs validate <recipe.json>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPE_STATUS } from "./constants.mjs";
import { buildContinuationRecipe } from "./build.mjs";
import { validateRecipe } from "./validate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usage() {
  console.error(`Usage:
  node src/cli.mjs demo
  node src/cli.mjs build <job.json>
  node src/cli.mjs validate <recipe.json>`);
  process.exit(2);
}

const [cmd, a] = process.argv.slice(2);
if (!cmd) usage();

const clock = () => Date.parse("2026-09-10T20:00:00.000Z");

try {
  if (cmd === "build") {
    if (!a) usage();
    const recipe = buildContinuationRecipe(loadJson(a), { clock });
    console.log(JSON.stringify(recipe, null, 2));
    const bad = [
      RECIPE_STATUS.BLOCKED_MISSING_INPUT,
      RECIPE_STATUS.UNAVAILABLE,
    ].includes(recipe.status);
    process.exit(bad ? 1 : 0);
  } else if (cmd === "validate") {
    if (!a) usage();
    const recipe = validateRecipe(loadJson(a));
    console.log(
      JSON.stringify(
        {
          ok: true,
          status: recipe.status,
          jobKind: recipe.jobRef?.kind ?? null,
          optInRequired: recipe.reusePolicy?.optInRequired ?? null,
          broadcast: recipe.reusePolicy?.broadcast ?? null,
          commandCount: Array.isArray(recipe.commands) ? recipe.commands.length : 0,
          hasPriorDeliveryCount: Object.prototype.hasOwnProperty.call(
            recipe,
            "priorDeliveryCount",
          ),
          priorDeliveryCount: Object.prototype.hasOwnProperty.call(
            recipe,
            "priorDeliveryCount",
          )
            ? recipe.priorDeliveryCount
            : null,
          marketplaceSurface: recipe.marketplaceHints?.surface ?? null,
          grexalListingStatus: recipe.marketplaceHints?.listingStatus ?? null,
          schema: recipe.schema,
        },
        null,
        2,
      ),
    );
  } else if (cmd === "demo") {
    const available = buildContinuationRecipe(
      loadJson(join(root, "fixtures/job.positive.json")),
      { clock },
    );
    const partial = buildContinuationRecipe(
      loadJson(join(root, "fixtures/job.partial.json")),
      { clock },
    );
    const unavailable = buildContinuationRecipe(
      loadJson(join(root, "fixtures/job.unavailable.json")),
      { clock },
    );
    const noUsers = buildContinuationRecipe(
      loadJson(join(root, "fixtures/job.no-users.json")),
      { clock },
    );
    const outPath = "/tmp/r2-dist-06-recipe.json";
    writeFileSync(outPath, JSON.stringify(available, null, 2));
    console.log(
      JSON.stringify(
        {
          available: {
            status: available.status,
            jobKind: available.jobRef?.kind,
            afterDeliveryStep: available.afterDeliveryStep,
            optInRequired: available.reusePolicy?.optInRequired,
            broadcast: available.reusePolicy?.broadcast,
            commandCount: available.commands?.length,
            priorDeliveryCount: available.priorDeliveryCount,
            grexalListingStatus: available.marketplaceHints?.listingStatus,
            grexalAgentId: available.marketplaceHints?.agentId,
            grexalRunCompletedUsd: available.marketplaceHints?.pricingRunCompletedUsd,
            customerRevenueClaimed:
              available.marketplaceHints?.customerExecutionRevenuePayout === true,
          },
          partial: {
            status: partial.status,
            missingInputs: partial.missingInputs,
          },
          unavailable: {
            status: unavailable.status,
            hasPriorDeliveryCount: Object.prototype.hasOwnProperty.call(
              unavailable,
              "priorDeliveryCount",
            ),
          },
          noUsers: {
            status: noUsers.status,
            priorDeliveryCount: noUsers.priorDeliveryCount,
          },
          distinct:
            unavailable.status === RECIPE_STATUS.UNAVAILABLE &&
            noUsers.status === RECIPE_STATUS.NO_USERS &&
            unavailable.status !== noUsers.status,
          optInEnforced: available.reusePolicy?.optInRequired === true,
          noBroadcast: available.reusePolicy?.broadcast === false,
          usefulJobNotGeneric:
            available.jobRef?.kind === "source_change_evidence_pack",
          wroteRecipe: outPath,
          mutationBoundary: available.mutationBoundary,
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
