import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { INPUT_MAX_BYTES } from "../src/limits.mjs";
import { OUTCOMES, REASONS, STATE_SCHEMA } from "../src/pins.mjs";
import { showState } from "../src/state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = join(root, "fixtures");
const cli = join(root, "cli.mjs");
const WORKFLOW = "eFUkVKYk8xXbM7LV";
const EXECUTION = "2";
const NODE = "Shape Capture Fields";
const CLOCK = "2026-11-05T23:21:56.441Z";
const HORIZON = "168";
const CAPTURE_AT = "2026-11-05T20:47:23.165Z";
const SIBLING = join(fixtures, "n8n-stored/derived-sibling-execution-2.json");
const NESTED = join(fixtures, "n8n-stored/derived-nested-execution-2.json");
const INTENT = join(fixtures, "intents/watch-title.json");
const PRIOR = join(fixtures, "captures/prior.json");
const PRIOR_CHANGE = join(fixtures, "n8n-stored/prior-different-title.json");
const EXPECT_CHANGE = join(fixtures, "reference/expect-change.json");
const EXPECT_NO_CHANGE = join(fixtures, "reference/expect-no-change.json");

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function tempJson(name, value) {
  const dir = mkdtempSync(join(tmpdir(), "rdc-n8n-"));
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function receive(extra = [], saved = SIBLING) {
  return spawnSync(process.execPath, [
    cli, "receive-stored-n8n",
    "--saved", saved,
    "--workflow-id", WORKFLOW,
    "--execution-id", EXECUTION,
    "--node", NODE,
    "--intent", INTENT,
    "--prior", PRIOR,
    "--clock", CLOCK,
    "--horizon", HORIZON,
    ...extra,
  ], { encoding: "utf8" });
}

function bodyOf(ran) {
  assert.equal(ran.stdout.length > 0, true, ran.stderr);
  return JSON.parse(ran.stdout);
}

test("derived fixtures are labeled and omit the HTML body", () => {
  for (const path of [SIBLING, NESTED]) {
    const raw = readFileSync(path, "utf8");
    const saved = JSON.parse(raw);
    assert.equal(saved.derived, true);
    assert.equal(saved.fixtureLabel, "derived");
    assert.match(saved.derivation, /HTML body omitted/);
    assert.equal(raw.includes("<html"), false);
    assert.equal(raw.includes("<!DOCTYPE"), false);
    assert.equal(raw.includes("This domain is for use in"), false);
  }
});

test("stored route imports the maintained evaluator and does not fetch", () => {
  const source = readFileSync(join(root, "src/n8n-stored.mjs"), "utf8");
  assert.match(source, /import \{ evaluateDecision \} from "\.\/evaluate\.mjs"/);
  assert.equal(source.includes("Date.now"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("http.request"), false);
  assert.equal(source.includes("https.request"), false);
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("X-N8N-API-KEY"), false);
});

test("CLI useful no-change keeps the stored node startTime", () => {
  const ran = receive(["--reference", EXPECT_NO_CHANGE]);
  assert.equal(ran.status, 0, ran.stderr);
  const body = bodyOf(ran);
  assert.equal(body.ok, true);
  assert.equal(body.outcome, OUTCOMES.usefulNoChange);
  assert.equal(body.useful, true);
  assert.equal(body.reason, REASONS.fieldsMatch);
  assert.equal(body.freshness.captureAt, CAPTURE_AT);
  assert.equal(body.freshness.clock, CLOCK);
  assert.notEqual(body.freshness.captureAt, body.freshness.clock);
  assert.equal(body.freshness.priorAt, "2026-11-05T10:00:00.000Z");
  assert.equal(body.controls.referenceMatched, true);
  assert.match(body.decision.digestCapture, /^sha256:/);
  assert.equal(body.decision.digestPrior, body.decision.digestCapture);
});

test("CLI useful change uses the maintained evaluator", () => {
  const ran = receive([
    "--prior", PRIOR_CHANGE,
    "--reference", EXPECT_CHANGE,
  ]);
  assert.equal(ran.status, 0, ran.stderr);
  const body = bodyOf(ran);
  assert.equal(body.outcome, OUTCOMES.usefulChange);
  assert.equal(body.useful, true);
  assert.equal(body.reason, REASONS.fieldsDiffer);
  assert.deepEqual(body.decision.changedFields, ["title"]);
  assert.deepEqual(body.decision.unchangedFields, ["status"]);
  assert.equal(body.freshness.captureAt, CAPTURE_AT);
  assert.equal(body.controls.referenceMatched, true);
  assert.notEqual(body.decision.digestPrior, body.decision.digestCapture);
});

test("CLI false-change control stays with the evaluator and does not cache state", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-n8n-state-"));
  const state = join(dir, "state.json");
  const ran = receive([
    "--prior", PRIOR_CHANGE,
    "--reference", EXPECT_NO_CHANGE,
    "--state", state,
  ]);
  assert.equal(ran.status, 0, ran.stderr);
  const body = bodyOf(ran);
  assert.equal(body.outcome, OUTCOMES.usefulChange);
  assert.equal(body.useful, false);
  assert.equal(body.reason, REASONS.referenceFalseChange);
  assert.equal(body.controls.falseChange, true);
  const shown = showState(state);
  assert.equal(shown.missing, true);
});

