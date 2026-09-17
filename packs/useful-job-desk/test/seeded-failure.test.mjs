import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT, parseReceipt, runDesk } from "./helpers.mjs";

test("seeded failure: same fixture twice labelled repeat demand", () => {
  const r = runDesk([
    "repeat",
    "--job",
    "vendor-budget-impact",
    "--before",
    join(PACK_ROOT, "callers/vendor/before.json"),
    "--after",
    join(PACK_ROOT, "callers/vendor/after.json"),
    "--after-repeat",
    join(PACK_ROOT, "callers/vendor/after.json"),
    "--label-repeat-demand",
  ]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const body = parseReceipt(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.delivered, false);
  assert.equal(body.code, "same-fixture-labelled-repeat-demand");
  assert.equal(body.repeat.sameFixture, true);
  assert.equal(body.repeat.labelledRepeatDemand, true);
  assert.equal(body.repeat.changedInput, false);
  assert.equal(body.repeatDemand, false);
  assert.equal(body.organicDemand, false);
});
