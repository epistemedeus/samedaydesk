import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compareAggregates } from "../src/compare.mjs";
import { CORPUS_BODY_BYTES, CORPUS_ROWS_PER_CLIENT } from "../src/plan.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const report = JSON.parse(readFileSync(`${root}/evidence/qualification.json`, "utf8"));
const intake = JSON.parse(readFileSync(`${root}/aggregate/sds254-owner-intake.json`, "utf8"));
const reportText = readFileSync(`${root}/evidence/qualification.json`, "utf8");
const intakeText = readFileSync(`${root}/aggregate/sds254-owner-intake.json`, "utf8");

function cell(axis, offered) {
  const found = report.cells.find((item) => item.axis === axis && item.offeredClients === offered);
  assert.ok(found, `${axis}:${offered}`);
  return found;
}

test("recorded qualification is a complete synthetic disposable run", () => {
  assert.equal(report.status, "complete");
  assert.equal(report.traffic, "synthetic");
  assert.equal(report.silentReduction, false);
  assert.equal(report.hostingerMeasured, false);
  assert.equal(report.failureReason, null);
  assert.equal(report.cells.length, 12);
  assert.deepEqual(report.workloadPlan.offeredClients, [1, 8, 32, 128]);
  assert.equal(report.cluster.settings.max_connections, "24");
  assert.equal(report.cluster.settings.fsync, "on");
  assert.equal(report.cluster.settings.synchronous_commit, "on");
  assert.equal(report.cluster.settings.listen_addresses, "127.0.0.1");
  assert.equal(report.cluster.roles.clientIsSuperuser, false);
  assert.equal(report.cluster.roles.ownerIsSuperuser, true);
  assert.equal(reportText.includes("postgres://"), false);
  assert.equal(intakeText.includes("postgres://"), false);
  assert.equal(reportText.includes("PASSWORD"), false);
});

test("seeded SQL rows were rejected and comparison refuses a shortened plan", () => {
  assert.deepEqual(report.seededRejections.map((row) => row.label).sort(), [
    "backlog-state-live",
    "empty-corpus-body",
    "negative-corpus-slot",
  ]);
  for (const row of report.seededRejections) {
    assert.equal(row.rejected, true, row.label);
    assert.equal(row.sqlstate, "23514", row.label);
  }
  const incomplete = JSON.parse(readFileSync(`${root}/fixtures/seeded-incomplete-aggregate.json`, "utf8"));
  assert.equal(compareAggregates(report, incomplete).status, "incomparable-workload-plan");
  assert.equal(compareAggregates(report, report).status, "comparable");
});

test("client counts 1 and 8 qualify and 32 and 128 stay limited by connections", () => {
  for (const offered of [1, 8]) {
    for (const axis of ["concurrency", "corpus", "backlog"]) {
      const item = cell(axis, offered);
      assert.equal(item.status, "qualified", item.id);
      assert.equal(item.acquiredClients, offered);
      assert.equal(item.actualUnits, item.offeredUnits);
      assert.equal(item.holderRows, item.acquiredClients);
      assert.equal(item.refusedClients, 0);
    }
  }
  const limitedAcquired = new Set();
  for (const offered of [32, 128]) {
    for (const axis of ["concurrency", "corpus", "backlog"]) {
      const item = cell(axis, offered);
      assert.equal(item.status, "limited", item.id);
      assert.ok(item.acquiredClients < offered, item.id);
      assert.ok(item.acquiredClients >= 8, item.id);
      assert.equal(item.errorCodes["53300"], item.refusedClients, item.id);
      assert.equal(item.limit, "max_connections", item.id);
      assert.equal(item.unknownClients, 0, item.id);
      assert.equal(item.leftover, 0, item.id);
      assert.equal(item.holderRows, item.acquiredClients, item.id);
      limitedAcquired.add(item.acquiredClients);
    }
    const concurrency = cell("concurrency", offered);
    assert.equal(concurrency.actualUnits, concurrency.acquiredClients);
    const corpus = cell("corpus", offered);
    assert.equal(corpus.actualUnits, corpus.acquiredClients * CORPUS_ROWS_PER_CLIENT);
    assert.equal(corpus.actualBytes, corpus.actualUnits * CORPUS_BODY_BYTES);
    const backlog = cell("backlog", offered);
    assert.equal(backlog.actualUnits, backlog.offeredUnits);
  }
  assert.equal(limitedAcquired.size, 1);
});

test("SDS254 intake keeps the same admissible counts and cites the owner pin", () => {
  assert.equal(intake.schema, "sds.vf17.host-qualification.sds254-intake.v1");
  assert.equal(intake.receivingOwner.pin, "39a1ed7ceff813e9f490bd399fcea30f3451a53b");
  assert.equal(intake.receivingOwner.branchEdits, false);
  assert.equal(intake.receivingOwner.intakeOnly, true);
  assert.equal(intake.neoReceiver, "1652533b1823ac33b86591ec4e931a8c4ea4aa97");
  assert.equal(intake.hostingerMeasured, false);
  assert.equal(intake.silentReduction, false);
  assert.deepEqual(intake.admissibleOfferedClients, [1, 8]);
  assert.deepEqual(intake.limitedOfferedClients, [32, 128]);
  assert.deepEqual(intake.failedOfferedClients, []);
  assert.equal(intake.limits.observedMaxConnections, 24);
  assert.equal(intake.limits.observedSuperuserReservedConnections, 3);
  assert.equal(intake.limits.predictedWhileOwnerHeld, 20);
  assert.equal(intake.limits.maxAcquiredOnConcurrencyAxis, intake.limits.predictedWhileOwnerHeld);
  assert.equal(intake.limits.cappedAcquiredMin, intake.limits.predictedWhileOwnerHeld);
  assert.equal(intake.limits.cappedAcquiredMax, intake.limits.predictedWhileOwnerHeld);
  assert.equal(intake.citedFoundryEnvelope.oneWebPlusWorker, 10);
  assert.equal(intake.citedFoundryEnvelope.twoWebAtBaseMaxPlusWorker, 22);
  assert.equal(intake.citedFoundryEnvelope.connectionEnvelope, 24);
  assert.equal(intake.byOfferedClients["1"].concurrency, "qualified");
  assert.equal(intake.byOfferedClients["128"].backlog, "limited");
  assert.equal(intake.recommendedNextOwner, "existing SDS254 receiving owner");
  for (const file of report.harnessFiles) {
    const digest = createHash("sha256").update(readFileSync(`${root}/${file.path}`)).digest("hex");
    assert.equal(digest, file.sha256, file.path);
  }
});
