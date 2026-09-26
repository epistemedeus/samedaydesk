import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPARISON_STATUS,
  FREE_ALTERNATIVE_STATE,
  PRICE_STATE,
  PRICE_SOURCE,
  REUSE_FROM,
  SCHEMA,
  buildCostDryRunComparison,
  derivePriceState,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const FIXED = () => Date.parse("2026-09-10T12:00:00.000Z");

/** Exact Consumer07 string values Cap04 must match. */
const CONSUMER07_PRICE_STATE = {
  quoted: "quoted",
  missing_price: "missing_price",
  external_cost: "external_cost",
  stale_or_untrusted_source: "stale_or_untrusted_source",
};
const CONSUMER07_FREE_STATE = {
  equivalent: "equivalent",
  not_equivalent: "not_equivalent",
  unavailable: "unavailable",
};
const CONSUMER07_PRICE_SOURCE = {
  "caller.supplied.quote": "caller.supplied.quote",
  "fixture.demo.not-a-live-offer": "fixture.demo.not-a-live-offer",
  "observed.stale": "observed.stale",
  "samedaydesk.extract-batch.quote": "samedaydesk.extract-batch.quote",
};

test("vocabulary: PRICE_STATE values match Consumer07 exactly", () => {
  assert.equal(PRICE_STATE.QUOTED, CONSUMER07_PRICE_STATE.quoted);
  assert.equal(PRICE_STATE.MISSING_PRICE, CONSUMER07_PRICE_STATE.missing_price);
  assert.equal(PRICE_STATE.EXTERNAL_COST, CONSUMER07_PRICE_STATE.external_cost);
  assert.equal(
    PRICE_STATE.STALE_OR_UNTRUSTED_SOURCE,
    CONSUMER07_PRICE_STATE.stale_or_untrusted_source,
  );
  assert.deepEqual(Object.values(PRICE_STATE).sort(), Object.values(CONSUMER07_PRICE_STATE).sort());
});

test("vocabulary: FREE_ALTERNATIVE_STATE values match Consumer07 exactly", () => {
  assert.equal(FREE_ALTERNATIVE_STATE.EQUIVALENT, CONSUMER07_FREE_STATE.equivalent);
  assert.equal(FREE_ALTERNATIVE_STATE.NOT_EQUIVALENT, CONSUMER07_FREE_STATE.not_equivalent);
  assert.equal(FREE_ALTERNATIVE_STATE.UNAVAILABLE, CONSUMER07_FREE_STATE.unavailable);
  assert.deepEqual(
    Object.values(FREE_ALTERNATIVE_STATE).sort(),
    Object.values(CONSUMER07_FREE_STATE).sort(),
  );
});

test("vocabulary: PRICE_SOURCE values match Consumer07 exactly", () => {
  assert.equal(PRICE_SOURCE.CALLER_SUPPLIED, "caller.supplied.quote");
  assert.equal(PRICE_SOURCE.FIXTURE_DEMO, "fixture.demo.not-a-live-offer");
  assert.equal(PRICE_SOURCE.STALE_OBSERVED, "observed.stale");
  assert.equal(PRICE_SOURCE.SAMEDAYDESK_BATCH_QUOTE, "samedaydesk.extract-batch.quote");
  assert.deepEqual(Object.values(PRICE_SOURCE).sort(), Object.keys(CONSUMER07_PRICE_SOURCE).sort());
});

test("positive: ready comparison with quoted prices and free equivalent", () => {
  const out = buildCostDryRunComparison(load("positive.json"), { clock: FIXED });
  assert.equal(out.schema, SCHEMA);
  assert.equal(out.status, COMPARISON_STATUS.READY);
  assert.equal(out.generatedAt, "2026-09-10T12:00:00.000Z");
  assert.equal(out.dryRun, true);
  assert.equal(out.paidCalls, false);
  assert.deepEqual(out.sharedCostVocabulary.reuseFrom, [...REUSE_FROM]);
  assert.equal(out.comparisons.length, 2);
  assert.equal(out.comparisons[0].priceState, PRICE_STATE.QUOTED);
  assert.equal(out.comparisons[0].amountAtomic, "25000");
  const freeStates = out.comparisons[0].freeAlternatives.map((f) => f.state).sort();
  assert.deepEqual(freeStates, [
    FREE_ALTERNATIVE_STATE.EQUIVALENT,
    FREE_ALTERNATIVE_STATE.NOT_EQUIVALENT,
  ].sort());
  assert.equal(out.missingInputs.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "investmentRecommendation"), false);
  assert.match(out.mutationBoundary, /Root owns merge/i);
});

