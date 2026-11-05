import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateBundle } from "../src/evaluate.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

test("direct-cheaper keeps tasks separate", () => {
  const result = evaluateBundle(load("direct-cheaper.json"));
  assert.equal(result.ok, true);
  assert.equal(result.bundleDecision.action, "keep_separate");
  assert.ok(result.bundleDecision.reasons.includes("direct_lower_measured_effort"));
  assert.equal(result.bundleDecision.autoAcceptedToLowerCost, false);
});

test("bundle-helpful suggests bundling without accepting payment", () => {
  const result = evaluateBundle(load("bundle-helpful.json"));
  assert.equal(result.bundleDecision.action, "suggest_bundle");
  assert.ok(result.bundleDecision.reasons.includes("bundle_lowers_measured_effort"));
  assert.equal(result.signer, false);
  assert.equal(result.paymentCommand, false);
  assert.equal(result.fundedCommission, false);
});

test("exception-needed still blocks cheap auto-accept when bundling would look cheaper", () => {
  const result = evaluateBundle(load("exception-needed.json"));
  assert.equal(result.bundleDecision.action, "suggest_bundle");
  assert.equal(result.bundleDecision.acceptanceBlocksCheapAutoAccept, true);
  assert.equal(result.bundleDecision.autoAccept, false);
  assert.ok(result.bundleDecision.reasons.includes("acceptance_needs_reviewer_exception"));
  assert.equal(result.tasks[0].acceptance.outcome, "needs_reviewer_exception");
});

test("unknown-effort leaves grouping undecided", () => {
  const result = evaluateBundle(load("unknown-effort.json"));
  assert.equal(result.bundleDecision.action, "undecided_costs_unknown");
  assert.ok(result.bundleDecision.reasons.includes("costs_unknown"));
});