test("CLI absent fields stay unknown rather than useful", () => {
  const saved = load(SIBLING);
  delete saved.data.resultData.runData[NODE][0].data.main[0][0].json.status;
  const prior = load(PRIOR);
  delete prior.payload.status;
  const ran = receive([
    "--prior", tempJson("prior.json", prior),
  ], tempJson("saved.json", saved));
  assert.equal(ran.status, 0, ran.stderr);
  const body = bodyOf(ran);
  assert.equal(body.outcome, OUTCOMES.unknown);
  assert.equal(body.useful, false);
  assert.equal(body.reason, REASONS.fieldsAbsent);
  assert.deepEqual(body.decision.absentFields, ["status"]);
  assert.deepEqual(body.decision.unchangedFields, ["title"]);
});

test("CLI stale capture preserves the node startTime", () => {
  const ran = receive(["--clock", "2026-11-06T00:00:00.000Z", "--horizon", "1"]);
  assert.equal(ran.status, 0, ran.stderr);
  const body = bodyOf(ran);
  assert.equal(body.outcome, OUTCOMES.stale);
  assert.equal(body.useful, false);
  assert.equal(body.reason, REASONS.captureStale);
  assert.equal(body.freshness.captureAt, CAPTURE_AT);
  assert.equal(body.freshness.clock, "2026-11-06T00:00:00.000Z");
  assert.equal(body.freshness.withinHorizon, false);
});

test("CLI rejects a wrong workflow id and a wrong execution id", () => {
  const wrongWorkflow = receive(["--workflow-id", "not-the-workflow"]);
  assert.equal(wrongWorkflow.status, 1, wrongWorkflow.stderr);
  const workflowBody = bodyOf(wrongWorkflow);
  assert.equal(workflowBody.ok, false);
  assert.equal(workflowBody.useful, false);
  assert.equal(workflowBody.outcome, OUTCOMES.unknown);
  assert.equal(workflowBody.reason, REASONS.executionIdentityMismatch);
  assert.deepEqual(workflowBody.decision.changedFields, []);
  assert.equal(workflowBody.freshness.captureAt, null);

  const wrongExecution = receive(["--execution-id", "9"]);
  assert.equal(wrongExecution.status, 1);
  const executionBody = bodyOf(wrongExecution);
  assert.equal(executionBody.reason, REASONS.executionIdentityMismatch);
  assert.equal(executionBody.useful, false);
  assert.deepEqual(executionBody.decision.unchangedFields, []);
});

test("CLI missing node does not switch to another node", () => {
  const saved = load(SIBLING);
  saved.data.resultData.runData["HTTP Request"] = [{
    startTime: 1793911648165,
    executionStatus: "success",
    data: { main: [[{ json: { title: "DECOY NODE", status: "no" } }]] },
  }];
  const path = tempJson("two-nodes.json", saved);
  const selected = receive([], path);
  assert.equal(selected.status, 0, selected.stderr);
  const selectedBody = bodyOf(selected);
  assert.equal(selectedBody.outcome, OUTCOMES.usefulNoChange);
  assert.equal(selectedBody.freshness.captureAt, CAPTURE_AT);

  const missing = receive(["--node", "Missing Node"], path);
  assert.equal(missing.status, 0, missing.stderr);
  const missingBody = bodyOf(missing);
  assert.equal(missingBody.ok, true);
  assert.equal(missingBody.outcome, OUTCOMES.unavailable);
  assert.equal(missingBody.useful, false);
  assert.equal(missingBody.reason, REASONS.executionNodeMissing);
  assert.equal(missingBody.freshness.captureAt, null);
  assert.deepEqual(missingBody.decision.changedFields, []);
  assert.equal(JSON.stringify(missingBody.decision).includes("DECOY NODE"), false);

  const wrongCase = receive(["--node", "shape capture fields"], path);
  assert.equal(bodyOf(wrongCase).reason, REASONS.executionNodeMissing);
});

