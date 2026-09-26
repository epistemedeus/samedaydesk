import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ERROR_CODES,
  FAILURE_CLASS,
  MUTATION_STATE,
  collectMissingInputs,
  validateFailureOutcome,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));

test("validate: positive known mutation normalizes", () => {
  const n = validateFailureOutcome(load("positive-known-mutation.json"));
  assert.equal(n.capabilityId, "extract_batch_json");
  assert.equal(n.failureClass, FAILURE_CLASS.TIMEOUT);
  assert.equal(n.mutationState, MUTATION_STATE.KNOWN);
  assert.equal(n.errorCode, "ETIMEDOUT");
  assert.ok(n.observedState.summary);
});

test("validate: ambiguous mutation normalizes", () => {
  const n = validateFailureOutcome(load("ambiguous-mutation.json"));
  assert.equal(n.mutationState, MUTATION_STATE.AMBIGUOUS);
  assert.equal(n.failureClass, FAILURE_CLASS.PARTIAL_DELIVERY);
});

test("validate: forbidden fields throw forbidden_claim", () => {
  assert.throws(
    () => validateFailureOutcome(load("negative-forbidden.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("collectMissingInputs: partial fixture lists required gaps", () => {
  const missing = collectMissingInputs(load("partial-missing-fields.json"));
  const ids = missing.map((m) => m.id);
  assert.ok(ids.includes("failureClass"));
  assert.ok(ids.includes("mutationState"));
  assert.ok(ids.includes("observedState"));
});

test("validate: freeAlternativeState equivalent accepted", () => {
  const n = validateFailureOutcome(load("free-baseline-hint.json"));
  assert.equal(n.freeAlternativeState, "equivalent");
  assert.equal(n.freeAlternativeId, "free-local-script");
});
