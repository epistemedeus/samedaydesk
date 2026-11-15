import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createKitEffects, fromMakeExecution, fromN8nExecution, runPeriod, runPackagedCheck, withFlowAssert, mapExit, runFlowAssertCli } from "../index.mjs";
import { makeExecutionFixture, n8nExecutionFixture, periodNWebhookBody } from "../scripts/build-artifacts.mjs";
import { projectWorkExchangeCallerTerms } from "../vendor/payment-rail/recurring-journey/terms-projection.mjs";
import { CLOCK, clone, readJson, readText, readVendorFixture } from "./helpers.mjs";

const RETRYABLE = new Set(["ingestion_missing", "capture_stale", "ingestion_incomplete", "uncommitted"]);

function viaMake(mutate) {
  const body = clone(periodNWebhookBody());
  mutate(body);
  return runPeriod(fromMakeExecution(makeExecutionFixture(body, { id: "t" }), { clock: CLOCK }), { effects: createKitEffects() });
}

function viaN8n(mutate) {
  const body = clone(periodNWebhookBody());
  mutate(body);
  return runPeriod(fromN8nExecution(n8nExecutionFixture(body, { id: "t" }), { clock: CLOCK }), { effects: createKitEffects() });
}

function expectException(out, code) {
  assert.equal(out.period.exception?.code, code);
  assert.equal(out.period.retry.retryable, RETRYABLE.has(code), `retryable for ${code}`);
  assert.notEqual(out.period.decision, "accept");
  assert.equal(out.result.acceptedOutput ?? null, null);
}

const cases = [
  ["ingestion_missing", (b) => { b.period.capture = null; }],
  ["ingestion_not_permitted", (b) => { b.period.capture = readVendorFixture("synthetic-permitted-failure-unpermitted.json"); }],
  ["ingestion_incomplete", (b) => { delete b.period.capture.subject; }],
  ["capture_stale", (b) => { b.period.capture = readVendorFixture("synthetic-permitted-failure-stale.json"); }],
  ["schema_changed", (b) => { b.period.capture = readVendorFixture("synthetic-later-period-schema-change.json"); b.period.capture.capturedAt = "2026-11-12T10:00:00.000Z"; }],
  ["token_used_as_task_ref", (b) => { b.period.caller.taskRef = readVendorFixture("synthetic-permitted-failure-token-as-taskref.json").taskRef; }],
  ["continuation_file_missing", (b) => { b.period.caller.continuationFileMissing = true; }],
];

describe("failure: each exception code through both adapters", () => {
  for (const [code, mutate] of cases) {
    test(`${code} via Make`, () => expectException(viaMake(mutate), code));
    test(`${code} via n8n`, () => expectException(viaN8n(mutate), code));
  }

  test("ingestion_incomplete and schema_changed set completeness.complete false", () => {
    for (const code of ["ingestion_incomplete", "schema_changed"]) {
      const mutate = cases.find(([c]) => c === code)[1];
      assert.equal(viaMake(mutate).period.completeness.complete, false, code);
    }
  });

  test("continuation_file_missing is not retryable", () => {
    const out = viaN8n((b) => { b.period.caller.continuationFileMissing = true; });
    assert.equal(out.period.retry.retryable, false);
  });

  test("discovery inside a public view is ignored; measurement is the only source", () => {
    const out = viaMake((b) => { b.period.caller.publicView = { discovery: { status: "observed", source: "cli" } }; b.period.caller.discovery = { status: "observed", source: "cli" }; });
    assert.equal(out.period.decision, "accept");
    assert.equal(out.result.caller.discovery, undefined);
    assert.equal(out.result.measurement.discovery.status, "declared");
  });

  test("a locally hashed termsVersion that differs from the exchange is terms_changed", () => {
    const body = periodNWebhookBody();
    const local = projectWorkExchangeCallerTerms(body.period.termsInput).localTermsVersion;
    assert.notEqual(local, body.period.termsInput.preview.termsVersion);
    const out = viaMake((b) => { b.period.termsInput.claimedTermsVersion = local; });
    expectException(out, "terms_changed");
    assert.equal(out.result.artifact, null);
  });

  test("a later period whose exchange termsVersion changed for the same task is terms_changed", () => {
    const effects = createKitEffects();
    const first = runPeriod(fromMakeExecution(readJson("fixtures/make/execution-period-n.json"), { clock: CLOCK }), { effects });
    const later = fromMakeExecution(readJson("fixtures/make/execution-schema-change.json"), { clock: CLOCK });
    later.ingestion = readVendorFixture("synthetic-period-n-plus-1-same.json");
    later.workflowOutput = later.ingestion.payload;
    later.sameTaskTerms = true;
    const out = runPeriod(later, { effects, periodN: first.result });
    expectException(out, "terms_changed");
  });

  test("a follow-up that reuses the period N task id is follow_up_not_new_task", () => {
    const effects = createKitEffects();
    const first = runPeriod(fromN8nExecution(readJson("fixtures/n8n/execution-period-n.json"), { clock: CLOCK }), { effects });
    const later = fromN8nExecution(readJson("fixtures/n8n/execution-schema-change.json"), { clock: CLOCK });
    later.taskId = first.period.recordEvidence.taskId;
    const out = runPeriod(later, { effects, periodN: first.result });
    expectException(out, "follow_up_not_new_task");
  });

  test("uncommitted: Make incomplete and n8n error executions fabricate no result", () => {
    for (const [adapt, rel] of [[fromMakeExecution, "fixtures/make/execution-period-n-incomplete.json"], [fromN8nExecution, "fixtures/n8n/execution-period-n-error.json"]]) {
      const input = adapt(readJson(rel), { clock: CLOCK });
      assert.equal(input.committed, false);
      const out = runPeriod(input, { effects: createKitEffects() });
      expectException(out, "uncommitted");
      assert.equal(out.result.artifact.result, null);
    }
  });
});

