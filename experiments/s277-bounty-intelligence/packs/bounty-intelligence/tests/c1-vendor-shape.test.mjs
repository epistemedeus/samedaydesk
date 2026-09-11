import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import * as pack from "../src/index.mjs";
import {
  adapters,
  ALL_ADAPTERS,
  listAdapters,
} from "../src/adapters/index.mjs";

const PINNED_NOW = "2026-09-11T15:00:00.000Z";
const LABELLED = join(pack.PACK_ROOT, "fixtures/labelled");

function labelledPath(file) {
  return join(LABELLED, file);
}

async function fetchFixture(name, file, extra = {}) {
  const adapter = adapters[name];
  assert.ok(adapter, `missing adapter ${name}`);
  return adapter.fetchList({
    mode: "fixture",
    fixturePath: labelledPath(file),
    now: pack.TEST_NOW,
    limit: 20,
    ...extra,
  });
}

function objectKeys(value, acc = new Set()) {
  if (!value || typeof value !== "object") return acc;
  if (Array.isArray(value)) {
    for (const item of value) objectKeys(item, acc);
    return acc;
  }
  for (const [key, child] of Object.entries(value)) {
    acc.add(key);
    objectKeys(child, acc);
  }
  return acc;
}

test("pack TEST_NOW is pinned for vendor-shape audit", () => {
  assert.equal(pack.TEST_NOW, PINNED_NOW);
});

test("adapter modules export vendor intake names", () => {
  const listed = listAdapters();
  const fromPack = pack.listAdapters();
  assert.deepEqual(
    listed.map((a) => a.name),
    fromPack.map((a) => a.name),
  );
  const byName = Object.fromEntries(listed.map((a) => [a.name, a]));
  assert.equal(byName.moltjobs.vendorAdapter, "moltjobs_forum_list");
  assert.equal(byName.frantic.vendorAdapter, "frantic_board");
  assert.equal(byName["github-issues"].vendorAdapter, "github_issue_comment");
  assert.equal(byName["neomorphic-schedule"].labSchedule, true);
  assert.equal(byName.moltbook.inaccessible, true);
  assert.equal(adapters.moltjobs.vendorAdapter, "moltjobs_forum_list");
  assert.equal(adapters.frantic.vendorAdapter, "frantic_board");
  assert.equal(adapters["github-issues"].vendorAdapter, "github_issue_comment");
  assert.equal(pack.adapters.moltjobs.vendorAdapter, "moltjobs_forum_list");
  assert.ok(ALL_ADAPTERS.some((a) => a.name === "moltbook"));
});

test("moltjobs list records use moltjobs_forum_list; referral_campaign is not claimable_with_prereqs", async () => {
  const r = await fetchFixture("moltjobs", "moltjobs-list.open.fixture.json");
  assert.equal(r.error, null);
  assert.ok(r.records.length >= 1);
  assert.equal(r.listingMeta.claimAuthority, "none");
  const referrals = r.records.filter((rec) => rec.source.classificationKind === "referral_campaign");
  assert.ok(referrals.length >= 1, "fixture must include referral_campaign rows");
  for (const rec of r.records) {
    assert.equal(rec.source.vendorAdapter, "moltjobs_forum_list");
    assert.equal(rec.claimability.claimAuthority, "none");
    if (rec.source.classificationKind === "referral_campaign") {
      assert.notEqual(rec.claimability.state, "claimable_with_prereqs");
      assert.equal(pack.isAvailablePaidJob(rec, { includeForumRewards: false }, pack.TEST_NOW), false);
    }
  }
  const rankedOn = pack.rank(r.records, { includeForumRewards: true, effortHours: "0" }, { now: pack.TEST_NOW });
  for (const scored of [...rankedOn.ranked, ...rankedOn.excluded]) {
    if (scored.record.source.classificationKind === "referral_campaign") {
      assert.notEqual(scored.record.claimability.state, "claimable_with_prereqs");
      assert.equal(scored.record.claimability.claimAuthority, "none");
    }
  }
});