test("CLI malformed and oversized input stop before evaluation", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-n8n-bad-"));
  const malformed = join(dir, "malformed.json");
  writeFileSync(malformed, "{\"execution\":");
  const bad = receive([], malformed);
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, "");
  const err = JSON.parse(bad.stderr);
  assert.equal(err.ok, false);
  assert.equal(String(err.message).includes("useful_no_change"), false);

  const oversized = join(dir, "oversized.json");
  writeFileSync(oversized, Buffer.alloc(INPUT_MAX_BYTES + 1, 0x7b));
  const huge = receive([], oversized);
  assert.equal(huge.status, 1);
  assert.equal(huge.stdout, "");
  const hugeErr = JSON.parse(huge.stderr);
  assert.equal(hugeErr.ok, false);
  assert.match(hugeErr.message, /exceeds/);
});

test("CLI ambiguous wrappers do not pick a payload", () => {
  const sibling = load(SIBLING);
  const both = {
    derived: true,
    execution: {
      ...sibling.execution,
      data: {
        resultData: {
          runData: {
            [NODE]: [{
              startTime: 1793911643165,
              executionStatus: "success",
              data: { main: [[{ json: { title: "NESTED DECOY", status: "ok" } }]] },
            }],
          },
        },
      },
    },
    data: sibling.data,
  };
  const bothRun = receive([], tempJson("both.json", both));
  assert.equal(bothRun.status, 1);
  const bothBody = bodyOf(bothRun);
  assert.equal(bothBody.reason, REASONS.executionAmbiguous);
  assert.equal(bothBody.useful, false);
  assert.deepEqual(bothBody.decision.changedFields, []);
  assert.deepEqual(bothBody.decision.unchangedFields, []);
  assert.equal(JSON.stringify(bothBody.decision).includes("NESTED DECOY"), false);
  assert.equal(JSON.stringify(bothBody.decision).includes("Example Domain"), false);

  const mixed = { ...sibling, id: EXECUTION, workflowId: WORKFLOW };
  const mixedRun = receive([], tempJson("mixed.json", mixed));
  assert.equal(mixedRun.status, 1);
  assert.equal(bodyOf(mixedRun).reason, REASONS.executionAmbiguous);

  const listRun = receive([], tempJson("list.json", [sibling]));
  assert.equal(listRun.status, 1);
  assert.equal(bodyOf(listRun).reason, REASONS.executionAmbiguous);
});

test("CLI nested document matches the sibling envelope", () => {
  const sibling = bodyOf(receive(["--reference", EXPECT_NO_CHANGE]));
  const nested = bodyOf(receive(["--reference", EXPECT_NO_CHANGE], NESTED));
  assert.equal(nested.outcome, sibling.outcome);
  assert.equal(nested.reason, sibling.reason);
  assert.equal(nested.useful, sibling.useful);
  assert.equal(nested.freshness.captureAt, sibling.freshness.captureAt);
  assert.equal(nested.freshness.clock, sibling.freshness.clock);
  assert.deepEqual(nested.decision.changedFields, sibling.decision.changedFields);
  assert.deepEqual(nested.decision.unchangedFields, sibling.decision.unchangedFields);
  assert.equal(nested.decision.digestCapture, sibling.decision.digestCapture);
  assert.equal(nested.decision.digestPrior, sibling.decision.digestPrior);
});

test("CLI accepts data nested only inside execution", () => {
  const sibling = load(SIBLING);
  const saved = {
    derived: true,
    fixtureLabel: "derived",
    execution: { ...sibling.execution, data: sibling.data },
  };
  const ran = receive([], tempJson("inside.json", saved));
  assert.equal(ran.status, 0, ran.stderr);
  const body = bodyOf(ran);
  assert.equal(body.outcome, OUTCOMES.usefulNoChange);
  assert.equal(body.freshness.captureAt, CAPTURE_AT);
  assert.notEqual(body.freshness.captureAt, sibling.execution.startedAt);
});

test("CLI does not replace a missing or invalid startTime with the clock", () => {
  const missing = load(SIBLING);
  delete missing.data.resultData.runData[NODE][0].startTime;
  const missingRun = receive([], tempJson("missing-time.json", missing));
  assert.equal(missingRun.status, 1);
  const missingBody = bodyOf(missingRun);
  assert.equal(missingBody.reason, REASONS.executionCaptureTimeMissing);
  assert.equal(missingBody.useful, false);
  assert.equal(missingBody.freshness.captureAt, null);
  assert.equal(missingBody.freshness.clock, CLOCK);
  assert.notEqual(missingBody.freshness.captureAt, missingBody.freshness.clock);
  assert.notEqual(missingBody.freshness.captureAt, missing.execution.startedAt);

  const invalid = load(SIBLING);
  invalid.data.resultData.runData[NODE][0].startTime = "not-a-time";
  const invalidRun = receive([], tempJson("invalid-time.json", invalid));
  assert.equal(invalidRun.status, 1);
  const invalidBody = bodyOf(invalidRun);
  assert.equal(invalidBody.reason, REASONS.executionCaptureTimeInvalid);
  assert.equal(invalidBody.freshness.captureAt, null);
  assert.equal(invalidBody.freshness.clock, CLOCK);

  const numericId = load(SIBLING);
  numericId.execution.id = 2;
  const numericRun = receive([], tempJson("numeric-id.json", numericId));
  assert.equal(numericRun.status, 1);
  assert.equal(bodyOf(numericRun).reason, REASONS.executionIdentityIncomplete);
});

