import assert from "node:assert/strict";
import test from "node:test";
import { rank, isAvailablePaidJob } from "../src/rank.mjs";
import { selectOne } from "../src/select.mjs";
import { ingestAdapter, ingestDefault, TEST_NOW, FIX } from "./helpers.mjs";
import { ingestAll } from "../src/ingest.mjs";
import { adapters } from "../src/adapters/index.mjs";
import { join } from "node:path";

async function recordsFrom(name, file) {
  const r = await ingestAdapter(name, file);
  return r.records;
}

test("never ranks closed tasks as available paid jobs", async () => {
  const recs = await recordsFrom("frantic", "edge-closed.frantic.fixture.json");
  const annotated = rank(recs, {}, { now: TEST_NOW }).annotated;
  assert.ok(annotated.length >= 1);
  for (const r of annotated) {
    assert.equal(r.status.availablePaidJob, false);
    assert.ok(r.status.exclusionReasons.includes("closed") || r.status.exclusionReasons.some((x) => x.startsWith("lifecycle_")));
  }
  assert.equal(rank(recs, {}, { now: TEST_NOW }).ranked.length, 0);
});

test("never ranks unfunded advertised tasks as available paid jobs", async () => {
  const recs = await recordsFrom("frantic", "edge-unfunded.frantic.fixture.json");
  const result = rank(recs, { includeUnfunded: true }, { now: TEST_NOW });
  assert.equal(result.ranked.length, 0);
  assert.ok(result.annotated[0].status.exclusionReasons.includes("unfunded"));
});

test("never ranks stale observations as available paid jobs", async () => {
  const recs = await recordsFrom("frantic", "edge-stale.frantic.fixture.json");
  const result = rank(recs, { staleAfterSeconds: 604800 }, { now: TEST_NOW });
  assert.equal(result.ranked.length, 0);
  assert.ok(result.annotated[0].status.exclusionReasons.includes("stale_observation"));
});

test("never ranks expired deadline as available paid jobs", async () => {
  const recs = await recordsFrom("frantic", "edge-expired.frantic.fixture.json");
  const result = rank(recs, {}, { now: TEST_NOW });
  assert.equal(result.ranked.length, 0);
  assert.ok(result.annotated[0].status.exclusionReasons.includes("deadline_expired"));
});

test("zero-price goodwill is not a paid job", async () => {
  const recs = await recordsFrom("frantic", "edge-zero-goodwill.frantic.fixture.json");
  const result = rank(recs, {}, { now: TEST_NOW });
  assert.equal(result.ranked.length, 0);
  assert.ok(result.annotated[0].status.exclusionReasons.includes("reward_unknown_or_zero"));
});

test("lab schedule and github are not available paid jobs", async () => {
  const ingest = await ingestDefault();
  const result = rank(ingest.records, {}, { now: TEST_NOW });
  for (const r of result.annotated) {
    if (r.source.adapter === "github-issues" || r.source.labSchedule || r.source.inaccessible) {
      assert.equal(r.status.availablePaidJob, false);
    }
    if (r.source.classificationKind === "referral_campaign") {
      assert.equal(r.status.availablePaidJob, false);
      assert.ok(r.status.exclusionReasons.includes("forum_marketing_or_referral"));
    }
  }
});

test("forum rewards stay excluded even if includeForumRewards unless other gates pass", async () => {
  const recs = await recordsFrom("moltjobs", "moltjobs-list.open.fixture.json");
  const off = rank(recs, { includeForumRewards: false }, { now: TEST_NOW });
  assert.equal(off.ranked.length, 0);
  const on = rank(recs, { includeForumRewards: true }, { now: TEST_NOW });
  assert.ok(on.ranked.length >= 1);
  for (const s of on.ranked) {
    assert.equal(s.record.status.availablePaidJob, true);
    assert.notEqual(s.record.claimability.state, "claimable_with_prereqs");
  }
});

