import assert from "node:assert/strict";
import test from "node:test";
import { SEEDED_FAILURE_IDS } from "../src/paths.mjs";
import { listSeededFailures, runSeededFailure } from "../src/seeded.mjs";

test("seeded failure list is exhaustive and stable", () => {
  assert.deepEqual(listSeededFailures(), [...SEEDED_FAILURE_IDS]);
  assert.deepEqual(listSeededFailures(), [
    "future-as-ok",
    "stale-as-fresh-zero",
    "collapse-clocks",
    "payment-to-correct-clock",
    "market-obs-boundary-as-stale",
  ]);
});

test("seeded: future-skewed clock claimed ok is refused", () => {
  const result = runSeededFailure("future-as-ok");
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.rejected, true);
  assert.equal(result.code, "future_skew_not_ok");
  assert.equal(result.engineState, "invalid");
  assert.equal(result.naiveState, "ok");
  assert.equal(result.paymentSent, false);
});

test("seeded: stale clock rewritten as fresh zero is refused", () => {
  const result = runSeededFailure("stale-as-fresh-zero");
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.code, "stale_not_rewritten_as_fresh_zero");
  assert.equal(result.jobCount, 12);
  assert.equal(result.sellers_30d, 47303);
  assert.equal(result.moltjobsAvailability, "stale");
});

test("seeded: collapsing provider clock onto fetchedAt is refused", () => {
  const result = runSeededFailure("collapse-clocks");
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.code, "clocks_must_stay_distinct");
  assert.notEqual(result.providerTimestamp, result.fetchedAt);
});

test("seeded: payment/checkout to correct a clock is refused", () => {
  const result = runSeededFailure("payment-to-correct-clock");
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.code, "payment_forbidden");
  assert.equal(result.paymentSent, false);
  assert.equal(result.checkout, false);
});

test("seeded: exact 1h market-obs clock claimed stale is refused", () => {
  const result = runSeededFailure("market-obs-boundary-as-stale");
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.rejected, true);
  assert.equal(result.code, "market_obs_boundary_not_stale");
  assert.equal(result.engineMarketObsState, "ok");
  assert.equal(result.naiveMarketObsState, "stale");
  assert.equal(result.paymentSent, false);
});

test("unknown seeded failure id is itself a failure", () => {
  const result = runSeededFailure("open-stripe-checkout");
  assert.equal(result.ok, false);
  assert.equal(result.rejected, false);
  assert.equal(result.code, "unknown_seeded_failure");
});
