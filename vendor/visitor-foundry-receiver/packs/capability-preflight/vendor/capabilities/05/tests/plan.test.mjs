import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  FAILURE_CLASS,
  FREE_ALTERNATIVE_STATE,
  MUTATION_STATE,
  PLAN_STATUS,
  PLAN_STEP_KIND,
  SCHEMA,
  buildFailureFallbackPlan,
  buildMutationPreservation,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const FIXED = () => Date.parse("2026-09-10T12:00:00.000Z");

test("positive: known mutation + timeout yields ready provider-neutral plan", () => {
  const out = buildFailureFallbackPlan(load("positive-known-mutation.json"), { clock: FIXED });
  assert.equal(out.schema, SCHEMA);
  assert.equal(out.status, PLAN_STATUS.READY);
  assert.equal(out.generatedAt, "2026-09-10T12:00:00.000Z");
  assert.equal(out.failureClass, FAILURE_CLASS.TIMEOUT);
  assert.equal(out.mutationState, MUTATION_STATE.KNOWN);
  assert.equal(out.dryRun, true);
  assert.equal(out.paidCalls, false);
  assert.equal(out.liveExecution, false);
  assert.equal(out.providerNeutral, true);
  assert.ok(out.steps.some((s) => s.kind === PLAN_STEP_KIND.RETRY_BOUNDED));
  assert.ok(out.steps.some((s) => s.kind === PLAN_STEP_KIND.STOP));
  assert.ok(out.steps.every((s) => s.paidCalls === false && s.liveExecution === false));
  assert.equal(out.missingInputs.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "providerBrand"), false);
  assert.equal(out.mutationPreservation.rolled_back, false);
  assert.match(out.mutationBoundary, /Root owns merge/i);
});


test("ambiguous: mutationPreservation never claims rolled_back true", () => {
  const out = buildFailureFallbackPlan(load("ambiguous-mutation.json"), { clock: FIXED });
  assert.equal(out.status, PLAN_STATUS.READY);
  assert.equal(out.mutationState, MUTATION_STATE.AMBIGUOUS);
  assert.ok(out.mutationPreservation);
  assert.equal(out.mutationPreservation.mutationState, MUTATION_STATE.AMBIGUOUS);
  assert.equal(out.mutationPreservation.preserveAmbiguity, true);
  assert.equal(out.mutationPreservation.rolled_back, false);
  assert.notEqual(out.mutationPreservation.rolled_back, true);
  assert.equal(out.mutationPreservation.sideEffectsClean, false);
  assert.match(out.mutationPreservation.note, /Ambiguous mutation state preserved/i);
  assert.ok(out.steps.some((s) => s.kind === PLAN_STEP_KIND.HUMAN_REVIEW));
  for (const s of out.steps) {
    assert.notEqual(s.rolled_back, true);
  }
});

test("partial: missing fields listed; no invented facts", () => {
  const out = buildFailureFallbackPlan(load("partial-missing-fields.json"), { clock: FIXED });
  assert.equal(out.status, PLAN_STATUS.PARTIAL_INPUT);
  assert.ok(out.missingInputs.length >= 1);
  const ids = out.missingInputs.map((m) => m.id);
  assert.ok(ids.includes("failureClass"));
  assert.ok(ids.includes("mutationState"));
  assert.ok(ids.includes("observedState"));
  assert.deepEqual(out.steps, []);
  assert.equal(out.capabilityId, "extract_batch_json");
  assert.equal(out.attemptId, "attempt-partial-input-003");
});

test("negative: forbidden fields yield rejected plan", () => {
  const out = buildFailureFallbackPlan(load("negative-forbidden.json"), { clock: FIXED });
  assert.equal(out.status, PLAN_STATUS.REJECTED);
  assert.equal(out.error.code, "forbidden_claim");
  assert.equal(out.dryRun, true);
  assert.equal(out.paidCalls, false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "rankingScore"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(out, "providerBrand"), false);
});

test("free-baseline-hint: use_free_baseline only when already supplied", () => {
  const out = buildFailureFallbackPlan(load("free-baseline-hint.json"), { clock: FIXED });
  assert.equal(out.status, PLAN_STATUS.READY);
  assert.equal(out.freeAlternativeState, FREE_ALTERNATIVE_STATE.EQUIVALENT);
  assert.ok(out.steps.some((s) => s.kind === PLAN_STEP_KIND.USE_FREE_BASELINE));
  const free = out.steps.find((s) => s.kind === PLAN_STEP_KIND.USE_FREE_BASELINE);
  assert.equal(free.freeAlternativeId, "free-local-script");
  assert.equal(free.providerNeutral, true);
  assert.match(free.rationale, /already-compared free baseline/i);
});

test("buildMutationPreservation: ambiguous never rolled_back true", () => {
  const amb = buildMutationPreservation(MUTATION_STATE.AMBIGUOUS);
  assert.equal(amb.rolled_back, false);
  assert.equal(amb.sideEffectsClean, false);
  assert.equal(amb.preserveAmbiguity, true);
  const none = buildMutationPreservation(MUTATION_STATE.NONE);
  assert.equal(none.preserveAmbiguity, false);
  assert.equal(none.rolled_back, false);
});

test("does not invent free baseline when freeAlternativeState absent", () => {
  const out = buildFailureFallbackPlan(load("positive-known-mutation.json"), { clock: FIXED });
  assert.ok(!out.steps.some((s) => s.kind === PLAN_STEP_KIND.USE_FREE_BASELINE));
  assert.equal(out.freeAlternativeState, null);
});

