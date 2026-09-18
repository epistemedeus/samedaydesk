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
