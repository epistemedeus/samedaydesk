import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateAcceptance, evaluateTaskAcceptance } from "../src/acceptance.mjs";
import { validateBundle } from "../src/schema.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

test("bundle-helpful meets objective acceptance without executing anything", () => {
  const acceptance = evaluateAcceptance(validateBundle(load("bundle-helpful.json")).bundle);
  assert.equal(acceptance.summary.acceptedCount, 2);
  assert.equal(acceptance.summary.exceptionCount, 0);
  assert.equal(acceptance.summary.verifierExecuted, false);
  assert.equal(acceptance.tasks[0].outcome, "objective_acceptance_met");
});

test("exception-needed refuses auto-accept and does not execute verifier payloads", () => {
  const acceptance = evaluateAcceptance(validateBundle(load("exception-needed.json")).bundle);
  assert.equal(acceptance.tasks[0].outcome, "needs_reviewer_exception");
  assert.equal(acceptance.tasks[0].verifierExecuted, false);
  assert.equal(acceptance.tasks[0].autoAcceptedToLowerCost, false);
  assert.ok(acceptance.tasks[0].reasons.includes("auto_accept_to_lower_cost_refused"));
  assert.ok(acceptance.tasks[0].reasons.includes("criterion_unobserved"));
  assert.ok(acceptance.tasks[0].reasons.includes("verifier_payload_not_executed"));
  assert.ok(acceptance.tasks[0].notes.includes("verifier_payload_not_executed"));
});

test("failed deterministic checks are objective_not_met, not an exception", () => {
  const result = evaluateTaskAcceptance({
    taskId: "mismatch",
    criteria: ["public-example"],
    delivery: {
      observations: {
        "public-example": { check: "digest_match", expected: "aaa", observed: "bbb" },
      },
    },
  });
  assert.equal(result.outcome, "objective_not_met");
  assert.ok(result.reasons.includes("deterministic_check_failed"));
});

test("unknown check types need a reviewer exception", () => {
  const result = evaluateTaskAcceptance({
    taskId: "judgment",
    criteria: ["courteous-public-reply"],
    delivery: {
      observations: {
        "courteous-public-reply": { check: "model_grade", expected: true, observed: true },
      },
    },
  });
  assert.equal(result.outcome, "needs_reviewer_exception");
  assert.ok(result.reasons.includes("check_not_deterministic"));
});

test("exact_equal refuses absent expected or observed values", () => {
  const bothAbsent = evaluateTaskAcceptance({
    taskId: "absent-both",
    criteria: ["flag"],
    delivery: {
      observations: {
        flag: { check: "exact_equal" },
      },
    },
  });
  assert.equal(bothAbsent.outcome, "needs_reviewer_exception");
  assert.equal(bothAbsent.checks[0].reason, "value_absent");
  assert.equal(bothAbsent.checks[0].decided, false);
  assert.equal(bothAbsent.checks[0].ok, false);

  const observedAbsent = evaluateTaskAcceptance({
    taskId: "absent-observed",
    criteria: ["flag"],
    delivery: {
      observations: {
        flag: { check: "exact_equal", expected: false },
      },
    },
  });
  assert.equal(observedAbsent.outcome, "needs_reviewer_exception");
  assert.equal(observedAbsent.checks[0].reason, "value_absent");
});

test("exact_equal still accepts explicit false, zero, empty string, and null", () => {
  for (const value of [false, 0, "", null]) {
    const result = evaluateTaskAcceptance({
      taskId: `present-${String(value)}`,
      criteria: ["flag"],
      delivery: {
        observations: {
          flag: { check: "exact_equal", expected: value, observed: value },
        },
      },
    });
    assert.equal(result.outcome, "objective_acceptance_met", `value=${String(value)}`);
    assert.equal(result.checks[0].ok, true);
    assert.equal(result.checks[0].decided, true);
  }
});
