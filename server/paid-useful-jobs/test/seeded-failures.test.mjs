import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runPaidOffer } from "../lib/wrapper.mjs";
import { createLocalNonSettlingResourceServer, attachContinuity } from "../lib/envelope.mjs";
import { wouldSettleIfGuardOmitted } from "../lib/funding.mjs";
import { MAX_INPUT_BYTES } from "../lib/pins.mjs";
import { callerBudget, loadReservedPayment } from "./helpers.mjs";

describe("seeded fail-closed cases", { timeout: 60_000 }, () => {
  it("(a) SAMPLE/--example treated as a live sale is rejected", async () => {
    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      example: true,
      fundingIntent: "live-sale",
      settle: true,
      payment: loadReservedPayment(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.fundingState, "rejected");
    assert.equal(result.sold, false);
    assert.equal(result.code, "sample-not-a-sale");
    assert.equal(result.liveSettleAttempted, false);
    assert.equal(result.sample, true);
  });

  it("(b) missing required input is rejected", async () => {
    const result = await runPaidOffer({
      jobId: "api-upgrade-brief",
      inputs: { before: callerBudget().before },
      fundingIntent: "reserved-fixture",
      payment: loadReservedPayment(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "missing-required-inputs");
    assert.equal(result.fundingState, "rejected");
    assert.equal(result.sold, false);
    assert.match(result.error, /require/i);
  });

  it("(c) fixture payload that would settle if the guard were omitted is refused live settle", async () => {
    const payment = loadReservedPayment();
    const omitted = structuredClone(payment);
    delete omitted.fixture;
    delete omitted.label;
    delete omitted.live;
    delete omitted.purchaseAuthority;
    omitted.accepted = { ...omitted.accepted, payTo: "0x8904dF3DE6DFEe6a7C8cc38619d2f17806213Cee" };

    assert.equal(wouldSettleIfGuardOmitted(omitted, omitted.accepted), true);

    const omittedResult = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
      payment: omitted,
    });
    assert.equal(omittedResult.ok, false);
    assert.equal(omittedResult.sold, false);
    assert.equal(omittedResult.fundingState, "rejected");
    assert.equal(omittedResult.code, "fixture-cannot-live-settle");
    assert.equal(omittedResult.liveSettleAllowed, false);

    const settleAttempt = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: callerBudget(),
      fundingIntent: "reserved-fixture",
      payment,
      settle: true,
    });
    assert.equal(settleAttempt.ok, false);
    assert.equal(settleAttempt.code, "live-settle-out-of-scope");
    assert.equal(settleAttempt.sold, false);

    const server = attachContinuity(createLocalNonSettlingResourceServer(), {
      jobId: "vendor-budget-impact",
    });
    await assert.rejects(() => server.settlePayment({ paymentPayload: omitted }), (err) => {
      assert.equal(err.code, "live-settle-out-of-scope");
      return true;
    });
  });

  it("oversize input is rejected", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-oversize-"));
    const big = join(work, "before.json");
    writeFileSync(big, `${"x".repeat(MAX_INPUT_BYTES + 1)}`);
    const result = await runPaidOffer({
      jobId: "vendor-budget-impact",
      inputs: { before: big, after: callerBudget().after },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "input-oversize");
    assert.equal(result.fundingState, "rejected");
  });

  it("malformed JSON input is rejected", async () => {
    const work = mkdtempSync(join(tmpdir(), "puj-badjson-"));
    const bad = join(work, "input.json");
    writeFileSync(bad, "{ this is not json");
    const result = await runPaidOffer({
      jobId: "evidence-ci-annotation",
      inputs: { input: bad },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "input-malformed");
    assert.equal(result.fundingState, "rejected");
  });
});
