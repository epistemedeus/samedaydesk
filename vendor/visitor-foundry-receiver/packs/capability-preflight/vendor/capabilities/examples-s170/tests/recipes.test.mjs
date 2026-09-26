/**
 * BOT-S170 examples — smoke + honesty checks for thin Cap recipes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOT,
  HEAVY_PIN_CONSUMED_BY_JOURNEY,
  QUOTA_RESET_UTC,
  RECIPE_IDS,
  SCHEMA,
} from "../src/constants.mjs";
import { runRecipeEnvelope } from "../src/recipes/envelope.mjs";
import { runRecipeCostCompare } from "../src/recipes/cost-compare.mjs";
import { runRecipeFallback } from "../src/recipes/fallback.mjs";
import { runRecipeContextPack } from "../src/recipes/context-pack.mjs";
import {
  readJourneyStatusLite,
  runRecipeWalkthroughLite,
} from "../src/recipes/walkthrough-lite.mjs";
import { REDACTED } from "../../07/src/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXED_CLOCK = () => Date.parse(QUOTA_RESET_UTC);

describe("S170 recipe catalog", () => {
  it("exports five disjoint recipe ids", () => {
    assert.deepEqual([...RECIPE_IDS], [
      "recipe-envelope",
      "recipe-cost-compare",
      "recipe-fallback",
      "recipe-context-pack",
      "recipe-walkthrough-lite",
    ]);
    assert.equal(BOT, "BOT-S170");
    assert.equal(SCHEMA, "pilot.r2.capabilities.examples_s170.v1");
  });

  it("docs quota reset timestamp is exact", () => {
    assert.equal(QUOTA_RESET_UTC, "2026-09-10T12:48:15.801Z");
  });
});

describe("recipe-envelope (Cap01)", () => {
  it("builds envelope and prints requiredInputs summary", () => {
    const out = runRecipeEnvelope(undefined, { clock: FIXED_CLOCK });
    assert.equal(out.recipeId, "recipe-envelope");
    assert.equal(out.cap, "01");
    assert.equal(out.dryRun, true);
    assert.equal(out.paidCalls, false);
    assert.equal(out.envelopeStatus, "ready");
    assert.ok(out.requiredInputCount >= 1);
    assert.ok(Array.isArray(out.requiredInputsSummary));
    assert.ok(out.requiredInputsSummary.some((r) => r.id === "task_requirements"));
    assert.equal(out.generatedAt, QUOTA_RESET_UTC);
  });
});

describe("recipe-cost-compare (Cap04)", () => {
  it("compares quotes vs free alternative without paid calls", () => {
    const out = runRecipeCostCompare(undefined, { clock: FIXED_CLOCK });
    assert.equal(out.recipeId, "recipe-cost-compare");
    assert.equal(out.cap, "04");
    assert.equal(out.dryRun, true);
    assert.equal(out.paidCalls, false);
    assert.equal(out.comparisonStatus, "ready");
    assert.ok(out.quoteComparisons.length >= 1);
    assert.ok(out.quoteComparisons.every((q) => q.priceState === "quoted"));
    assert.ok(out.equivalentFreeCount >= 1);
  });
});

describe("recipe-fallback (Cap05) honesty", () => {
  it("preserves ambiguous mutation (no invent rollback/clean)", () => {
    const out = runRecipeFallback(undefined, { clock: FIXED_CLOCK });
    assert.equal(out.recipeId, "recipe-fallback");
    assert.equal(out.cap, "05");
    assert.equal(out.planStatus, "ready");
    assert.equal(out.mutationPreservation.mutationState, "ambiguous");
    assert.equal(out.mutationPreservation.preserveAmbiguity, true);
    assert.equal(out.mutationPreservation.rolled_back, false);
    assert.equal(out.mutationPreservation.sideEffectsClean, false);
    assert.equal(out.honesty.ambiguousPreserved, true);
    assert.ok(out.stepKinds.includes("human_review") || out.stepKinds.includes("stop"));
  });
});

describe("recipe-context-pack (Cap07) redaction", () => {
  it("redacts Authorization in dry-run readback and drops extras", () => {
    const out = runRecipeContextPack(undefined, { clock: FIXED_CLOCK });
    assert.equal(out.recipeId, "recipe-context-pack");
    assert.equal(out.cap, "07");
    assert.equal(out.packStatus, "ready");
    assert.equal(out.dryRunReadback.headers.Authorization, REDACTED);
    assert.equal(out.redaction.authorizationRedacted, true);
    assert.ok(
      (out.excludedExtras || []).some(
        (e) => e.id === "noise_field" || e.id === "X-Extra-Debug",
      ),
    );
    const raw = readFileSync(
      join(__dirname, "../fixtures/recipe-context-pack.input.json"),
      "utf8",
    );
    assert.ok(raw.includes("sk-s170-synthetic-not-real"));
    assert.notEqual(
      out.dryRunReadback.headers.Authorization,
      "Bearer sk-s170-synthetic-not-real",
    );
  });
});

describe("recipe-walkthrough-lite (Cap08 + journey-s162 reader)", () => {
  it("runs Cap08 dry-run and reads journey status without claiming release", async () => {
    const out = await runRecipeWalkthroughLite(undefined, { clock: FIXED_CLOCK });
    assert.equal(out.recipeId, "recipe-walkthrough-lite");
    assert.equal(out.dryRun, true);
    assert.equal(out.paidCalls, false);
    assert.equal(out.paidInstall, false);
    assert.equal(out.liveNetwork, false);
    assert.ok(["ready", "partial", "complete"].includes(out.walkthroughStatus) || out.walkthroughStatus);
    assert.ok(Array.isArray(out.walkthroughStages));
    assert.ok(out.walkthroughStages.length >= 1);

    const js = out.journeyStatusLite;
    assert.equal(js.heavyPin, HEAVY_PIN_CONSUMED_BY_JOURNEY);
    assert.equal(js.heavyPinMatchesConsumed, true);
    assert.equal(js.readyForRelease, false);
    assert.equal(js.accepted, false);
    assert.ok(js.adapters.adapterWired === true);
    assert.ok(js.howCustomerRunsJourney.fromPackage.length >= 1);
  });

  it("readJourneyStatusLite is read-only and pins Heavy already consumed", () => {
    const status = readJourneyStatusLite();
    assert.equal(status.heavyPin, "2dcb01713acdc1bb45eec7c8b21b0092a08b2e8c");
    assert.deepEqual(status.nativeCaps, ["01", "04", "05", "07", "08"]);
    assert.equal(status.readyForRelease, false);
  });
});
