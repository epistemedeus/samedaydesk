import assert from "node:assert/strict";
import test from "node:test";
import { listAdapters } from "../src/adapters/index.mjs";
import { ingestAdapter, ingestDefault, TEST_NOW } from "./helpers.mjs";
import { atomicDecimalString } from "../src/money.mjs";

test("lists four primary keyless adapters plus inaccessible moltbook", () => {
  const names = listAdapters().map((a) => a.name);
  assert.deepEqual(names, [
    "moltjobs",
    "frantic",
    "github-issues",
    "neomorphic-schedule",
    "moltbook",
  ]);
  const moltbook = listAdapters().find((a) => a.name === "moltbook");
  assert.equal(moltbook.inaccessible, true);
  const neo = listAdapters().find((a) => a.name === "neomorphic-schedule");
  assert.equal(neo.labSchedule, true);
});

test("moltjobs fixture maps vendor forum-list shape and keeps referral kind", async () => {
  const r = await ingestAdapter("moltjobs", "moltjobs-list.open.fixture.json");
  assert.equal(r.error, null);
  assert.ok(r.records.length >= 1);
  const rec = r.records[0];
  assert.equal(rec.dataLabel, "fixture");
  assert.equal(rec.source.vendorAdapter, "moltjobs_forum_list");
  assert.equal(rec.source.classificationKind, "referral_campaign");
  assert.equal(rec.reward.amount, "0.2");
  assert.equal(rec.reward.asset, "USDC");
  assert.equal(rec.reward.network, "base");
  assert.equal(rec.funding.status, "reserved");
  assert.equal(rec.funding.verified, false);
  assert.equal(rec.claimability.claimAuthority, "none");
  assert.equal(rec.claimability.firstDollar, "unknown");
  assert.equal(rec.claimability.walletlessEligibility, "unknown");
  assert.ok(rec.unknowns.includes("claimability.firstDollar"));
  assert.equal(typeof rec.taskId, "string");
  assert.match(rec.taskId, /^bty_/);
  assert.equal(typeof rec.termsVersion, "string");
  assert.equal(rec.deadline.unknown, true);
});

test("frantic fixture reuses board shape; marketing counts are not tasks", async () => {
  const r = await ingestAdapter("frantic", "frantic-board.open.fixture.json");
  assert.equal(r.listingMeta.kind, "board_marketing_counts");
  assert.equal(r.listingMeta.notTasks, true);
  assert.ok("operators_enlisted" in (r.listingMeta.counts || {}));
  const open = r.records.filter((x) => x.status.lifecycle === "open");
  assert.ok(open.length >= 2);
  const one = open.find((x) => x.source.nativeId === "130");
  assert.ok(one);
  assert.equal(one.reward.amount, "3");
  assert.equal(one.reward.asset, "USD");
  assert.equal(one.funding.status, "reserved");
  assert.equal(one.claimability.state, "claimable_with_prereqs");
  assert.equal(one.claimability.identityRequired, true);
  assert.equal(one.claimability.firstDollar, "unknown");
  assert.ok(one.claimability.prerequisites.length > 0);
  assert.equal(one.source.vendorAdapter, "frantic_board");
});

test("github issues have unknown funding even when body mentions money", async () => {
  const r = await ingestAdapter("github-issues", "edge-github-bounty-prose.fixture.json");
  assert.equal(r.records.length, 1);
  const rec = r.records[0];
  assert.equal(rec.reward.unknown, true);
  assert.equal(rec.reward.amount, null);
  assert.equal(rec.funding.status, "unknown");
  assert.equal(rec.claimability.state, "not_claimable");
  assert.ok(rec.description.includes("$500"));
  assert.equal(atomicDecimalString(rec.reward.amount), null);
});

test("neomorphic schedule is labelled lab, not a paid agent job", async () => {
  const r = await ingestAdapter("neomorphic-schedule", "neomorphic-schedule.fixture.json");
  assert.equal(r.listingMeta.labSchedule, true);
  assert.equal(r.listingMeta.notPaidAgentJobs, true);
  for (const rec of r.records) {
    assert.equal(rec.source.labSchedule, true);
    assert.equal(rec.reward.provenance, "lab_consideration_not_cash");
    assert.equal(rec.claimability.state, "not_claimable");
    assert.ok(rec.verificationPaymentTerms.verbatim.includes("not a job offer") || rec.description);
  }
});

test("moltbook is inaccessible and invents no listings", async () => {
  const r = await ingestAdapter("moltbook", "moltbook-inaccessible.fixture.json");
  assert.equal(r.listingMeta.inaccessible, true);
  assert.equal(r.listingMeta.listingsInvented, false);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].source.inaccessible, true);
  assert.match(String(r.records[0].source.inaccessibleReason), /NXDOMAIN/i);
});

test("default fixture ingest stamps dataLabel and observedAt", async () => {
  const ingest = await ingestDefault();
  assert.ok(ingest.records.length > 5);
  for (const rec of ingest.records) {
    assert.ok(["fixture", "synthetic-edge", "derived"].includes(rec.dataLabel) || rec.dataLabel === "fixture");
    assert.ok(rec.observedAt);
    assert.equal(rec.schema, "s277.bounty-intelligence.record.v1");
  }
  void TEST_NOW;
});
