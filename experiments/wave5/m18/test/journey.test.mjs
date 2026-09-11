import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { spawnTrial, stdoutJson, tmpOut } from "./helpers.mjs";

test("complete-changed: title Alpha v1 to Alpha v2 is verified against captured source", () => {
  const outDir = tmpOut("m18-complete-");
  const spawned = spawnTrial(["run", "--case", "complete-changed", "--out-dir", outDir]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const trial = stdoutJson(spawned);
  assert.equal(trial.schema, "samedaydesk.wave5.m18.changed-page-trial.v0");
  assert.equal(trial.kind, "valid_analysis");
  assert.equal(trial.engine.verdict, "changed");
  assert.equal(trial.engine.complete, true);
  assert.equal(trial.engine.usefulOutputProven, true);
  assert.equal(trial.engine.paymentImpliesUsefulOutput, false);
  assert.equal(trial.engine.freshness, "unknown");
  assert.equal(trial.engine.claimsFresh, false);
  assert.equal(trial.engine.claimsCurrent, false);
  assert.equal(trial.factsVerified, true);
  assert.equal(trial.facts[0].verified, true);
  assert.equal(trial.facts[0].expectedBefore, "Alpha v1");
  assert.equal(trial.facts[0].expectedAfter, "Alpha v2");
  assert.equal(trial.facts[1].verified, true);
  assert.equal(trial.freshness.status, "within_limit_at_query");
  assert.equal(trial.freshness.ageMs, 3599000);
  assert.equal(trial.freshness.livePageCurrent, false);
  assert.equal(trial.captures.matchEngineProvenance, true);
  assert.match(trial.engine.termsVersion, /^sha256:[a-f0-9]{64}$/);
  const written = JSON.parse(readFileSync(join(outDir, "page-change.json"), "utf8"));
  assert.equal(written.report.verdict, "changed");
  assert.match(readFileSync(join(outDir, "page-change.md"), "utf8"), /verdict: \*\*changed\*\*/);
});

test("published customer-job: widget deadline change is verified though the report is incomplete", () => {
  const outDir = tmpOut("m18-published-");
  const spawned = spawnTrial(["run", "--case", "published-customer-job", "--out-dir", outDir]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const trial = stdoutJson(spawned);
  assert.equal(trial.engine.verdict, "changed");
  assert.equal(trial.engine.complete, false);
  assert.equal(trial.engine.usefulOutputProven, true);
  assert.equal(trial.engine.paymentImpliesUsefulOutput, false);
  assert.equal(trial.factsVerified, true);
  assert.equal(trial.facts[0].expectedAfter, "Q3 widget RFQ (deadline moved)");
  assert.equal(trial.facts[1].expectedAfter, "Offer due 2026-09-27. Unit price 12.40 USD.");
  assert.equal(trial.facts[2].kind, "order");
  assert.equal(trial.facts[2].verified, true);
  assert.equal(trial.captures.beforeSha256, "23833bf7b28ca27a074cb9d73daaa2ec3beed14a55d767567c5fab50b66605f4");
  assert.equal(trial.captures.afterSha256, "a7fdf95f161c67529a7254b1d2e1c4efa068506ac01edaee3c2561a5d09c9bd6");
  assert.equal(trial.freshness.status, "within_limit_at_query");
  assert.equal(trial.engine.freshness, "unknown");
});

test("unchanged selected fields is valid analysis, not an engine failure", () => {
  const spawned = spawnTrial(["run", "--case", "unchanged", "--out-dir", tmpOut("m18-unchanged-")]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const trial = stdoutJson(spawned);
  assert.equal(trial.kind, "valid_analysis");
  assert.equal(trial.engine.verdict, "unchanged");
  assert.equal(trial.engine.usefulOutputProven, true);
  assert.equal(trial.factsVerified, true);
  assert.equal(trial.facts[0].expected, "Alpha v1");
});

test("heading reorder is not a title change", () => {
  const spawned = spawnTrial(["run", "--case", "reorder-headings", "--out-dir", tmpOut("m18-reorder-")]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const trial = stdoutJson(spawned);
  assert.equal(trial.engine.verdict, "reordered");
  assert.equal(trial.factsVerified, true);
  assert.equal(trial.facts[0].kind, "unchanged");
  assert.equal(trial.facts[1].path, "/headings/h2");
});
