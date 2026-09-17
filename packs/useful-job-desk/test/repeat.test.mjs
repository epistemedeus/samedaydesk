import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { PACK_ROOT, parseReceipt, runDesk } from "./helpers.mjs";

test("changed-input repeat delivers a different engine digest", () => {
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
    "--out-dir",
    join(PACK_ROOT, "out", "test-repeat-vendor"),
  ]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = parseReceipt(r);
  assert.equal(body.ok, true);
  assert.equal(body.delivered, true);
  assert.equal(body.code, "changed-input-repeat");
  assert.equal(body.repeat.changedInput, true);
  assert.equal(body.repeat.sameFixture, false);
  assert.equal(body.repeat.repeatDemand, false);
  assert.equal(body.repeatDemand, false);
  assert.notEqual(body.first.digest, body.second.digest);
  assert.equal(body.callerFilesUnchanged, true);
  assert.equal(body.engine.cliInvoked, true);
});

test("unchanged after file is not a repeat", () => {
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
  ]);
  assert.equal(r.status, 2);
  const body = parseReceipt(r);
  assert.equal(body.ok, false);
  assert.equal(body.delivered, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "unchanged-input-repeat");
  assert.equal(body.repeat.sameFixture, true);
  assert.equal(body.repeatDemand, false);
});