test("CLI rejects unsuccessful status without reading another node", () => {
  const saved = load(SIBLING);
  saved.execution.status = "error";
  saved.data.resultData.runData["Other Node"] = [{
    startTime: 1793911643165,
    executionStatus: "success",
    data: { main: [[{ json: { title: "Example Domain", status: "ok" } }]] },
  }];
  const ran = receive([], tempJson("error-status.json", saved));
  assert.equal(ran.status, 1);
  const body = bodyOf(ran);
  assert.equal(body.reason, REASONS.executionStatusRejected);
  assert.equal(body.useful, false);
  assert.equal(body.outcome, OUTCOMES.unknown);
  assert.deepEqual(body.decision.unchangedFields, []);

  const nodeError = load(SIBLING);
  nodeError.data.resultData.runData[NODE][0].executionStatus = "error";
  const nodeRun = receive([], tempJson("node-error.json", nodeError));
  assert.equal(nodeRun.status, 1);
  assert.equal(bodyOf(nodeRun).reason, REASONS.executionStatusRejected);

  const unfinished = load(SIBLING);
  unfinished.execution.finished = false;
  const unfinishedRun = receive([], tempJson("unfinished.json", unfinished));
  assert.equal(unfinishedRun.status, 1);
  assert.equal(bodyOf(unfinishedRun).reason, REASONS.executionStatusRejected);

  const noStatus = load(SIBLING);
  delete noStatus.execution.status;
  const noStatusRun = receive([], tempJson("no-status.json", noStatus));
  assert.equal(noStatusRun.status, 1);
  assert.equal(bodyOf(noStatusRun).reason, REASONS.executionStatusRejected);
});

test("CLI multiple runs and items are ambiguous", () => {
  const runs = load(SIBLING);
  runs.data.resultData.runData[NODE].push(runs.data.resultData.runData[NODE][0]);
  const runsResult = receive([], tempJson("runs.json", runs));
  assert.equal(runsResult.status, 1);
  assert.equal(bodyOf(runsResult).reason, REASONS.executionAmbiguous);

  const items = load(SIBLING);
  const item = items.data.resultData.runData[NODE][0].data.main[0][0];
  items.data.resultData.runData[NODE][0].data.main[0].push(item);
  const itemsResult = receive([], tempJson("items.json", items));
  assert.equal(itemsResult.status, 1);
  assert.equal(bodyOf(itemsResult).reason, REASONS.executionAmbiguous);
});

test("CLI ISO startTime is kept and a useful result updates the same state schema", () => {
  const saved = load(SIBLING);
  saved.data.resultData.runData[NODE][0].startTime = CAPTURE_AT;
  delete saved.execution.finished;
  const dir = mkdtempSync(join(tmpdir(), "rdc-n8n-keep-"));
  const state = join(dir, "state.json");
  const ran = receive(["--state", state], tempJson("iso.json", saved));
  assert.equal(ran.status, 0, ran.stderr);
  const body = bodyOf(ran);
  assert.equal(body.outcome, OUTCOMES.usefulNoChange);
  assert.equal(body.freshness.captureAt, CAPTURE_AT);
  assert.equal(body.stateSequence, 1);
  const shown = showState(state);
  assert.equal(shown.ok, true);
  assert.equal(shown.state.schema, STATE_SCHEMA);
  assert.equal(shown.state.sequence, 1);
  assert.equal(shown.state.retainedResult.outcome, OUTCOMES.usefulNoChange);

  const rejected = receive(["--execution-id", "9", "--state", state], tempJson("iso.json", saved));
  assert.equal(rejected.status, 1);
  const after = showState(state);
  assert.equal(after.state.sequence, 1);
  assert.equal(after.state.retainedResult.outcome, OUTCOMES.usefulNoChange);
});

test("legacy evaluate CLI still accepts the permitted-capture fixtures", () => {
  const ran = spawnSync(process.execPath, [
    cli, "evaluate",
    "--intent", INTENT,
    "--prior", PRIOR,
    "--capture", join(fixtures, "captures/same.json"),
    "--clock", "2026-11-05T12:00:00.000Z",
    "--horizon", "24",
    "--reference", EXPECT_NO_CHANGE,
  ], { encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
  const body = JSON.parse(ran.stdout);
  assert.equal(body.outcome, OUTCOMES.usefulNoChange);
  assert.equal(body.useful, true);
  assert.equal(body.controls.referenceMatched, true);
});
