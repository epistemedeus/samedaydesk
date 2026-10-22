import assert from "node:assert/strict";
import test from "node:test";
import { listSeededFailures, runSeededFailure } from "../src/seeded.mjs";

test("seeded failure list is exhaustive and stable", () => {
  assert.deepEqual(listSeededFailures(), [
    "replay-as-fresh-apply",
    "conflict-as-ok",
    "consumed-nonce-reissued",
    "payment-to-mint-nonce",
  ]);
});

test("seeded: identical nonce replay claimed as a fresh apply is refused", async () => {
  const result = await runSeededFailure("replay-as-fresh-apply");
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.rejected, true);
  assert.equal(result.code, "identical_replay_not_fresh_apply");
  assert.deepEqual(result.acks, ["applied", "already_applied"]);
  assert.equal(result.snapshotTotal, 2);
  assert.equal(result.naiveSnapshotTotal, 4);
  assert.equal(result.paymentSent, false);
});

test("seeded: conflicting nonce claimed ok is refused", async () => {
  const result = await runSeededFailure("conflict-as-ok");
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.code, "conflicting_nonce_not_ok");
  assert.equal(result.secondError, "pulse_flush_id_conflict");
  assert.equal(result.snapshotTotal, 2);
});

test("seeded: consumed nonce reissued with a new delta is refused", async () => {
  const result = await runSeededFailure("consumed-nonce-reissued");
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.code, "consumed_nonce_not_reissued");
  assert.equal(result.secondError, "pulse_flush_id_conflict");
  assert.equal(result.snapshotTotal, 2);
});

test("seeded: payment/checkout to mint a nonce is refused", async () => {
  const result = await runSeededFailure("payment-to-mint-nonce");
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.code, "payment_forbidden");
  assert.equal(result.paymentSent, false);
  assert.equal(result.checkout, false);
});

test("unknown seeded failure id is itself a failure", async () => {
  const result = await runSeededFailure("open-stripe-checkout");
  assert.equal(result.ok, false);
  assert.equal(result.rejected, false);
  assert.equal(result.code, "unknown_seeded_failure");
});
