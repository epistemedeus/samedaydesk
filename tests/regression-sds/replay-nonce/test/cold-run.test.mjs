import assert from "node:assert/strict";
import test from "node:test";
import { runColdCohort } from "../src/cohort.mjs";
import { sqlNonceContract } from "../src/engine.mjs";

test("cold cohort: published engines apply, replay, and reject flush-id nonces", async () => {
  const report = await runColdCohort();
  assert.equal(report.schema, "sds.regression.replay-nonce.v1");
  assert.equal(report.mode, "cold");
  assert.equal(report.ok, true, JSON.stringify(report.cases.filter((item) => !item.ok), null, 2));
  assert.equal(report.caseCount, 13);
  assert.equal(report.failedCount, 0);
  assert.equal(report.invariants.firstApply, true);
  assert.equal(report.invariants.identicalReplayNotDoubleCounted, true);
  assert.equal(report.invariants.conflictingReplayRejected, true);
  assert.equal(report.invariants.freshNonceApplies, true);
  assert.equal(report.invariants.invalidNonceRejected, true);
  assert.equal(report.invariants.sqlUuidNonce, true);
  assert.equal(report.invariants.payment, false);
  assert.equal(report.invariants.checkout, false);
  assert.equal(report.invariants.publish, false);

  const byId = Object.fromEntries(report.cases.map((item) => [item.id, item]));
  assert.deepEqual(byId["first-apply"].acks, ["applied"]);
  assert.equal(byId["first-apply"].snapshotTotal, 2);
  assert.deepEqual(byId["identical-replay"].acks, ["applied", "already_applied"]);
  assert.equal(byId["identical-replay"].snapshotTotal, 2);
  assert.equal(byId["conflicting-replay"].stepErrors[1], "pulse_flush_id_conflict");
  assert.equal(byId["conflicting-replay"].snapshotTotal, 2);
  assert.equal(byId["fresh-nonce-applies"].snapshotTotal, 5);
  assert.equal(byId["invalid-flush-id"].error, "pulse_wal_invalid:flush_id");
  assert.equal(byId["missing-flush-id"].error, "pulse_wal_invalid:flush_entry");
  assert.equal(byId["empty-nonce"].error, "pulse_wal_invalid:flush_id");
  assert.equal(byId["wal-duplicate-same"].pendingCount, 1);
  assert.equal(byId["wal-duplicate-conflict"].error, "pulse_wal_flush_id_conflict");
  assert.deepEqual(byId["wal-enqueue-duplicate-same"].outcomes, ["queued", "duplicate_same"]);
  assert.deepEqual(byId["wal-enqueue-conflict"].outcomes, ["queued", "corrupt"]);
  assert.equal(byId["wal-enqueue-conflict"].corrupt, true);
  assert.equal(
    byId["last-successful-flush-bound"].lastSuccessfulFlushId,
    "a0000000-0000-4000-8000-000000000099",
  );

  const contract = sqlNonceContract();
  assert.equal(contract.uuidArg, true);
  assert.equal(contract.alreadyApplied, true);
  assert.equal(contract.conflict, true);
});
