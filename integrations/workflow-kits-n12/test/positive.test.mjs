import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createKitEffects, fromMakeExecution, fromMakeRequest, fromN8nExecution, fromN8nRequest, runPeriod, stablePeriod, PERIOD_FIELDS } from "../index.mjs";
import { periodNWebhookBody } from "../scripts/build-artifacts.mjs";
import { buildWorkflowRequest } from "../src/workflow-request.mjs";
import { CLOCK, nativePeriodN, readJson } from "./helpers.mjs";

describe("positive: period N accepted through each kit equals the native period.*", () => {
  const native = stablePeriod(nativePeriodN().period);

  test("native baseline is accepted", () => {
    assert.equal(native.decision, "accept");
    assert.equal(native.exception, null);
    assert.equal(native.completeness.complete, true);
    assert.match(native.idempotencyKey, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(native), [...PERIOD_FIELDS]);
  });

  test("Make execution export gives the same period.*", () => {
    const input = fromMakeExecution(readJson("fixtures/make/execution-period-n.json"), { clock: CLOCK });
    assert.equal(input.source, "make");
    assert.equal(input.committed, true);
    const out = runPeriod(input, { effects: createKitEffects() });
    assert.deepEqual(stablePeriod(out.period), native);
  });

  test("n8n stored execution export gives the same period.*", () => {
    const input = fromN8nExecution(readJson("fixtures/n8n/execution-period-n.json"), { clock: CLOCK });
    assert.equal(input.source, "n8n");
    assert.equal(input.committed, true);
    const out = runPeriod(input, { effects: createKitEffects() });
    assert.deepEqual(stablePeriod(out.period), native);
  });

  test("the request bodies the kits post give the same period.*", () => {
    const body = periodNWebhookBody();
    for (const [platform, adapt] of [["make", fromMakeRequest], ["n8n", fromN8nRequest]]) {
      const request = buildWorkflowRequest({ platform, period: body.period, workflowOutput: body.period.capture.payload, committed: true, clock: CLOCK });
      const out = runPeriod(adapt(request), { effects: createKitEffects() });
      assert.deepEqual(stablePeriod(out.period), native, platform);
    }
  });

  test("the exchange-supplied termsVersion is passed through unchanged", () => {
    const body = periodNWebhookBody();
    const input = fromMakeExecution(readJson("fixtures/make/execution-period-n.json"), { clock: CLOCK });
    assert.deepEqual(input.termsInput, body.period.termsInput);
    const out = runPeriod(input, { effects: createKitEffects() });
    assert.equal(out.period.recordEvidence.termsVersion, body.period.termsInput.preview.termsVersion);
  });
});
