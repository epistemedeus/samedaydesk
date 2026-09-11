import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cmpDecimal } from "../src/money.mjs";
import { rank } from "../src/rank.mjs";
import { selectOne } from "../src/select.mjs";
import { FIX, ingestAdapter, TEST_NOW } from "./helpers.mjs";

const NOW = "2026-09-11T15:00:00.000Z";
const RANK_SRC_PATH = fileURLToPath(new URL("../src/rank.mjs", import.meta.url));

const POLICY_OVERRIDE = {
  includeUnfunded: true,
  includeForumRewards: true,
  includeLabSchedule: true,
  staleAfterSeconds: 604800,
};

async function recordsFrom(name, file) {
  const r = await ingestAdapter(name, file);
  return r.records;
}

function readLabelledEdge(file) {
  return JSON.parse(readFileSync(join(FIX, file), "utf8"));
}

function isUnsignedDecimalString(s) {
  return typeof s === "string" && /^(0|[1-9]\d*)(\.\d+)?$/.test(s);
}

function isSignedDecimalString(s) {
  return typeof s === "string" && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(s);
}

function hasReason(reasons, reason) {
  if (reason === "closed") {
    return reasons.includes("closed") || reasons.some((x) => x.startsWith("lifecycle_"));
  }
  return reasons.includes(reason);
}

test("hard exclusions cannot be overridden by policy (closed, unfunded, stale, expired)", async () => {
  assert.equal(TEST_NOW, NOW);

  const cases = [
    {
      file: "edge-closed.frantic.fixture.json",
      reason: "closed",
      capturedAtPrefix: "2026-09-11",
    },
    {
      file: "edge-unfunded.frantic.fixture.json",
      reason: "unfunded",
      capturedAtPrefix: "2026-09-11",
    },
    {
      file: "edge-stale.frantic.fixture.json",
      reason: "stale_observation",
      capturedAtPrefix: "2026-08-01",
    },
    {
      file: "edge-expired.frantic.fixture.json",
      reason: "deadline_expired",
      capturedAtPrefix: "2026-09-11",
    },
  ];

  for (const c of cases) {
    const labelled = readLabelledEdge(c.file);
    assert.equal(labelled.dataLabel, "synthetic-edge");
    assert.ok(
      String(labelled.capturedAt).startsWith(c.capturedAtPrefix),
      `${c.file} capturedAt ${labelled.capturedAt} should start with ${c.capturedAtPrefix}`,
    );

    const recs = await recordsFrom("frantic", c.file);
    assert.ok(recs.length >= 1, `${c.file} should ingest at least one record`);
    const result = rank(recs, POLICY_OVERRIDE, { now: NOW });
    assert.equal(result.ranked.length, 0, `${c.file} must not rank under include* overrides`);
    assert.ok(result.excluded.length >= 1);

    for (const r of result.annotated) {
      assert.equal(r.status.availablePaidJob, false);
      assert.ok(
        hasReason(r.status.exclusionReasons, c.reason),
        `${c.file} expected ${c.reason} in ${JSON.stringify(r.status.exclusionReasons)}`,
      );
    }
  }
});

test("includeUnfunded:true still does not rank unfunded labelled edge", async () => {
  const recs = await recordsFrom("frantic", "edge-unfunded.frantic.fixture.json");
  const off = rank(recs, { includeUnfunded: false }, { now: NOW });
  const on = rank(recs, { includeUnfunded: true }, { now: NOW });
  assert.equal(off.ranked.length, 0);
  assert.equal(on.ranked.length, 0);
  assert.ok(on.annotated[0].status.exclusionReasons.includes("unfunded"));
  assert.equal(on.annotated[0].status.availablePaidJob, false);
  assert.equal(on.policy.includeUnfunded, true);
});

test("rank does not read shareCount or operators_enlisted as a score", async () => {
  const src = readFileSync(RANK_SRC_PATH, "utf8");
  const shareMentions = src.match(/shareCount/g) || [];
  assert.equal(shareMentions.length, 1, "shareCount may appear only in the why disclaimer");
  assert.match(src, /rank does not use shareCount/);
  assert.equal(src.includes("operators_enlisted"), false);

  const recs = await recordsFrom("frantic", "frantic-board.open.fixture.json");
  const policy = { effortHours: "0" };
  const baseline = rank(recs, policy, { now: NOW });
  assert.ok(baseline.ranked.length >= 2);
  assert.equal(baseline.ranked[0].record.source.nativeId, "129");

  const why = baseline.ranked.map((s) => s.why.join("\n")).join("\n");
  assert.match(why, /does not use shareCount/);
  assert.match(why, /not popularity/);
  assert.doesNotMatch(why, /operators_enlisted/);
  for (const s of baseline.ranked) {
    assert.equal(Array.isArray(s.why), true);
    assert.ok(s.why.some((line) => line.includes("shareCount")));
    assert.ok(s.why.some((line) => /expectedUsefulNetReturn=/.test(line)));
  }

  const polluted = recs.map((r) => ({
    ...r,
    shareCount: r.source.nativeId === "130" ? 10000000 : 0,
    operators_enlisted: r.source.nativeId === "130" ? 10000000 : 1,
  }));
  const after = rank(polluted, policy, { now: NOW });
  assert.equal(after.ranked[0].record.source.nativeId, "129");
  assert.deepEqual(
    after.ranked.map((s) => [s.record.taskId, s.expectedUsefulNetReturn, s.uncertainty]),
    baseline.ranked.map((s) => [s.record.taskId, s.expectedUsefulNetReturn, s.uncertainty]),
  );
});

