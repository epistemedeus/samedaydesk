import assert from "node:assert/strict";
import test from "node:test";
import { REQUIRED_CASE_IDS, runColdCohort } from "../src/cohort.mjs";
import { FUTURE_SKEW_MS, STALE_PROVIDER_MS, SOURCE_TIME_STALE_MS } from "../src/engine.mjs";

test("cold cohort: published engines classify skew windows and keep clocks distinct", () => {
  const report = runColdCohort();
  assert.equal(report.schema, "sds.regression.clock-skew.v1");
  assert.equal(report.mode, "cold");
  assert.equal(report.ok, true, JSON.stringify(report.cases.filter((item) => !item.ok), null, 2));
  assert.equal(report.caseCount, REQUIRED_CASE_IDS.length);
  assert.equal(report.caseCount, 15);
  assert.equal(report.failedCount, 0);
  assert.equal(report.invariants.ok, true);
  assert.equal(report.invariants.requiredCasesPresent, true);
  assert.equal(report.invariants.windowsMatchPublished, true);
  assert.equal(report.invariants.noOrphanFixtures, true);
  assert.equal(report.invariants.futureSkewNotOk, true);
  assert.equal(report.invariants.withinSkewOk, true);
  assert.equal(report.invariants.staleNotZeroed, true);
  assert.equal(report.invariants.clocksDistinct, true);
  assert.equal(report.invariants.marketObsBoundaryOk, true);
  assert.equal(report.invariants.payment, false);
  assert.equal(report.invariants.checkout, false);
  assert.equal(report.invariants.publish, false);
  assert.equal(report.invariants.neomorphicIo, false);

  const byId = Object.fromEntries(report.cases.map((item) => [item.id, item]));
  assert.equal(byId["fresh-ok"].observatoryState, "ok");
  assert.equal(byId["within-skew"].observatoryState, "ok");
  assert.equal(byId["future-skew-boundary"].observatoryState, "ok");
  assert.equal(byId["future-skew"].observatoryState, "invalid");
  assert.equal(byId["future-skew-day"].observatoryState, "invalid");
  assert.equal(byId["stale-boundary-ok"].observatoryState, "ok");
  assert.equal(byId["stale-boundary-ok"].marketObsState, "stale");
  assert.equal(byId["stale-observatory"].observatoryState, "stale");
  assert.equal(byId["stale-market-obs-only"].observatoryState, "ok");
  assert.equal(byId["stale-market-obs-only"].marketObsState, "stale");
  assert.equal(byId["stale-market-obs-boundary"].observatoryState, "ok");
  assert.equal(byId["stale-market-obs-boundary"].marketObsState, "ok");
  assert.equal(byId["stale-market-obs-just-stale"].observatoryState, "ok");
  assert.equal(byId["stale-market-obs-just-stale"].marketObsState, "stale");
  assert.equal(byId["missing-timestamp"].observatoryState, "missing");
  assert.equal(byId["invalid-timestamp"].observatoryState, "invalid");
  assert.equal(byId["invalid-timestamp"].marketObsState, "schema_drift");

  const adapterFuture = byId["adapter-future-skew"];
  assert.equal(adapterFuture.moltjobs.providerTimestampState, "invalid");
  assert.equal(adapterFuture.x402stats.providerTimestampState, "invalid");
  assert.equal(adapterFuture.x402stats.availability, "partial");
  assert.equal(adapterFuture.moltjobs.jobCount, 12);
  assert.equal(adapterFuture.x402stats.sellers_30d, 47303);

  const adapterStale = byId["adapter-stale-keeps-metrics"];
  assert.equal(adapterStale.moltjobs.availability, "stale");
  assert.equal(adapterStale.x402stats.availability, "stale");
  assert.equal(adapterStale.moltjobs.jobCount, 12);
  assert.equal(adapterStale.x402stats.sellers_30d, 47303);

  const adapterOk = byId["adapter-within-skew"];
  assert.equal(adapterOk.moltjobs.availability, "ok");
  assert.equal(adapterOk.x402stats.availability, "ok");
  assert.notEqual(adapterOk.moltjobs.fetchedAt, adapterOk.moltjobs.providerTimestamp);

  assert.equal(FUTURE_SKEW_MS, 2 * 60 * 1000);
  assert.equal(STALE_PROVIDER_MS, 2 * 60 * 60 * 1000);
  assert.equal(SOURCE_TIME_STALE_MS, 60 * 60 * 1000);
});