test("negative: forbidden fields yield rejected comparison", () => {
  const out = buildCostDryRunComparison(load("negative-forbidden.json"), { clock: FIXED });
  assert.equal(out.status, COMPARISON_STATUS.REJECTED);
  assert.equal(out.error.code, "forbidden_claim");
  assert.equal(out.dryRun, true);
  assert.equal(out.paidCalls, false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "investmentRecommendation"), false);
});

test("partial: missing_price yields partial_input", () => {
  const out = buildCostDryRunComparison(load("partial-missing-price.json"), { clock: FIXED });
  assert.equal(out.status, COMPARISON_STATUS.PARTIAL_INPUT);
  const states = out.comparisons.map((c) => c.priceState).sort();
  assert.deepEqual(states, [PRICE_STATE.MISSING_PRICE, PRICE_STATE.QUOTED].sort());
  assert.ok(out.missingInputs.some((m) => m.includes("quote-unpriced")));
  const unpriced = out.comparisons.find((c) => c.quoteId === "quote-unpriced");
  assert.equal(unpriced.amountAtomic, null);
});

test("external-cost + stale_or_untrusted_source states", () => {
  const out = buildCostDryRunComparison(load("external-cost.json"), { clock: FIXED });
  assert.equal(out.status, COMPARISON_STATUS.READY);
  const byId = Object.fromEntries(out.comparisons.map((c) => [c.quoteId, c]));
  assert.equal(byId["quote-external"].priceState, PRICE_STATE.EXTERNAL_COST);
  assert.equal(byId["quote-external"].externalCosts.length, 1);
  assert.equal(byId["quote-stale-fixture"].priceState, PRICE_STATE.STALE_OR_UNTRUSTED_SOURCE);
});

test("free-unavailable: unavailable is explicit and distinct from empty", () => {
  const out = buildCostDryRunComparison(load("free-unavailable.json"), { clock: FIXED });
  assert.equal(out.status, COMPARISON_STATUS.READY);
  assert.equal(out.comparisons.length, 1);
  assert.equal(out.comparisons[0].priceState, PRICE_STATE.QUOTED);
  assert.equal(out.comparisons[0].freeAlternatives.length, 1);
  assert.equal(
    out.comparisons[0].freeAlternatives[0].state,
    FREE_ALTERNATIVE_STATE.UNAVAILABLE,
  );
  assert.ok(out.comparisons[0].notes.includes("all_free_alternatives_unavailable"));
});

test("derivePriceState priority: missing → stale → external → quoted", () => {
  assert.equal(
    derivePriceState({ present: false, amountAtomic: null }),
    PRICE_STATE.MISSING_PRICE,
  );
  assert.equal(
    derivePriceState({
      present: true,
      amountAtomic: "1",
      stale: true,
      priceSource: PRICE_SOURCE.CALLER_SUPPLIED,
      externalCosts: [{ label: "x" }],
    }),
    PRICE_STATE.STALE_OR_UNTRUSTED_SOURCE,
  );
  assert.equal(
    derivePriceState({
      present: true,
      amountAtomic: "1",
      stale: false,
      priceSource: PRICE_SOURCE.FIXTURE_DEMO,
      externalCosts: [],
    }),
    PRICE_STATE.STALE_OR_UNTRUSTED_SOURCE,
  );
  assert.equal(
    derivePriceState({
      present: true,
      amountAtomic: "1",
      stale: false,
      priceSource: PRICE_SOURCE.CALLER_SUPPLIED,
      externalCosts: [{ label: "gas" }],
    }),
    PRICE_STATE.EXTERNAL_COST,
  );
  assert.equal(
    derivePriceState({
      present: true,
      amountAtomic: "1",
      stale: false,
      priceSource: PRICE_SOURCE.CALLER_SUPPLIED,
      externalCosts: [],
    }),
    PRICE_STATE.QUOTED,
  );
});
