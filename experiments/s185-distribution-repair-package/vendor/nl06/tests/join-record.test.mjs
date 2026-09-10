import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BUNDLE_SCHEMA,
  DIAGNOSIS_SCHEMA,
  ERROR_CODES,
  FEED_SCHEMA,
  JOIN_SCHEMA,
  PINS,
  buildBundleFromFeed,
  joinRecordToDiagnosis,
  selectJoinableRepairs,
  validateFeed,
  validateJoinResult,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) =>
  JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const clock = () => Date.parse("2026-09-10T20:15:00.000Z");

test("positive feed: source-compatible joins; gaps explicit; no invented revenue", async () => {
  const feed = load("dist-repair-feed.positive.json");
  assert.equal(feed.schema, FEED_SCHEMA);
  assert.equal(feed.pins.samedaydeskDist08, PINS.dist08);

  const result = await joinRecordToDiagnosis(feed, { clock });
  assert.equal(result.schema, JOIN_SCHEMA);
  assert.equal(result.status, "joined");
  assert.equal(result.generatedAt, "2026-09-10T20:15:00.000Z");
  assert.ok(result.joinableCount >= 1);
  assert.ok(Array.isArray(result.gaps) && result.gaps.length >= 1);
  assert.ok(result.gaps.some((g) => g.code === "fixture_derived_acquisition"));
  assert.ok(result.gaps.some((g) => g.code === "no_revenue_from_feed"));

  assert.equal(result.bundle.schema, BUNDLE_SCHEMA);
  assert.equal(result.diagnosis.schema, DIAGNOSIS_SCHEMA);
  assert.equal(result.diagnosis.status, "available");
  assert.ok(result.diagnosis.joined.length >= 1);

  for (const j of result.diagnosis.joined) {
    assert.equal(j.claims.conversionFromClick, false);
    assert.equal(j.claims.revenueFromListPrice, false);
    assert.equal(j.claims.buyerIntentFromActivation, false);
    assert.ok(Array.isArray(j.unknowns) && j.unknowns.length >= 1);
    assert.ok(
      j.compatibilityKeys.includes("sharedEvidenceId") ||
        j.compatibilityKeys.includes("jobRef") ||
        j.compatibilityKeys.includes("provider"),
    );
  }

  assert.ok(result.claims.denies.includes("invented_revenue"));
  assert.ok(result.claims.denies.includes("live_traffic"));
  assert.equal(result.claims.conversionFromClick, false);
  assert.equal(result.diagnosis.grexalS149?.customerExecutionRevenuePayout, false);
  assert.equal(result.pins.record04Export, PINS.record04Export);
  assert.equal(result.pins.s172Tip, PINS.s172Tip);

  validateJoinResult(result);
});

test("join only source-compatible events (sharedEvidenceId/jobRef align per route)", async () => {
  const { bundle, joinable } = buildBundleFromFeed(
    load("dist-repair-feed.positive.json"),
  );
  assert.ok(joinable.length >= 1);
  for (const repair of joinable) {
    const jobRef = `nl-record-04:nl-04-feed-positive:${repair.routeKey}`;
    const acqs = bundle.acquisitionEvidence.filter((a) => a.jobRef === jobRef);
    const outs = bundle.usefulOutputEvidence.filter((o) => o.jobRef === jobRef);
    assert.ok(acqs.length >= 1);
    assert.equal(outs.length, 1);
    for (const a of acqs) {
      assert.equal(a.sharedEvidenceId, outs[0].sharedEvidenceId);
      assert.equal(a.sourceTag, "catalog");
      assert.equal(outs[0].provider, "grexal");
    }
  }
  const result = await joinRecordToDiagnosis(
    load("dist-repair-feed.positive.json"),
    { clock },
  );
  for (const j of result.diagnosis.joined) {
    assert.equal(j.acquisition.jobRef, j.usefulOutput.jobRef);
    assert.ok(
      j.compatibilityKeys.includes("sharedEvidenceId") ||
        j.compatibilityKeys.includes("jobRef"),
    );
  }
  // 6 repairs × 2 acqs = 12 joins (not cartesian across routes)
  assert.equal(result.diagnosis.joined.length, 12);
});

