import assert from "node:assert/strict";
import test from "node:test";
import { spawnTrial, stdoutJson, tmpOut } from "./helpers.mjs";

test("max-sources 1 hides the widget title change and does not set snapshot.truncated", () => {
  const spawned = spawnTrial(["run", "--case", "truncation-max-sources", "--out-dir", tmpOut("m18-trunc-")]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const trial = stdoutJson(spawned);
  assert.equal(trial.kind, "valid_analysis");
  assert.equal(trial.engine.verdict, "incomplete");
  assert.equal(trial.engine.usefulOutputProven, false);
  assert.equal(trial.engine.snapshotTruncated.before, false);
  assert.equal(trial.engine.snapshotTruncated.after, false);
  assert.ok(trial.engine.coverageUnknown.some((item) => item.code === "source_limit"));
  assert.equal(trial.factsVerified, false);
  assert.equal(trial.facts[0].captureMatches, true);
  assert.equal(trial.facts[0].engineMatches, false);
  assert.equal(trial.facts[0].verified, false);
});

test("truncated run and full published run keep the same terms hash and unlike analysis digests", () => {
  const full = stdoutJson(spawnTrial(["run", "--case", "published-customer-job", "--out-dir", tmpOut("m18-full-")]));
  const trunc = stdoutJson(spawnTrial(["run", "--case", "truncation-max-sources", "--out-dir", tmpOut("m18-trunc2-")]));
  assert.equal(full.engine.verdict, "changed");
  assert.equal(trunc.engine.verdict, "incomplete");
  assert.equal(full.engine.termsVersion, trunc.engine.termsVersion);
  assert.equal(full.engine.termsVersion, "sha256:a51d5a25585a8dde706cdc954fa4fbc2aeed50b3599cfb8791c601eb5932c0f4");
  assert.notEqual(full.engine.digestSha256, trunc.engine.digestSha256);
});
