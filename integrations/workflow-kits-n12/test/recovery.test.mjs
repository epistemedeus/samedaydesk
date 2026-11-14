import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createClientEndpoint, createKitEffects, fromMakeExecution, fromN8nExecution, runPeriod } from "../index.mjs";
import { periodNWebhookBody } from "../scripts/build-artifacts.mjs";
import { recoverLostReply } from "../vendor/payment-rail/recurring-journey/journey.mjs";
import { buildWorkflowRequest } from "../src/workflow-request.mjs";
import { CLOCK, nativePeriodN, readJson } from "./helpers.mjs";

describe("recovery: lost reply and uncommitted first request", () => {
  for (const [platform, adapt, rel] of [
    ["make", fromMakeExecution, "fixtures/make/execution-period-n.json"],
    ["n8n", fromN8nExecution, "fixtures/n8n/execution-period-n.json"],
  ]) {
    test(`${platform}: replaying the same request returns the original result with no second effect`, () => {
      const effects = createKitEffects();
      const input = adapt(readJson(rel), { clock: CLOCK });
      const first = runPeriod(input, { effects });
      const replay = runPeriod(input, { effects });
      assert.equal(replay.period.idempotencyKey, first.period.idempotencyKey);
      assert.equal(replay.period.retry.sameIdempotencyKey, first.period.idempotencyKey);
      assert.equal(replay.period.retry.recovered, true);
      assert.equal(replay.period.retry.secondEffect, false);
      assert.equal(replay.period.decision, "accept");
      assert.deepEqual(replay.result.artifact.result, first.result.artifact.result);
      assert.equal(effects.appliedCount(first.period.idempotencyKey), 1);
      assert.equal(effects.appliedCount(), 1);
    });
  }

  test("the vendored recoverLostReply agrees with the kit replay", () => {
    const effects = createKitEffects();
    const first = runPeriod(fromMakeExecution(readJson("fixtures/make/execution-period-n.json"), { clock: CLOCK }), { effects });
    const recovered = recoverLostReply(first.result, {
      committed: true,
      requestDigest: first.period.idempotencyKey,
      result: first.result.artifact.result,
      evidence: first.result.artifact.evidence,
    });
    assert.equal(recovered.outcome, "recovered_original");
    assert.equal(recovered.artifact.secondEffect, false);
    assert.equal(effects.appliedCount(), 1);
  });

  test("an uncommitted first request returns no result and records no effect; a committed retry then succeeds once", () => {
    const effects = createKitEffects();
    const pending = runPeriod(fromN8nExecution(readJson("fixtures/n8n/execution-period-n-error.json"), { clock: CLOCK }), { effects });
    assert.equal(pending.period.exception.code, "uncommitted");
    assert.equal(pending.period.retry.retryable, true);
    assert.equal(pending.result.artifact.result, null);
    assert.equal(effects.appliedCount(), 0);
    const retried = runPeriod(fromN8nExecution(readJson("fixtures/n8n/execution-period-n.json"), { clock: CLOCK }), { effects });
    assert.equal(retried.period.decision, "accept");
    assert.equal(retried.period.idempotencyKey, pending.period.retry.sameIdempotencyKey);
    assert.equal(effects.appliedCount(), 1);
  });

  test("client endpoint: replay with the same Idempotency-Key recovers; hand-off delivers once; a wrong key is refused", () => {
    const endpoint = createClientEndpoint({ clock: CLOCK });
    const body = buildWorkflowRequest({ platform: "make", period: periodNWebhookBody().period, workflowOutput: periodNWebhookBody().period.capture.payload, committed: true, clock: CLOCK });
    const first = endpoint.handle({ path: "/periods", body });
    assert.equal(first.status, 200);
    const key = first.body.period.idempotencyKey;
    assert.equal(key, nativePeriodN().period.idempotencyKey);
    const replay = endpoint.handle({ path: "/periods", headers: { "Idempotency-Key": key }, body });
    assert.equal(replay.body.period.retry.recovered, true);
    assert.equal(replay.body.period.retry.secondEffect, false);
    const wrong = endpoint.handle({ path: "/periods", headers: { "Idempotency-Key": `sha256:${"0".repeat(64)}` }, body });
    assert.equal(wrong.status, 409);
    const h1 = endpoint.handle({ path: "/periods/accepted", headers: { "idempotency-key": key }, body: {} });
    const h2 = endpoint.handle({ path: "/periods/accepted", headers: { "idempotency-key": key }, body: {} });
    assert.equal(h1.status, 201);
    assert.equal(h2.body.duplicate, true);
    assert.equal(endpoint.deliveredCount(key), 1);
    assert.equal(endpoint.effects.appliedCount(key), 1);
    const unknown = endpoint.handle({ path: "/periods/accepted", headers: { "idempotency-key": `sha256:${"1".repeat(64)}` }, body: {} });
    assert.equal(unknown.status, 409);
  });
});
