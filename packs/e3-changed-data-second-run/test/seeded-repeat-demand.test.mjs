import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { classifyPair } from "../src/classify.mjs";
import { loadPairDocument, resolvePairRuns } from "../src/pair.mjs";
import { PAIR_FILES } from "../src/paths.mjs";
import { runChangedDataPair } from "../src/run.mjs";
import { FIXTURES, naiveRepeatDemand, parseStdout, REPO_ROOT, runCli } from "./helpers.mjs";

test("seeded same-fixture-repeat-demand pair is refused with that class", () => {
  const loaded = loadPairDocument(PAIR_FILES.seededSameFixtureRepeatDemand);
  const resolved = resolvePairRuns(loaded);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.runs[0].fingerprint, resolved.runs[1].fingerprint);
  const classified = classifyPair(resolved);
  assert.equal(classified.ok, false, JSON.stringify(classified));
  assert.equal(classified.failure.class, "same_fixture_labelled_repeat_demand");
  assert.equal(classified.failure.seeded, "same_fixture_labelled_repeat_demand");
});

test("CLI --seeded-fixture exits 2 and names the class", () => {
  const proc = runCli(["--seeded-fixture"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2, proc.stderr || proc.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.failure.class, "same_fixture_labelled_repeat_demand");
  assert.notEqual(json.ok, true);
  assert.notEqual(json.repeatDemand, true);
});

test("naive ran-twice-is-repeat-demand would accept the seeded fixture; this caller does not", () => {
  const raw = JSON.parse(
    readFileSync(join(FIXTURES, "pairs/same-fixture-repeat-demand.json"), "utf8"),
  );
  const naive = naiveRepeatDemand(raw);
  assert.equal(naive.ok, true);
  assert.equal(naive.repeatDemand, true);
  const result = runChangedDataPair({
    pairPath: PAIR_FILES.seededSameFixtureRepeatDemand,
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "same_fixture_labelled_repeat_demand");
  assert.equal(result.repeatDemand, false);
});

test("CLI never exits 0 for the seeded repeat-demand fixture", () => {
  const proc = runCli(["--compact", "--seeded-fixture"]);
  assert.notEqual(proc.status, 0);
  assert.equal(proc.status, 2);
  assert.match(proc.stdout, /"ok":\s*false/);
  assert.match(proc.stdout, /same_fixture_labelled_repeat_demand/);
});

test("same fixture twice without the repeat-demand label is still not a second run", () => {
  const loaded = loadPairDocument(PAIR_FILES.seededSameFixtureRepeatDemand);
  const pair = {
    ...loaded.pair,
    demandClass: "none",
    runs: loaded.pair.runs.map((run) => ({ ...run, demandClass: undefined })),
  };
  const resolved = {
    ok: true,
    path: loaded.path,
    pair,
    demandClass: "none",
    jobId: pair.jobId,
    runs: resolvePairRuns({ ...loaded, pair }).runs,
  };
  const classified = classifyPair(resolved);
  assert.equal(classified.ok, false);
  assert.equal(classified.failure.class, "same_fixture_not_changed_input");
});
