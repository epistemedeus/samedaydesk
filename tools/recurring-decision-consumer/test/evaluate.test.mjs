import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateDecision } from "../src/evaluate.mjs";
import { removeState, showState, updateState } from "../src/state.mjs";
import { receiveEvaluateRequest } from "../src/http-adapter.mjs";
import { buildSafeCommand, exportWorkflowStub, shellSingleQuote } from "../src/workflow.mjs";
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
  assert.equal(result.useful, false);
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
  assert.equal(result.useful, false);
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

test("payload_digest ignores misleading equal contentHash when selected fields differ", () => {
  const intent = { ...load("intents/watch-title.json"), compare: "payload_digest" };
  const prior = {
    ...load("captures/prior.json"),
    contentHash: "sha256:same-misleading-hash",
    payload: { title: "Example Domain", status: "ok", ignored: 1 },
  };
  const capture = {
    ...load("captures/same.json"),
    contentHash: "sha256:same-misleading-hash",
    payload: { title: "Example Domain Updated", status: "ok", ignored: 1 },
  };
  const result = evaluateDecision({
    intent,
    prior,
    capture,
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.outcome, OUTCOMES.usefulChange);
  assert.equal(result.useful, true);
  assert.equal(result.reason, REASONS.digestsDiffer);
  assert.notEqual(result.decision.digestPrior, result.decision.digestCapture);
});

test("payload_digest ignores misleading unequal contentHash when selected fields match", () => {
  const intent = { ...load("intents/watch-title.json"), compare: "payload_digest" };
  const prior = {
    ...load("captures/prior.json"),
    contentHash: "sha256:hash-prior",
    payload: { title: "Example Domain", status: "ok", ignored: "aaa" },
  };
  const capture = {
    ...load("captures/same.json"),
    contentHash: "sha256:hash-capture-different",
    payload: { title: "Example Domain", status: "ok", ignored: "bbb" },
  };
  const result = evaluateDecision({
    intent,
    prior,
    capture,
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(result.useful, true);
  assert.equal(result.reason, REASONS.digestsMatch);
  assert.equal(result.decision.digestPrior, result.decision.digestCapture);
});

test("field_equality treats fields absent on both sides as unknown, not useful_no_change", () => {
  const intent = load("intents/watch-title.json");
  const prior = { ...load("captures/prior.json"), payload: { title: "Example Domain" } };
  const capture = { ...load("captures/same.json"), payload: { title: "Example Domain" } };
  const result = evaluateDecision({
    intent,
    prior,
    capture,
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.outcome, OUTCOMES.unknown);
  assert.equal(result.useful, false);
  assert.equal(result.reason, REASONS.fieldsAbsent);
  assert.deepEqual(result.decision.changedFields, []);
  assert.deepEqual(result.decision.unchangedFields, ["title"]);
  assert.deepEqual(result.decision.absentFields, ["status"]);
});

test("field_equality all-fields absent on both sides is unknown, not useful_no_change", () => {
  const intent = load("intents/watch-title.json");
  const prior = { ...load("captures/prior.json"), payload: {} };
  const capture = { ...load("captures/same.json"), payload: {} };
  const result = evaluateDecision({
    intent,
    prior,
    capture,
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.outcome, OUTCOMES.unknown);
  assert.equal(result.useful, false);
  assert.equal(result.reason, REASONS.fieldsAbsent);
  assert.deepEqual(result.decision.changedFields, []);
  assert.deepEqual(result.decision.unchangedFields, []);
  assert.deepEqual(result.decision.absentFields, ["title", "status"]);
});

test("field_equality still reports useful_change when present fields differ even if others are absent both", () => {
  const intent = load("intents/watch-title.json");
  const prior = { ...load("captures/prior.json"), payload: { title: "Example Domain" } };
  const capture = { ...load("captures/changed.json"), payload: { title: "Example Domain Updated" } };
  const result = evaluateDecision({
    intent,
    prior,
    capture,
    clock: CLOCK,
    horizonHours: HORIZON,
  });
  assert.equal(result.outcome, OUTCOMES.usefulChange);
  assert.equal(result.useful, true);
  assert.equal(result.reason, REASONS.fieldsDiffer);
  assert.deepEqual(result.decision.changedFields, ["title"]);
  assert.deepEqual(result.decision.absentFields, ["status"]);
});

test("falseChange and missedChange leave CLI state untouched", () => {
  // CLI caches only when result.ok && result.useful (cli.mjs evaluate gate).
  const dir = mkdtempSync(join(tmpdir(), "rdc-ctrl-"));
  const falseState = join(dir, "false-state.json");
  const falseRun = spawnSync(process.execPath, [
    cli, "evaluate",
    "--intent", join(fixtures, "intents/watch-title.json"),
    "--prior", join(fixtures, "captures/prior.json"),
    "--capture", join(fixtures, "captures/changed.json"),
    "--clock", CLOCK,
    "--horizon", String(HORIZON),
    "--reference", join(fixtures, "reference/expect-no-change.json"),
    "--state", falseState,
  ], { encoding: "utf8" });
  assert.equal(falseRun.status, 0, falseRun.stderr);
  const falseBody = JSON.parse(falseRun.stdout);
  assert.equal(falseBody.ok, true);
  assert.equal(falseBody.useful, false);
  assert.equal(falseBody.outcome, OUTCOMES.usefulChange);
  assert.equal(falseBody.controls.falseChange, true);
  assert.equal(falseBody.reason, REASONS.referenceFalseChange);
  assert.equal(existsSync(falseState), false);

  const missedState = join(dir, "missed-state.json");
  const missedRun = spawnSync(process.execPath, [
    cli, "evaluate",
    "--intent", join(fixtures, "intents/watch-title.json"),
    "--prior", join(fixtures, "captures/prior.json"),
    "--capture", join(fixtures, "captures/same.json"),
    "--clock", CLOCK,
    "--horizon", String(HORIZON),
    "--reference", join(fixtures, "reference/expect-change.json"),
    "--state", missedState,
  ], { encoding: "utf8" });
  assert.equal(missedRun.status, 0, missedRun.stderr);
  const missedBody = JSON.parse(missedRun.stdout);
  assert.equal(missedBody.ok, true);
  assert.equal(missedBody.useful, false);
  assert.equal(missedBody.outcome, OUTCOMES.usefulNoChange);
  assert.equal(missedBody.controls.missedChange, true);
  assert.equal(missedBody.reason, REASONS.referenceMissedChange);
  assert.equal(existsSync(missedState), false);

  const goodState = join(dir, "good-state.json");
  const goodRun = spawnSync(process.execPath, [
    cli, "evaluate",
    "--intent", join(fixtures, "intents/watch-title.json"),
    "--prior", join(fixtures, "captures/prior.json"),
    "--capture", join(fixtures, "captures/same.json"),
    "--clock", CLOCK,
    "--horizon", String(HORIZON),
    "--reference", join(fixtures, "reference/expect-no-change.json"),
    "--state", goodState,
  ], { encoding: "utf8" });
  assert.equal(goodRun.status, 0, goodRun.stderr);
  const goodBody = JSON.parse(goodRun.stdout);
  assert.equal(goodBody.ok, true);
  assert.equal(goodBody.useful, true);
  assert.equal(existsSync(goodState), true);
});

test("shellSingleQuote and buildSafeCommand quote metacharacters", () => {
  const nasty = "dir/file; rm -rf / --flags && echo $PATH";
  const quoted = shellSingleQuote(nasty);
  assert.equal(quoted, "'dir/file; rm -rf / --flags && echo $PATH'");
  const withQuote = shellSingleQuote("foo'bar");
  assert.equal(withQuote, "'foo'\\''bar'");
  const cmd = buildSafeCommand([
    "node",
    "tools/recurring-decision-consumer/cli.mjs",
    "evaluate",
    "--intent",
    nasty,
  ]);
  assert.equal(
    cmd,
    "'node' 'tools/recurring-decision-consumer/cli.mjs' 'evaluate' '--intent' 'dir/file; rm -rf / --flags && echo $PATH'",
  );
  assert.equal(cmd.includes(` --intent ${nasty}`), false);
  assert.equal(cmd.includes(" --intent dir/file;"), false);
});

test("verified n8n export uses HTTP Request and webhook, never executeCommand", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-wf-safe-"));
  const out = join(dir, "wf.json");
  const exported = exportWorkflowStub({ runtime: "n8n", out, verified: true });
  assert.equal(exported.ok, true);
  assert.equal(exported.primaryVerifiedShape, "native-argv");
  assert.equal(exported.verifiedMeans, "live_schema_or_mcp_probe_not_flag");
  assert.ok(exported.message.includes("insufficient"));
  const raw = readFileSync(out, "utf8");
  const body = JSON.parse(raw);
  assert.equal(raw.includes("n8n-nodes-base.executeCommand"), false);
  assert.equal(body.nodes.some((node) => /executeCommand/i.test(node.type || "")), false);
  const types = body.nodes.map((node) => node.type);
  assert.deepEqual(types, ["n8n-nodes-base.webhook", "n8n-nodes-base.httpRequest"]);
  const httpNode = body.nodes.find((node) => node.type === "n8n-nodes-base.httpRequest");
  assert.equal(httpNode.parameters.method, "POST");
  assert.equal(httpNode.parameters.url, "={{$json.evaluateUrl}}");
  assert.equal(httpNode.parameters.sendBody, true);
  assert.ok(String(httpNode.parameters.jsonBody).includes("$json.intent"));
  assert.equal(body.meta.instanceBase, "https://neomorphic.app.n8n.cloud");
  assert.equal(body.meta.apiLocator, "KCH-0939616A8FF4997851894232");
  assert.equal(body.meta.mcpLocator, "KCH-AE454DDB4C2532D780A0E689");
  assert.equal(body.meta.mcpPath, "/mcp-server/http");
  assert.equal(body.meta.verifiedMeans, "live_schema_or_mcp_probe_not_flag");
  assert.equal(body.meta.executeCommand, false);
  assert.ok(body.meta.verifiedMeaning.includes("insufficient"));
  assert.match(raw, /KCH-0939616A8FF4997851894232/);
  assert.match(raw, /KCH-AE454DDB4C2532D780A0E689/);
  assert.doesNotMatch(raw, /X-N8N-API-KEY\s*[:=]\s*\S+/);
  assert.doesNotMatch(raw, /Bearer\s+[A-Za-z0-9._-]+/);
});

test("verified native export is the primary argv shape", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-wf-nat-"));
  const out = join(dir, "native.json");
  const exported = exportWorkflowStub({ runtime: "native", out, verified: true });
  assert.equal(exported.ok, true);
  const body = JSON.parse(readFileSync(out, "utf8"));
  assert.ok(Array.isArray(body.argv));
  assert.equal(body.argv[0], "evaluate");
  assert.ok(body.note.includes("Primary verified export shape"));
  assert.ok(body.note.includes("solid direct baseline"));
  assert.equal(body.verifiedMeans, "live_schema_or_mcp_probe_not_flag");
  assert.ok(body.verifiedMeaning.includes("caller assertion"));
});

test("HTTP adapter POSTs evaluate inputs and returns useful_no_change", () => {
  const response = receiveEvaluateRequest({
    method: "POST",
    body: {
      intent: load("intents/watch-title.json"),
      prior: load("captures/prior.json"),
      capture: load("captures/same.json"),
      clock: CLOCK,
      horizonHours: HORIZON,
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.outcome, OUTCOMES.usefulNoChange);
  assert.equal(response.body.useful, true);
});

test("HTTP adapter reports useful_change for changed selected fields", () => {
  const response = receiveEvaluateRequest({
    method: "POST",
    body: {
      intent: load("intents/watch-title.json"),
      prior: load("captures/prior.json"),
      capture: load("captures/changed.json"),
      clock: CLOCK,
      horizonHours: HORIZON,
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.outcome, OUTCOMES.usefulChange);
  assert.equal(response.body.useful, true);
});

test("HTTP adapter rejects non-POST methods", () => {
  const response = receiveEvaluateRequest({
    method: "GET",
    body: { intent: load("intents/watch-title.json") },
  });
  assert.equal(response.status, 405);
  assert.equal(response.body.ok, false);
});

test("MCP tools/call adapter runs evaluate without executing n8n", () => {
  const response = receiveEvaluateRequest({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "evaluate",
      arguments: {
        intent: load("intents/watch-title.json"),
        prior: load("captures/prior.json"),
        capture: load("captures/same.json"),
        clock: CLOCK,
        horizonHours: String(HORIZON),
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.jsonrpc, "2.0");
  assert.equal(response.body.id, 7);
  assert.equal(response.body.result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(response.body.result.useful, true);
});

test("CLI receive-http maps a posted evaluate body", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-http-"));
  const requestPath = join(dir, "request.json");
  writeFileSync(requestPath, `${JSON.stringify({
    method: "POST",
    body: {
      intent: load("intents/watch-title.json"),
      prior: load("captures/prior.json"),
      capture: load("captures/changed.json"),
      clock: CLOCK,
      horizonHours: HORIZON,
    },
  })}\n`);
  const ran = spawnSync(process.execPath, [
    cli, "receive-http", "--request", requestPath,
  ], { encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
  const response = JSON.parse(ran.stdout);
  assert.equal(response.status, 200);
  assert.equal(response.body.outcome, OUTCOMES.usefulChange);
});
