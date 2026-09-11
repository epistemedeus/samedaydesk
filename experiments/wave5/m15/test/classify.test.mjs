import test from "node:test";
import assert from "node:assert/strict";
import { classifyInvocation, trialExecutionOk } from "../lib/classify.mjs";

test("ok analysis with both brief files is analysis, not failure", () => {
  const classified = classifyInvocation({
    exitCode: 0,
    stdout: JSON.stringify({ ok: true, status: "informational", breaking: 0, unknown: 0 }),
    outputJsonExists: true,
    outputMdExists: true,
  });
  assert.equal(classified.kind, "analysis");
  assert.equal(classified.analysisStatus, "informational");
  assert.equal(trialExecutionOk(classified), true);
});

test("ok analysis missing brief files is engine-failure, not a useful delivery", () => {
  const classified = classifyInvocation({
    exitCode: 0,
    stdout: JSON.stringify({ ok: true, status: "actionable", breaking: 1 }),
    outputJsonExists: false,
    outputMdExists: false,
  });
  assert.equal(classified.kind, "engine-failure");
  assert.equal(classified.reason, "missing-outputs");
  assert.equal(trialExecutionOk(classified), false);
});

test("documented OpenAPI refuse is analysis, not engine-failure", () => {
  const classified = classifyInvocation({
    exitCode: 2,
    stdout: JSON.stringify({
      ok: false,
      refused: true,
      code: "not-this-job-openapi",
      customerBrief: false,
    }),
    outputJsonExists: false,
    outputMdExists: false,
  });
  assert.equal(classified.kind, "analysis");
  assert.equal(classified.analysisStatus, "refused");
  assert.equal(classified.refuseCode, "not-this-job-openapi");
  assert.equal(trialExecutionOk(classified), true);
});

test("internal-error is engine-failure", () => {
  const classified = classifyInvocation({
    exitCode: 1,
    stdout: JSON.stringify({ ok: false, refused: true, code: "internal-error", error: "boom" }),
  });
  assert.equal(classified.kind, "engine-failure");
  assert.equal(classified.reason, "internal-error");
  assert.equal(trialExecutionOk(classified), false);
});

test("spawn error is transport-failure", () => {
  const classified = classifyInvocation({
    spawnError: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    exitCode: null,
    stdout: "",
  });
  assert.equal(classified.kind, "transport-failure");
  assert.equal(classified.reason, "spawn-error");
  assert.equal(trialExecutionOk(classified), false);
});

test("non-json stdout is engine-failure", () => {
  const classified = classifyInvocation({
    exitCode: 1,
    stdout: "Segmentation fault",
  });
  assert.equal(classified.kind, "engine-failure");
  assert.equal(classified.reason, "non-json-stdout");
});
