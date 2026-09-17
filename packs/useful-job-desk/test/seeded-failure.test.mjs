import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT, parseReceipt, runDesk } from "./helpers.mjs";

test("hidden --repeatDemand alias is the same seeded refuse", () => {
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
    "--repeatDemand",
  ]);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const body = parseReceipt(r);
  assert.equal(body.ok, false);
  assert.equal(body.delivered, false);
  assert.equal(body.code, "same-fixture-labelled-repeat-demand");
  assert.equal(body.repeat.labelledRepeatDemand, true);
  assert.equal(body.repeatDemand, false);
});

test("changed input labelled repeat demand is unproved, not delivered", () => {
  const r = runDesk([
    "repeat",
    "--job",
    "vendor-budget-impact",
    "--before",
    join(PACK_ROOT, "callers/vendor/before.json"),
    "--after",
    join(PACK_ROOT, "callers/vendor/after.json"),
    "--after-repeat",
    join(PACK_ROOT, "callers/vendor/after-repeat.json"),
    "--demand-class",
    "repeat-demand",
  ]);
  assert.equal(r.status, 2);
  const body = parseReceipt(r);
  assert.equal(body.ok, false);
  assert.equal(body.delivered, false);
  assert.equal(body.code, "repeat-demand-unproved");
  assert.equal(body.repeatDemand, false);
});

test("path-escaping job id is refused", () => {
  const r = runDesk([
    "repeat",
    "--job",
    "../secret",
    "--before",
    join(PACK_ROOT, "callers/vendor/before.json"),
    "--after",
    join(PACK_ROOT, "callers/vendor/after.json"),
    "--after-repeat",
    join(PACK_ROOT, "callers/vendor/after-repeat.json"),
  ]);
  assert.equal(r.status, 2);
  const body = parseReceipt(r);
  assert.equal(body.ok, false);
  assert.equal(body.delivered, false);
  assert.equal(body.code, "invalid-job-id");
});

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
