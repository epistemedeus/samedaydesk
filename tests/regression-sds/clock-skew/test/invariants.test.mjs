import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_CASE_IDS,
  evaluateInvariants,
  loadManifest,
  runCase,
  runColdCohort,
} from "../src/cohort.mjs";

test("invariants fail closed when required future-skew cases are absent", () => {
  const report = runColdCohort();
  const stripped = report.cases.filter(
    (item) => !["future-skew", "future-skew-day", "adapter-future-skew"].includes(item.id),
  );
  const invariants = evaluateInvariants(stripped, loadManifest());
  assert.equal(invariants.requiredCasesPresent, false);
  assert.equal(invariants.futureSkewNotOk, false);
  assert.equal(invariants.ok, false);
  assert.equal(stripped.every((item) => item.ok), true);
});

test("invariants fail closed when manifest windows drift from published constants", () => {
  const report = runColdCohort();
  const drifted = {
    ...loadManifest(),
    windows: {
      observatoryFutureSkewMs: 60_000,
      observatoryStaleMs: 7_200_000,
      marketObsStaleMs: 3_600_000,
    },
  };
  const invariants = evaluateInvariants(report.cases, drifted);
  assert.equal(invariants.windowsMatchPublished, false);
  assert.equal(invariants.ok, false);
  assert.equal(report.ok, true);
});

test("runCase rejects fixture id that does not match the manifest entry", () => {
  const result = runCase({
    id: "future-skew",
    file: "fresh-ok.json",
    kind: "classify",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /id mismatch/);
});

test("required case list matches the cold cohort", () => {
  const report = runColdCohort();
  assert.deepEqual(report.cases.map((item) => item.id), [...REQUIRED_CASE_IDS]);
});

test("invariants fail closed when a required case is present but failed", () => {
  const report = runColdCohort();
  const mutated = report.cases.map((item) =>
    item.id === "invalid-timestamp" ? { ...item, ok: false, errors: ["mutated"] } : item,
  );
  const invariants = evaluateInvariants(mutated, loadManifest());
  assert.equal(invariants.requiredCasesPresent, true);
  assert.equal(invariants.requiredCasesOk, false);
  assert.equal(invariants.ok, false);
});

test("invariants fail closed when market-obs boundary fixture is not at SOURCE_TIME_STALE_MS", () => {
  const report = runColdCohort();
  const drifted = report.cases.map((item) =>
    item.id === "stale-market-obs-boundary"
      ? { ...item, providerTimestamp: "2026-09-17T11:30:00.000Z" }
      : item,
  );
  const invariants = evaluateInvariants(drifted, loadManifest());
  assert.equal(invariants.marketObsBoundaryOk, true);
  assert.equal(invariants.windowDeltasMatchPublished, false);
  assert.equal(invariants.ok, false);
});

test("invariants fail closed when a duplicate case id hides a failed first copy", () => {
  const report = runColdCohort();
  const original = report.cases.find((item) => item.id === "future-skew");
  const duplicated = [{ ...original, ok: false, observatoryState: "ok" }, ...report.cases];
  const invariants = evaluateInvariants(duplicated, loadManifest());
  assert.equal(invariants.noDuplicateCaseIds, false);
  assert.equal(invariants.futureSkewNotOk, true);
  assert.equal(invariants.ok, false);
});

test("invariants fail closed when a case drifts off the pinned observer clock", () => {
  const report = runColdCohort();
  const drifted = report.cases.map((item) =>
    item.id === "fresh-ok" ? { ...item, fetchedAt: "2026-09-17T13:00:00.000Z" } : item,
  );
  const invariants = evaluateInvariants(drifted, loadManifest());
  assert.equal(invariants.pinnedFetchedAtMatch, false);
  assert.equal(invariants.ok, false);
});
