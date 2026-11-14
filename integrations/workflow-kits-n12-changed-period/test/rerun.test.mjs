import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ROUTES, runScenario } from "../src/scenario.mjs";

const runs = Object.fromEntries(ROUTES.map((route) => [route, runScenario(route)]));
const step = (route, name) => runs[route].steps.find((s) => s.step === name);

describe("rerun a materially changed period without double-applying (Make, n8n, direct)", () => {
  for (const route of ROUTES) {
    test(`${route}: every accepted record applied exactly once across 7 steps`, () => {
      const run = runs[route];
      assert.equal(run.maxAppliesPerKey, 1);
      assert.equal(run.externalEffects, 7);
      assert.equal(run.journeyCommits, 7);
      assert.equal(run.receipts.length, 7);
      assert.equal(step(route, "period-N").applied.length, 3);
      assert.equal(step(route, "period-N+1 unadapted").applied.length, 0);
      assert.equal(step(route, "period-N+1 attempt").status, "error", "the attempt stops at the lost apply reply");
      assert.deepEqual(step(route, "period-N+1 rerun again").applied, []);
      assert.deepEqual(step(route, "period-N under changed terms").applied, []);
      assert.deepEqual(step(route, "period-N+1 local hash").applied, []);
      assert.equal(step(route, "period-N+1 rerun again").summary.alreadyApplied, 4);
      assert.equal(step(route, "period-N+1 rerun").outcomes["r-005"], "exception:ingestion_not_permitted");
    });
  }

  test("final receipts are identical across Make, n8n and direct", () => {
    assert.deepEqual(runs.make.receipts, runs.direct.receipts);
    assert.deepEqual(runs.n8n.receipts, runs.direct.receipts);
  });

  test("the partial attempt differs by engine and the rerun converges", () => {
    assert.deepEqual(step("make", "period-N+1 attempt").applied, ["period-N+1/r-001", "period-N+1/r-002", "period-N+1/r-003"]);
    assert.deepEqual(step("direct", "period-N+1 attempt").applied, ["period-N+1/r-001", "period-N+1/r-002", "period-N+1/r-003"]);
    assert.deepEqual(step("n8n", "period-N+1 attempt").applied, ["period-N+1/r-001", "period-N+1/r-003"], "n8n v1 order finishes the apply branch first, so the replay branch never runs");
    assert.deepEqual(step("make", "period-N+1 rerun").applied, ["period-N+1/r-004"]);
    assert.deepEqual(step("n8n", "period-N+1 rerun").applied, ["period-N+1/r-002", "period-N+1/r-004"]);
    assert.equal(step("n8n", "period-N+1 rerun").outcomes["r-003"], "already_applied");
  });
});
