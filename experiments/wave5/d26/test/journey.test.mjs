import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROPOSED_PRICE_USDC, TESTED_SDS_SHA } from "../lib/pins.mjs";
import { parseOut, runCli } from "./helpers.mjs";

describe("W5-D26 journey against current F08 CLI", { timeout: 180_000 }, () => {
  it("measured variable cost plus CDP usage-based fees support one non-lossmaking proposed offer", () => {
    const spawned = runCli(["journey", "--buyer-class", "owner-qa"]);
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const body = parseOut(spawned);
    assert.equal(body.ok, true);
    assert.equal(body.certified, true);
    assert.equal(body.nonLossmaking, true);
    assert.equal(body.sold, false);
    assert.equal(body.publishedToLiveCatalog, false);
    assert.equal(body.liveSettleAttempted, false);
    assert.equal(body.purchaseAuthority, false);
    assert.equal(body.independentDemand, false);
    assert.equal(body.buyerClass, "owner-qa");
    assert.equal(body.offer.jobId, "vendor-budget-impact");
    assert.equal(body.offer.proposedPriceUsdc, "0.003000");
    assert.equal(body.offer.proposedPriceAtomic, "3000");
    assert.equal(body.offer.railId, "x402-exact-base-usdc");
    assert.equal(body.offer.network, "eip155:8453");
    assert.equal(body.offer.publishedToLiveCatalog, false);
    assert.equal(body.offer.distinctFromLiveExtract, true);
    assert.equal(body.offer.liveExtractPriceUsdc, "0.005");
    assert.equal(body.offer.liveSellerIntegrityAuditPriceUsdc, "0.01");
    assert.equal(body.primary.floor.paymentFeeUsdc, "0.001000");
    assert.equal(body.primary.floor.feeTier, "usage-based");
    assert.equal(body.primary.floor.billedComputeSeconds, 60);
    assert.match(body.primary.floor.variableComputeUsdc, /^0\.000834$/);
    assert.equal(body.primary.floor.floorUsdc, "0.001834");
    assert.equal(body.primary.floor.nonLossmaking, true);
    assert.ok(body.primary.durationMs > 0);
    assert.ok(body.primary.outputBytes > 0);
    assert.match(body.primary.inputsDigest, /^[0-9a-f]{64}$/);
    assert.match(body.primary.outputsDigest, /^[0-9a-f]{64}$/);
    assert.equal(body.confirm.jobId, "feed-agenda");
    assert.ok(body.confirm.durationMs > 0);
    assert.equal(body.confirm.floor.paymentFeeUsdc, "0.001000");
    assert.equal(body.testedImplementation.sha, TESTED_SDS_SHA);
    assert.match(body.remainingBindings["W5-D01"], /F08/);
    assert.match(body.remainingBindings["W5-D25"], /not on this branch/);
    assert.equal(PROPOSED_PRICE_USDC, "0.003");
  });

  it("Stripe card counterfactual on 0.003 USDC is loss-making", () => {
    const spawned = runCli([
      "floor",
      "--rail",
      "stripe-card-us-standard",
      "--proposed",
      "0.003",
      "--duration-ms",
      "1000",
    ]);
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const body = parseOut(spawned);
    assert.equal(body.ok, true);
    assert.equal(body.certified, false);
    assert.equal(body.counterfactual, true);
    assert.equal(body.paymentFeeUsdc, "0.300087");
    assert.equal(body.floorUsdc, "0.300921");
    assert.equal(body.nonLossmaking, false);
    assert.equal(body.coversFloor, false);
  });

  it("x402 usage-based floor on 0.003 USDC covers after the 60s compute minimum", () => {
    const spawned = runCli([
      "floor",
      "--rail",
      "x402-exact-base-usdc",
      "--proposed",
      "0.003",
      "--duration-ms",
      "1000",
    ]);
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const body = parseOut(spawned);
    assert.equal(body.ok, true);
    assert.equal(body.certified, true);
    assert.equal(body.paymentFeeUsdc, "0.001000");
    assert.equal(body.variableComputeUsdc, "0.000834");
    assert.equal(body.floorUsdc, "0.001834");
    assert.equal(body.nonLossmaking, true);
  });
});
