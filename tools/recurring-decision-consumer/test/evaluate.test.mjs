import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateDecision } from "../src/evaluate.mjs";
import { removeState, showState, updateState } from "../src/state.mjs";
import { OUTCOMES, REASONS } from "../src/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = join(root, "fixtures");
const cli = join(root, "cli.mjs");
const CLOCK = "2026-11-05T12:00:00.000Z";
const HORIZON = 24;

function load(rel) {
  return JSON.parse(readFileSync(join(fixtures, rel), "utf8"));
}

test("useful no-change against identical permitted captures", () => {
  const result = evaluateDecision({
    intent: load("intents/watch-title.json"),
    prior: load("captures/prior.json"),
    capture: load("captures/same.json"),
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(result.useful, true);
  assert.equal(result.reason, REASONS.fieldsMatch);
  assert.deepEqual(result.decision.changedFields, []);
  assert.ok(result.decision.unchangedFields.includes("title"));
});

test("useful change against real changed-input example", () => {
  const result = evaluateDecision({
    intent: load("intents/watch-title.json"),
    prior: load("captures/prior.json"),
    capture: load("captures/changed.json"),
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, OUTCOMES.usefulChange);
  assert.equal(result.useful, true);
  assert.equal(result.reason, REASONS.fieldsDiffer);
  assert.deepEqual(result.decision.changedFields, ["title"]);
});

test("stale when capture is outside freshness horizon", () => {
  const result = evaluateDecision({
    intent: load("intents/watch-title.json"),
    prior: load("captures/prior.json"),
    capture: load("captures/stale.json"),
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.outcome, OUTCOMES.stale);
  assert.equal(result.useful, false);
  assert.equal(result.reason, REASONS.captureStale);
});

test("unavailable when capture is missing", () => {
  const result = evaluateDecision({
    intent: load("intents/watch-title.json"),
    prior: load("captures/prior.json"),
    capture: null,
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.outcome, OUTCOMES.unavailable);
  assert.equal(result.reason, REASONS.captureMissing);
});

test("consumes portable-decision capture schema without duplicating producer", () => {
  const result = evaluateDecision({
    intent: load("intents/watch-title.json"),
    prior: load("captures/prior.json"),
    capture: load("captures/portable-same.json"),
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(result.useful, true);
});

test("false-change control fires when reference expects no-change but fields differ", () => {
  const result = evaluateDecision({
    intent: load("intents/watch-title.json"),
    prior: load("captures/prior.json"),
    capture: load("captures/changed.json"),
    clock: CLOCK,
    horizonHours: HORIZON,
    reference: load("reference/expect-no-change.json"),
  });
  assert.equal(result.outcome, OUTCOMES.usefulChange);
  assert.equal(result.controls.falseChange, true);
  assert.equal(result.controls.missedChange, false);
  assert.equal(result.controls.referenceMatched, false);
  assert.equal(result.reason, REASONS.referenceFalseChange);
});

test("missed-change control fires when reference expects change but fields match", () => {
  const result = evaluateDecision({
    intent: load("intents/watch-title.json"),
    prior: load("captures/prior.json"),
    capture: load("captures/same.json"),
    clock: CLOCK,
    horizonHours: HORIZON,
    reference: load("reference/expect-change.json"),
  });
  assert.equal(result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(result.controls.missedChange, true);
  assert.equal(result.controls.falseChange, false);
  assert.equal(result.reason, REASONS.referenceMissedChange);
});

test("portable state update show remove", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-state-"));
  const statePath = join(dir, "state.json");
  const retained = evaluateDecision({
    intent: load("intents/watch-title.json"),
    prior: load("captures/prior.json"),
    capture: load("captures/same.json"),
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  const updated = updateState(statePath, {
    subject: "example-page",
    intentId: "watch-title",
    clock: CLOCK,
    retainedResult: retained,
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.state.sequence, 1);
  const shown = showState(statePath);
  assert.equal(shown.ok, true);
  assert.equal(shown.state.retainedResult.outcome, OUTCOMES.usefulNoChange);
  const removed = removeState(statePath);
  assert.equal(removed.removed, true);
  const after = showState(statePath);
  assert.equal(after.missing, true);
});

test("CLI evaluate baseline for change and no-change", () => {
  const noChange = spawnSync(process.execPath, [
    cli, "evaluate",
    "--intent", join(fixtures, "intents/watch-title.json"),
    "--prior", join(fixtures, "captures/prior.json"),
    "--capture", join(fixtures, "captures/same.json"),
    "--clock", CLOCK,
    "--horizon", String(HORIZON),
    "--reference", join(fixtures, "reference/expect-no-change.json"),
  ], { encoding: "utf8" });
  assert.equal(noChange.status, 0, noChange.stderr);
  const noBody = JSON.parse(noChange.stdout);
  assert.equal(noBody.outcome, OUTCOMES.usefulNoChange);
  assert.equal(noBody.controls.referenceMatched, true);

  const change = spawnSync(process.execPath, [
    cli, "evaluate",
    "--intent", join(fixtures, "intents/watch-title.json"),
    "--prior", join(fixtures, "captures/prior.json"),
    "--capture", join(fixtures, "captures/changed.json"),
    "--clock", CLOCK,
    "--horizon", String(HORIZON),
    "--reference", join(fixtures, "reference/expect-change.json"),
  ], { encoding: "utf8" });
  assert.equal(change.status, 0, change.stderr);
  const changeBody = JSON.parse(change.stdout);
  assert.equal(changeBody.outcome, OUTCOMES.usefulChange);
  assert.equal(changeBody.controls.referenceMatched, true);
});

test("export-workflow refuses unverified runtime schema", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-wf-"));
  const out = join(dir, "wf.json");
  const refused = spawnSync(process.execPath, [
    cli, "export-workflow", "--runtime", "n8n", "--out", out,
  ], { encoding: "utf8" });
  assert.equal(refused.status, 1);
  const body = JSON.parse(refused.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.reason, "runtime_schema_unverified");
});
