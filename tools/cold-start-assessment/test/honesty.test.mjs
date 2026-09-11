import assert from "node:assert/strict";
import test from "node:test";
import { inspectHonesty } from "../src/honesty.mjs";

test("demo SAMPLE claiming actual_completion is rejected", () => {
  const result = inspectHonesty(
    [
      {
        mode: "demo",
        sampleLabel: "SAMPLE",
        actualCompletion: true,
        paid: true,
        completionLabel: "actual_completion",
      },
    ],
    { demoContext: true },
  );
  assert.equal(result.flags.sampleLabelledAsPaidCompletion, true);
  assert.ok(result.findings.some((row) => row.code === "sample_labelled_as_paid_completion"));
});

test("honest demo is not paid completion", () => {
  const result = inspectHonesty(
    [
      {
        mode: "demo",
        readyForRelease: false,
        paidCalls: false,
        purchaseAuthority: false,
        actualCompletion: false,
      },
    ],
    { demoContext: true },
  );
  assert.equal(result.flags.sampleLabelledAsPaidCompletion, false);
  assert.equal(result.flags.purchaseAuthority, false);
  assert.equal(result.flags.actualCompletion, false);
});