test("partial feed: gaps include incomplete capture / cannot_prove_global_removal", async () => {
  const result = await joinRecordToDiagnosis(
    load("dist-repair-feed.partial.json"),
    { clock },
  );
  assert.ok(result.gaps.some((g) => g.code === "current_capture_incomplete"));
  assert.ok(result.gaps.some((g) => g.code === "partial_input"));
  assert.equal(result.diagnosis.nl06.currentCaptureIncomplete, true);
  assert.ok(result.claims.denies.includes("invented_revenue"));
  assert.ok(Array.isArray(result.diagnosis.joined));
  validateJoinResult(result);
});

test("unavailable input: diagnosis unavailable without activationCount (≠ no_users)", async () => {
  const result = await joinRecordToDiagnosis(
    load("join-input.unavailable.json"),
    { clock },
  );
  assert.equal(result.status, "unavailable");
  assert.equal(result.diagnosis.status, "unavailable");
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.diagnosis, "activationCount"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result.diagnosis,
      "usefulOutputActionableCount",
    ),
    false,
  );
  assert.ok(result.gaps.some((g) => g.code === "unavailable_ne_no_users"));
  validateJoinResult(result);
});

test("invented revenue feed rejected", async () => {
  await assert.rejects(
    () =>
      joinRecordToDiagnosis(load("dist-repair-feed.invented-revenue.json"), {
        clock,
      }),
    (err) =>
      err.code === ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE ||
      err.code === ERROR_CODES.FORBIDDEN_CLAIM,
  );
});

test("rejected Record04 feed rejected", async () => {
  await assert.rejects(
    () =>
      joinRecordToDiagnosis(load("dist-repair-feed.rejected.json"), { clock }),
    (err) => err.code === ERROR_CODES.REJECTED_FEED,
  );
});

test("validateFeed accepts positive export pin artifact", () => {
  const feed = validateFeed(load("dist-repair-feed.positive.json"));
  assert.equal(feed.feedId, "nl-04-feed-positive");
  assert.ok(selectJoinableRepairs(feed).length >= 3);
});

test("before/after sample prefers redirected high-confidence repair", async () => {
  const result = await joinRecordToDiagnosis(
    load("dist-repair-feed.positive.json"),
    { clock },
  );
  assert.ok(result.beforeAfter);
  assert.equal(result.beforeAfter.routeKey, "/docs");
  assert.equal(result.beforeAfter.before.deltaObserved, "redirected");
  assert.equal(
    result.beforeAfter.after.recommendation,
    "update_listed_route_or_redirect_target",
  );
});

test("causation/independence unknowns listed on joined pairs", async () => {
  const result = await joinRecordToDiagnosis(
    load("dist-repair-feed.positive.json"),
    { clock },
  );
  assert.ok(result.diagnosis.joined.length >= 1);
  for (const j of result.diagnosis.joined) {
    assert.equal(j.customerIndependenceKnown, false);
    assert.ok(
      j.unknowns.some((u) => /customerIndependence|independence/i.test(u)),
    );
    assert.ok(j.unknowns.some((u) => /conversion|click|revenue|intent/i.test(u)));
  }
});

test("no activation mode → no_users when capture ok but zero activations", async () => {
  const result = await joinRecordToDiagnosis(
    load("dist-repair-feed.positive.json"),
    { clock, includeActivation: false },
  );
  assert.equal(result.diagnosis.status, "no_users");
  assert.equal(result.diagnosis.activationCount, 0);
  assert.ok(result.diagnosis.usefulOutputActionableCount >= 1);
  assert.ok(result.claims.denies.includes("live_traffic"));
});