test("frantic board uses frantic_board; marketing counts are not tasks or rank input", async () => {
  const r = await fetchFixture("frantic", "frantic-board.open.fixture.json");
  assert.equal(r.error, null);
  assert.equal(r.listingMeta.notTasks, true);
  assert.equal(r.listingMeta.kind, "board_marketing_counts");
  assert.equal(r.listingMeta.claimAuthority, "none");
  assert.ok("operators_enlisted" in (r.listingMeta.counts || {}));
  assert.ok(r.records.length >= 1);
  for (const rec of r.records) {
    assert.equal(rec.source.vendorAdapter, "frantic_board");
    assert.equal(rec.claimability.claimAuthority, "none");
    const keys = objectKeys(rec);
    assert.equal(keys.has("operators_enlisted"), false, "operators_enlisted must not appear on a record as demand/rank input");
  }
  const ranked = pack.rank(r.records, { effortHours: "0" }, { now: pack.TEST_NOW });
  assert.ok(ranked.ranked.length >= 1);
  for (const scored of ranked.ranked) {
    const whyText = Array.isArray(scored.why) ? scored.why.join(" ") : String(scored.why);
    assert.match(whyText, /not use/i);
    assert.match(whyText, /marketing totals/i);
    assert.doesNotMatch(whyText, /\boperators_enlisted\b/);
    const keys = objectKeys(scored.record);
    assert.equal(keys.has("operators_enlisted"), false);
  }
});

test("github records have unknown price/funding and vendorAdapter github_issue_comment", async () => {
  const open = await fetchFixture("github-issues", "github-issues.open.fixture.json");
  const prose = await fetchFixture("github-issues", "edge-github-bounty-prose.fixture.json");
  assert.equal(open.error, null);
  assert.equal(prose.error, null);
  assert.ok(open.records.length >= 1);
  assert.ok(prose.records.length >= 1);
  const records = [...open.records, ...prose.records];
  for (const rec of records) {
    assert.equal(rec.source.vendorAdapter, "github_issue_comment");
    assert.equal(rec.reward.unknown, true);
    assert.equal(rec.reward.amount, null);
    assert.equal(rec.funding.status, "unknown");
    assert.equal(rec.funding.verified, false);
    assert.equal(rec.claimability.claimAuthority, "none");
    assert.equal(pack.isAvailablePaidJob(rec, {}, pack.TEST_NOW), false);
  }
  const proseRec = prose.records[0];
  assert.ok(proseRec.description.includes("$500"));
  assert.equal(proseRec.reward.unknown, true);
  assert.equal(proseRec.reward.amount, null);
});

test("neomorphic-schedule is labSchedule, not paid jobs", async () => {
  const r = await fetchFixture("neomorphic-schedule", "neomorphic-schedule.fixture.json");
  assert.equal(r.error, null);
  assert.equal(r.listingMeta.labSchedule, true);
  assert.equal(r.listingMeta.notPaidAgentJobs, true);
  assert.ok(r.records.length >= 1);
  for (const rec of r.records) {
    assert.equal(rec.source.labSchedule, true);
    assert.equal(rec.source.classificationKind, "lab_schedule");
    assert.equal(rec.claimability.state, "not_claimable");
    assert.equal(rec.claimability.claimAuthority, "none");
    assert.equal(rec.reward.provenance, "lab_consideration_not_cash");
    assert.equal(pack.isAvailablePaidJob(rec, { includeLabSchedule: true }, pack.TEST_NOW), false);
  }
  const ranked = pack.rank(r.records, { includeLabSchedule: true, effortHours: "0" }, { now: pack.TEST_NOW });
  assert.equal(ranked.ranked.length, 0);
});

test("moltbook is inaccessible and listingsInvented is false", async () => {
  const r = await fetchFixture("moltbook", "moltbook-inaccessible.fixture.json");
  assert.equal(r.listingMeta.inaccessible, true);
  assert.equal(r.listingMeta.listingsInvented, false);
  assert.equal(r.listingMeta.claimAuthority, "none");
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].source.inaccessible, true);
  assert.match(String(r.records[0].source.inaccessibleReason), /NXDOMAIN/i);
  assert.match(String(r.records[0].description), /No listings invented/i);
  assert.equal(pack.isAvailablePaidJob(r.records[0], {}, pack.TEST_NOW), false);
  assert.equal(pack.rank(r.records, {}, { now: pack.TEST_NOW }).ranked.length, 0);
});
