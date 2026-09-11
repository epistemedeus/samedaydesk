import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ENGINE_SHA, SDS_ROOT } from "../lib/pins.mjs";
import { spawnPageChange } from "../lib/spawn-engine.mjs";
import { engine, spawnTrial, stdoutJson, tmpOut } from "./helpers.mjs";

test("stale after-capture is a verified historical fact with stale_at_query, not live currency", () => {
  const spawned = spawnTrial(["run", "--case", "stale-after", "--out-dir", tmpOut("m18-stale-")]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const trial = stdoutJson(spawned);
  assert.equal(trial.engine.verdict, "changed");
  assert.equal(trial.factsVerified, true);
  assert.equal(trial.facts[0].expectedAfter, "Alpha v2");
  assert.equal(trial.freshness.status, "stale_at_query");
  assert.equal(trial.freshness.reason, "after_capture_older_than_maxStaleMs");
  assert.equal(trial.freshness.maxStaleMs, 86400000);
  assert.ok(trial.freshness.ageMs > 86400000);
  assert.equal(trial.engine.claimsFresh, false);
  assert.equal(trial.engine.freshness, "unknown");
  assert.equal(trial.freshness.livePageCurrent, false);
});

test("missing observation timestamps keep trial freshness unknown without inventing currency", () => {
  const spawned = spawnTrial(["run", "--case", "missing-observation", "--out-dir", tmpOut("m18-missing-obs-")]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const trial = stdoutJson(spawned);
  assert.equal(trial.factsVerified, true);
  assert.equal(trial.freshness.status, "unknown");
  assert.equal(trial.freshness.reason, "missing_after_observation");
  assert.equal(trial.engine.claimsFresh, false);
});

test("engine --max-stale-ms 1 does not set claims.fresh at pin 91b5733", () => {
  const resolved = engine();
  assert.equal(resolved.sha, ENGINE_SHA);
  const before = join(SDS_ROOT, "experiments/wave5/m18/captures/complete-changed/before.json");
  const after = join(SDS_ROOT, "experiments/wave5/m18/captures/complete-changed/after.json");
  const outDir = mkdtempSync(join(tmpdir(), "m18-engine-stale-flag-"));
  const spawned = spawnPageChange({
    cli: resolved.cli,
    args: [
      "compare",
      "--before", before,
      "--after", after,
      "--fields", "title,description",
      "--clock", "2026-09-11T18:00:00.000Z",
      "--max-stale-ms", "1",
      "--out-dir", outDir,
    ],
  });
  assert.equal(spawned.kind, "valid_analysis", spawned.stderr);
  const report = JSON.parse(spawned.stdout).report;
  assert.equal(report.freshness, "unknown");
  assert.equal(report.claims.fresh, false);
  assert.equal(report.claims.current, false);
  assert.equal(report.verdict, "changed");
});
