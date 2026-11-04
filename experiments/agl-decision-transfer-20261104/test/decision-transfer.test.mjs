import test from "node:test";
import assert from "node:assert/strict";
import { runJourney } from "../harness.mjs";

test("a granted harbor decision is reused with the producer absent", { timeout: 180000 }, async () => {
  const report = await runJourney();

  assert.equal(report.live.profileStatus, 200);
  assert.equal(report.live.profileOk, true);
  assert.equal(report.live.acceptedWorkPresent, true);
  assert.equal(report.live.acceptedStatus, 200);
  assert.equal(report.live.acceptedOk, true);
  assert.equal(report.live.money, "unfunded");
  assert.equal(report.live.participation, "voluntary-artifact-v1");
  assert.equal(report.local.profileStatus, 200);
  assert.equal(report.local.acceptedWorkPresent, false);
  assert.equal(report.local.acceptedWorkStatus, 404);
  assert.equal(report.local.participation, "voluntary-artifact-v1");
  assert.equal(report.local.money, "unfunded");

  assert.equal(report.identityHorizon, 168);
  assert.equal(report.commandHorizon, "168");
  assert.equal(report.commandHasUndefined, false);
  assert.equal(report.packetBytes <= 4096, true);

  assert.equal(report.privateField.status, 1);
  assert.equal(report.privateField.ok, false);
  assert.equal(report.privateField.verdict, "rejected");
  assert.equal(report.privateField.reason, "private_field");
  assert.equal(report.privateField.decision, null);
  assert.equal(report.privateField.secretInEvidence, false);

  assert.equal(report.refusals.exportBeforeGrant, "forbidden");
  assert.equal(report.refusals.contributorGrant, "requester_required");
  assert.equal(report.refusals.strangerExport, "forbidden");
  assert.equal(report.refusals.strangerUse, "forbidden");

  assert.equal(report.grant.state, "accepted");
  assert.equal(report.grant.paidWork, false);
  assert.equal(report.grant.rights.license, "CC0-1.0");
  assert.equal(report.grant.rights.scope, "synthetic-or-authorized-reusable-artifact");
  assert.equal(report.export.state, "accepted");
  assert.equal(report.export.relationship, "authorized_later_consumer");
  assert.equal(report.export.paidWork, false);
  assert.equal(report.export.sameBusinessResult, true);
  assert.equal(report.export.sameCommand, true);

  assert.equal(report.reuse.status, 0, report.reuse.stderr);
  assert.equal(report.reuse.verdict, "reuse");
  assert.equal(report.reuse.producerInvoked, false);
  assert.equal(report.reuse.outcome, "unchanged");
  assert.equal(report.reuse.hidden, "0");
  assert.equal(report.reuse.producerExecuted, false);
  assert.equal(report.reuse.sawCli, true);

  assert.equal(report.changed.status, 0, report.changed.stderr);
  assert.equal(report.changed.verdict, "recompute");
  assert.equal(report.changed.reason, "digest_mismatch");
  assert.equal(report.changed.producerInvoked, false);
  assert.equal(report.changed.hidden, "0");
  assert.equal(report.changed.producerExecuted, false);

  assert.equal(report.use.useBefore, 0);
  assert.equal(report.use.lostStatus, 2);
  assert.equal(report.use.lostCode, "unknown_outcome");
  assert.equal(report.use.lostNext, "readback");
  assert.equal(report.use.dropConsumed, true);
  assert.equal(report.use.useAfterLost, 1);
  assert.equal(report.use.secondPostBlocked, true);
  assert.equal(report.use.secondCode, "operation_readback_required");
  assert.equal(report.use.recoveredOk, true);
  assert.equal(report.use.useAfterReadback, 1);
  assert.equal(report.use.useFinal, 1);
  assert.equal(report.use.idempotencyAfterLost, report.use.idempotencyBefore + 1);
  assert.equal(report.use.idempotencyAfterReadback, report.use.idempotencyAfterLost);
  assert.equal(report.use.verification, "authenticated_self_report");
  assert.equal(report.use.independence, "unknown");
  assert.equal(report.use.paidWork, false);
  assert.equal(report.use.decision.includes("SYNTHETIC-HARBOR-168"), true);

  assert.equal(report.withdrawal.state, "withdrawn");
  assert.equal(report.withdrawal.paidWork, false);
  assert.equal(report.withdrawal.exportCode, "voluntary_withdrawn");
  assert.equal(report.withdrawal.useCode, "voluntary_withdrawn");
  assert.equal(report.withdrawal.consumers, 0);

  assert.equal(report.fund.ok, false);
  assert.equal(report.fund.code, "qualified_selection_required");
  assert.equal(report.fund.paidWork, false);
  assert.equal(report.money.snapshotUnchanged, true);
  assert.equal(report.money.walletCalls, 0);
  assert.equal(report.money.quotesAfter, report.money.quotesBefore);
  assert.equal(report.money.fundingAfter, report.money.fundingBefore);
  assert.equal(report.money.capturesAfter, report.money.capturesBefore);
  assert.equal(report.money.walletsAfter, report.money.walletsBefore);
});
