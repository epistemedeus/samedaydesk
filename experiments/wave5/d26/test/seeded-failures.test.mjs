import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ERROR_CODES } from "../lib/pins.mjs";
import { parseOut, runCli } from "./helpers.mjs";
import { runExperiment } from "../lib/experiment.mjs";
import { measureJob } from "../lib/measure.mjs";
import { refuseForcedUnitEquality, usdcAtomic, usdCents } from "../lib/money.mjs";
import { ExperimentRefuse } from "../lib/refuse.mjs";

describe("seeded refusals", { timeout: 180_000 }, () => {
  it("SAMPLE/--example is not a paid-offer cost basis", () => {
    const spawned = runCli(["journey", "--buyer-class", "owner-qa", "--example"]);
    assert.equal(spawned.status, 2, spawned.stderr + spawned.stdout);
    const body = parseOut(spawned);
    assert.equal(body.ok, false);
    assert.equal(body.certified, false);
    assert.equal(body.sold, false);
    assert.equal(body.code, ERROR_CODES.SAMPLE_IS_NOT_COST_BASIS);
  });

  it("cited banked 8.105 USDC is not cost cover", () => {
    const spawned = runCli([
      "journey",
      "--buyer-class",
      "owner-qa",
      "--cited-banked-as-cost-cover",
    ]);
    assert.equal(spawned.status, 2);
    const body = parseOut(spawned);
    assert.equal(body.code, ERROR_CODES.CITED_BANKED_IS_NOT_COST_COVER);
    assert.equal(body.certified, false);
  });

  it("early-x402-revenue is not this job's revenue", () => {
    const spawned = runCli([
      "journey",
      "--buyer-class",
      "owner-qa",
      "--include-operation",
      "early-x402-revenue",
    ]);
    assert.equal(spawned.status, 2);
    const body = parseOut(spawned);
    assert.equal(body.code, ERROR_CODES.SETTLEMENT_IS_NOT_JOB_REVENUE);
  });

  it("live settle stays out of scope", () => {
    const spawned = runCli(["journey", "--buyer-class", "owner-qa", "--settle"]);
    assert.equal(spawned.status, 2);
    const body = parseOut(spawned);
    assert.equal(body.code, ERROR_CODES.LIVE_SETTLE_OUT_OF_SCOPE);
    assert.equal(body.liveSettleAttempted, false);
  });

  it("refuses forcing USDC atomic equal to Stripe cents", () => {
    const spawned = runCli([
      "journey",
      "--buyer-class",
      "owner-qa",
      "--force-unlike-units-equal",
    ]);
    assert.equal(spawned.status, 2);
    const body = parseOut(spawned);
    assert.equal(body.code, ERROR_CODES.UNLIKE_UNITS_FORCED_EQUAL);
    assert.throws(
      () => refuseForcedUnitEquality(usdcAtomic("0.003"), usdCents("0.30")),
      (err) => err instanceof ExperimentRefuse && err.code === ERROR_CODES.UNLIKE_UNITS_FORCED_EQUAL,
    );
  });

  it("Stripe card fees cannot certify an x402 Exact offer", () => {
    const spawned = runCli([
      "journey",
      "--buyer-class",
      "owner-qa",
      "--rail",
      "stripe-card-us-standard",
      "--certify-as-x402",
    ]);
    assert.equal(spawned.status, 2, spawned.stderr + spawned.stdout);
    const body = parseOut(spawned);
    assert.equal(body.code, ERROR_CODES.UNLIKE_RAIL_CERTIFICATION);
    assert.equal(body.certified, false);
  });

  it("fixture-buyer cannot be labelled independent demand", () => {
    const spawned = runCli([
      "journey",
      "--buyer-class",
      "fixture-buyer",
      "--independent-demand",
    ]);
    assert.equal(spawned.status, 2);
    const body = parseOut(spawned);
    assert.equal(body.code, ERROR_CODES.FIXTURE_BUYER_IS_NOT_INDEPENDENT);
  });

  it("CDP free tier is not durable unit cost", () => {
    const spawned = runCli([
      "floor",
      "--rail",
      "x402-exact-base-usdc",
      "--proposed",
      "0.003",
      "--fee-tier",
      "free",
    ]);
    assert.equal(spawned.status, 2);
    const body = parseOut(spawned);
    assert.equal(body.code, ERROR_CODES.FREE_TIER_IS_NOT_UNIT_COST);
  });

  it("live extract rewrite is refused", () => {
    const spawned = runCli([
      "journey",
      "--buyer-class",
      "owner-qa",
      "--rewrite-live-extract",
    ]);
    assert.equal(spawned.status, 2);
    const body = parseOut(spawned);
    assert.equal(body.code, ERROR_CODES.LIVE_PRICE_REWRITE_REFUSED);
  });

  it("missing buyerClass is refused before any job runs", () => {
    const body = runExperiment({});
    assert.equal(body.ok, false);
    assert.equal(body.code, ERROR_CODES.MISSING_BUYER_CLASS);
  });

  it("unknown job is a structured refusal, not an uncaught throw", () => {
    const body = measureJob({ jobId: "not-a-real-job" });
    assert.equal(body.ok, false);
    assert.equal(body.code, ERROR_CODES.UNKNOWN_JOB);
    assert.equal(body.measurement.exitStatus, 2);
    assert.equal(body.measurement.signal, null);
  });

  it("F08 reserved-fixture without payment is a valid refusal, not a wrapper crash", () => {
    const body = measureJob({
      jobId: "vendor-budget-impact",
      funding: "reserved-fixture",
    });
    assert.equal(body.ok, false);
    assert.equal(body.code, ERROR_CODES.ENGINE_REFUSAL_IS_NOT_COST_BASIS);
    assert.equal(body.measurement.classification, "valid-analysis-refusal");
    assert.equal(body.detail.wrapperCode, "reserved-fixture-requires-payment");
    assert.notEqual(body.code, ERROR_CODES.WRAPPER_FAILURE_IS_NOT_COST_BASIS);
  });

  it("proposed 0.001 USDC is below the usage-based floor", () => {
    const spawned = runCli([
      "floor",
      "--rail",
      "x402-exact-base-usdc",
      "--proposed",
      "0.001",
      "--duration-ms",
      "1000",
    ]);
    assert.equal(spawned.status, 0, spawned.stderr + spawned.stdout);
    const body = parseOut(spawned);
    assert.equal(body.ok, true);
    assert.equal(body.floorUsdc, "0.001834");
    assert.equal(body.proposedPriceUsdc, "0.001000");
    assert.equal(body.nonLossmaking, false);
    assert.equal(body.certified, false);
  });
});