describe("failure: FlowAssert disposition stays separate from acceptance", () => {
  const sourceCsv = readText("vendor/flowassert/offline/examples/source.csv");
  const destinationCsv = readText("vendor/flowassert/offline/examples/destination.csv");
  const config = { key: ["external_id", "external_id"], fields: [{ source: "phone", destination: "phone", rule: "exact" }, { source: "email", destination: "hs_email", rule: "exact" }], scope: "source" };

  test("upstream sample pair is Mismatch (exit 1) while the period stays accepted", async () => {
    const accepted = runPeriod(fromMakeExecution(readJson("fixtures/make/execution-period-n.json"), { clock: CLOCK }), { effects: createKitEffects() });
    const before = JSON.stringify(accepted.period);
    const fa = await runPackagedCheck({ sourceCsv, destinationCsv, config });
    assert.equal(fa.state, "Mismatch");
    assert.equal(fa.exit, 1);
    assert.equal(fa.mappedState, "Mismatch");
    assert.equal(fa.affectsAcceptance, false);
    const combined = withFlowAssert(accepted, fa);
    assert.equal(combined.decision, "accept");
    assert.equal(JSON.stringify(combined.period), before);
  });

  test("stated-complete matching pair is Verified (exit 0)", async () => {
    const fa = await runPackagedCheck({ sourceCsv, destinationCsv: readText("fixtures/flowassert/destination-complete.csv"), config, sourceComplete: true, destinationComplete: true });
    assert.equal(fa.state, "Verified");
    assert.equal(fa.exit, 0);
  });

  test("no premises stated on a matching pair is Unverified (exit 3)", async () => {
    const fa = await runPackagedCheck({ sourceCsv, destinationCsv: readText("fixtures/flowassert/destination-complete.csv"), config });
    assert.equal(fa.state, "Unverified");
    assert.equal(fa.exit, 3);
  });

  test("exit codes map as documented upstream", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 9].map(mapExit), ["Verified", "Mismatch", "refused", "Unverified", "failed", "failed"]);
  });

  test("the CLI route reports not_run when flowassert-verify is absent, and maps a real exit status", () => {
    const absent = runFlowAssertCli({ sourcePath: "s", destinationPath: "d", key: "k", spawn: () => ({ error: Object.assign(new Error("x"), { code: "ENOENT" }) }) });
    assert.equal(absent.state, "not_run");
    const mismatch = runFlowAssertCli({ sourcePath: "s", destinationPath: "d", key: "k", spawn: () => ({ status: 1, stdout: "Mismatch", stderr: "" }) });
    assert.equal(mismatch.state, "Mismatch");
    assert.equal(mismatch.affectsAcceptance, false);
  });
});