test("rank uses net return not popularity; frantic 129 beats 130 at default effort 0", async () => {
  const recs = await recordsFrom("frantic", "frantic-board.open.fixture.json");
  const result = rank(recs, { effortHours: "0" }, { now: TEST_NOW });
  const ids = result.ranked.map((s) => s.record.source.nativeId);
  assert.ok(ids.includes("129"));
  assert.ok(ids.includes("130"));
  assert.equal(ids[0], "129");
  assert.ok(Number(result.ranked[0].expectedUsefulNetReturn) > Number(result.ranked[1].expectedUsefulNetReturn));
  const why = result.ranked[0].why.join(" ");
  assert.ok(why.includes("does not use shareCount") || why.includes("not popularity"));
});

test("user-adjustable effort can flip expected useful net return negative", async () => {
  const recs = await recordsFrom("frantic", "frantic-board.open.fixture.json");
  const cheap = rank(recs, { effortHours: "0", hourlyCostAmount: "25" }, { now: TEST_NOW });
  const costly = rank(recs, { effortHours: "10", hourlyCostAmount: "25" }, { now: TEST_NOW });
  assert.ok(cmpPositive(cheap.ranked[0].expectedUsefulNetReturn));
  assert.ok(costly.ranked[0].expectedUsefulNetReturn.startsWith("-"));
});

test("C2-D1: negative nets still sort by expected useful net return desc", async () => {
  const recs = await recordsFrom("frantic", "frantic-board.open.fixture.json");
  const costly = rank(recs, { effortHours: "2", hourlyCostAmount: "25" }, { now: TEST_NOW });
  const ids = costly.ranked.map((s) => s.record.source.nativeId);
  assert.ok(ids.includes("129") && ids.includes("130"));
  assert.equal(ids[0], "129");
  assert.ok(costly.ranked[0].expectedUsefulNetReturn.startsWith("-"));
  assert.ok(costly.ranked[1].expectedUsefulNetReturn.startsWith("-"));
  const { cmpDecimal } = await import("../src/money.mjs");
  assert.equal(
    cmpDecimal(costly.ranked[0].expectedUsefulNetReturn, costly.ranked[1].expectedUsefulNetReturn),
    1,
  );
});

function cmpPositive(s) {
  return s && !s.startsWith("-") && s !== "0";
}

test("selectOne returns frantic claimable task with prerequisites and why", async () => {
  const ingest = await ingestDefault();
  const sel = selectOne(ingest.records, { effortHours: "0" }, { now: TEST_NOW });
  assert.equal(sel.match, true);
  assert.ok(sel.selected.prerequisites.length > 0);
  assert.ok(sel.selected.why.length > 0);
  assert.equal(sel.selected.adapter, "frantic");
  assert.equal(sel.selected.claimAuthority, "none");
});

test("selectOne truthful no-match when only github+lab+unfunded exist", async () => {
  const github = await recordsFrom("github-issues", "github-issues.open.fixture.json");
  const neo = await recordsFrom("neomorphic-schedule", "neomorphic-schedule.fixture.json");
  const unfunded = await recordsFrom("frantic", "edge-unfunded.frantic.fixture.json");
  const sel = selectOne([...github, ...neo, ...unfunded], {}, { now: TEST_NOW });
  assert.equal(sel.match, false);
  assert.equal(sel.reason, "no_genuinely_claimable_paid_job");
  assert.ok(sel.hint);
});

test("isAvailablePaidJob is false for moltjobs public task with unknown claim but funded open", async () => {
  const recs = await recordsFrom("moltjobs", "edge-moltjobs-open-task.fixture.json");
  const r = recs[0];
  assert.equal(r.source.classificationKind, "moltjobs_list_job");
  assert.equal(r.funding.status, "reserved");
  assert.equal(isAvailablePaidJob(r, { includeForumRewards: false, staleAfterSeconds: 604800 }, TEST_NOW), true);
  const sel = selectOne(recs, {}, { now: TEST_NOW });
  assert.equal(sel.match, false, "unknown claim path is not genuinely claimable");
});

test("extra fixture ingest via ingestAll extraFixturePaths", async () => {
  const ingest = await ingestAll({
    mode: "fixture",
    fixtureDir: FIX,
    now: TEST_NOW,
    extraFixturePaths: [{ adapter: "frantic", path: join(FIX, "edge-unfunded.frantic.fixture.json") }],
    adapters: [adapters.frantic],
  });
  assert.ok(ingest.records.some((r) => r.source.nativeId === "501"));
});
