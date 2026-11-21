import assert from "node:assert/strict";
import test from "node:test";
import { runExperiment } from "../harness.mjs";

test("R06 harness: no false reuse, no producer calls on hits, refusals recompute", () => {
  const result = runExperiment();
  assert.equal(result.dataLabel, "synthetic fixtures only; not real outside data");
  assert.ok(result.cases >= 5 && result.cases <= 10);
  assert.equal(result.falseReuseCount, 0);
  assert.equal(result.producerCallsOnHits, 0);
  assert.equal(result.retirements, 1);
  assert.ok(Object.values(result.refusalReasons).filter((reason) => reason === "capture_digest_mismatch").length >= 2);
  assert.equal(result.recomputeCount, result.cases - result.hits);
  assert.deepEqual(result.localPathOrStateLeaksInCommons, []);
  assert.equal(result.costs.producer, "costs_unknown");
  assert.equal(result.timings.sample, "single-sample");
  assert.ok(result.taskIdSubjectFriction.consumeSideLegacyPath.every((row) => row.reason === "subject_mismatch"));
});