test("user-adjustable effortHours/hourlyCostAmount changes expectedUsefulNetReturn", async () => {
  const recs = await recordsFrom("frantic", "frantic-board.open.fixture.json");
  const zero = rank(recs, { effortHours: "0", hourlyCostAmount: "25" }, { now: NOW });
  const hours = rank(recs, { effortHours: "2", hourlyCostAmount: "25" }, { now: NOW });
  const cost = rank(recs, { effortHours: "2", hourlyCostAmount: "50" }, { now: NOW });

  assert.ok(zero.ranked.length >= 1);
  const id = zero.ranked[0].record.source.nativeId;
  const pick = (result) => result.ranked.find((s) => s.record.source.nativeId === id);
  const z = pick(zero).expectedUsefulNetReturn;
  const h = pick(hours).expectedUsefulNetReturn;
  const c = pick(cost).expectedUsefulNetReturn;

  assert.equal(isSignedDecimalString(z), true);
  assert.equal(isSignedDecimalString(h), true);
  assert.equal(isSignedDecimalString(c), true);
  assert.ok(!z.startsWith("-") && z !== "0");
  assert.notEqual(h, z, `raising effortHours must change net (${h} vs ${z})`);
  assert.notEqual(c, h, `raising hourlyCostAmount must change net (${c} vs ${h})`);
  assert.ok(h.startsWith("-"), `effortHours 2 should flip net negative, got ${h}`);
  assert.ok(c.startsWith("-"), `higher hourlyCost should stay negative, got ${c}`);
  const mag = (s) => (s.startsWith("-") ? s.slice(1) : s);
  assert.ok(cmpDecimal(mag(c), mag(h)) > 0, `higher hourlyCost should be more negative (${c} vs ${h})`);
  const zero50 = rank(recs, { effortHours: "0", hourlyCostAmount: "50" }, { now: NOW });
  assert.equal(pick(zero50).expectedUsefulNetReturn, z);
  assert.equal(zero.policy.effortHours, "0");
  assert.equal(hours.policy.effortHours, "2");
  assert.equal(cost.policy.hourlyCostAmount, "50");
});

test("uncertainty is a decimal string, not a star rating", async () => {
  const recs = await recordsFrom("frantic", "frantic-board.open.fixture.json");
  const result = rank(recs, { effortHours: "0" }, { now: NOW });
  assert.ok(result.ranked.length >= 1);

  for (const s of [...result.ranked, ...result.excluded]) {
    assert.equal(typeof s.uncertainty, "string");
    assert.equal(isUnsignedDecimalString(s.uncertainty), true);
    assert.ok(cmpDecimal(s.uncertainty, "0") >= 0);
    assert.ok(cmpDecimal(s.uncertainty, "1") <= 0);
    assert.doesNotMatch(s.uncertainty, /[★⭐]|star/i);
    assert.notEqual(typeof s.uncertainty, "number");
  }

  const why = result.ranked[0].why.join("\n");
  assert.match(why, /uncertainty=\d+(\.\d+)?/);
  assert.doesNotMatch(why, /[★⭐]/);
  assert.doesNotMatch(why, /star rating/i);
  assert.doesNotMatch(why, /\b[1-5]\s*\/\s*5\b/);
});

test("selectOne no-match path stays honest when only github+neomorphic records exist", async () => {
  const github = await recordsFrom("github-issues", "github-issues.open.fixture.json");
  const neo = await recordsFrom("neomorphic-schedule", "neomorphic-schedule.fixture.json");
  assert.ok(github.length >= 1);
  assert.ok(neo.length >= 1);
  assert.ok(github.every((r) => r.source.adapter === "github-issues"));
  assert.ok(neo.every((r) => r.source.adapter === "neomorphic-schedule" || r.source.labSchedule));

  const sel = selectOne([...github, ...neo], POLICY_OVERRIDE, { now: NOW });
  assert.equal(sel.match, false);
  assert.equal(sel.reason, "no_genuinely_claimable_paid_job");
  assert.equal(sel.selected, null);
  assert.deepEqual(sel.rankedClaimable, []);
  assert.equal(typeof sel.hint, "string");
  assert.match(sel.hint, /GitHub/);
  assert.match(sel.hint, /lab-schedule/);
  assert.match(sel.hint, /not a failure of ranking weights/);
  assert.equal(sel.rank.ranked.length, 0);
});
