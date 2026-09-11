import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { spawnReplay, tmpOut } from "./helpers.mjs";

test("CLI journey replays every snapshot through the pinned Co13 process", () => {
  const outDir = tmpOut("m09-journey-");
  const result = spawnReplay(["journey", "--out-dir", outDir]);
  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.journey, true);
  assert.equal(result.body.engine.name, "@samedaydesk/page-change-offline-job");
  assert.equal(result.body.engine.sha, "91b57334818ecd7940cb854e9864f3b1749d1d1d");
  assert.equal(result.body.counts.failed, 0);
  assert.equal(result.body.counts.cases, 16);

  const byId = Object.fromEntries(result.body.results.map((item) => [item.id, item]));
  assert.equal(byId["noise-observation-metadata"].analysisOutcome, "unchanged");
  assert.equal(byId["noise-unselected-opengraph"].analysisOutcome, "unchanged");
  assert.equal(byId["noise-json-key-order"].analysisOutcome, "unchanged");
  assert.equal(byId["noise-source-reorder"].analysisOutcome, "reordered");
  assert.equal(byId["heading-permutation"].analysisOutcome, "reordered");
  assert.equal(byId["meaningful-title"].analysisOutcome, "changed");
  assert.equal(byId["meaningful-description"].analysisOutcome, "changed");
  assert.equal(byId["meaningful-heading-text"].analysisOutcome, "changed");
  assert.equal(byId["mixed-noise-plus-title"].analysisOutcome, "changed");
  assert.equal(byId["excerpt-long-title"].analysisOutcome, "changed");
  assert.equal(byId["truncation-max-sources-in-bounds"].analysisOutcome, "changed");
  assert.equal(byId["truncation-max-changes-in-bounds"].analysisOutcome, "changed");
  assert.equal(byId["coverage-unknown-absent-description"].analysisOutcome, "incomplete");
  assert.equal(byId["truncation-max-sources-hides-row"].analysisOutcome, "incomplete");
  assert.equal(byId["truncation-max-changes-hides-verdict"].analysisOutcome, "changed");
  assert.equal(byId["stale-option-noop"].analysisOutcome, "unchanged");

  const replay = JSON.parse(readFileSync(join(outDir, "replay.json"), "utf8"));
  assert.equal(replay.ok, true);
  const titleJson = JSON.parse(readFileSync(join(outDir, "meaningful-title", "page-change.json"), "utf8"));
  assert.equal(titleJson.report.verdict, "changed");
  const titleMd = readFileSync(join(outDir, "meaningful-title", "page-change.md"), "utf8");
  assert.match(titleMd, /verdict: \*\*changed\*\*/);
});

test("CLI list names snapshot controls without running the engine", () => {
  const result = spawnReplay(["list"]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.body.ok, true);
  assert.ok(result.body.cases.some((item) => item.id === "meaningful-title"));
});
