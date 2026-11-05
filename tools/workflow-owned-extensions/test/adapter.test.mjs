import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { previewReuse, exportReuse, bindUsefulDecision } from "../../result-reuse/src/export.mjs";
import { invoke } from "../src/adapter.mjs";
import { INSTALLATION_STATUS, RUNTIME_EXECUTION_STATUS } from "../src/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../fixtures");

function loadInput(name) {
  return JSON.parse(readFileSync(join(fixtures, "inputs", name), "utf8"));
}

function loadOutput(name) {
  return JSON.parse(readFileSync(join(fixtures, "outputs", name), "utf8"));
}

const n45 = loadInput("fitting-n45-page-change.json");
const chat = loadInput("nonfitting-unrecognized-chat-task.json");
const before = loadInput("fitting-before-work.json");
const produced = loadInput("fitting-produced-decision.json");
const pageChange = JSON.parse(readFileSync(join(here, "../../result-reuse/fixtures/accepted-page-change.json"), "utf8"));

const n45Options = {
  task_id: "n45-example-com",
  subject: "n45-example-com-result",
  sequence: 1,
  clock: "2026-09-09T08:00:00.000Z",
};

test("fitting n45 preview reuses the SDK and matches the retained fixture", () => {
  const result = invoke({ consumer: "dify", tool: "preview_reuse", input: n45, ...n45Options });
  assert.deepEqual(result, loadOutput("fitting-preview-n45.json"));
  const direct = previewReuse(n45, {
    taskId: n45Options.task_id,
    subject: n45Options.subject,
    sequence: n45Options.sequence,
    clock: n45Options.clock,
  });
  assert.equal(direct.ok, true);
  assert.deepEqual(result.sdk.observation, direct.observation);
  assert.equal(result.runtimeExecutionStatus, RUNTIME_EXECUTION_STATUS);
  assert.equal(result.installationStatus, INSTALLATION_STATUS);
  assert.equal(result.runtimeCalled, false);
  assert.equal(result.executionPath, "direct_sdk_fallback");
  assert.equal(result.catalogListed, false);
  assert.equal(result.hostedCodeExecution, false);
});

test("fitting accepted page-change preview stays useful and retains its output", () => {
  const result = invoke({
    consumer: "dify",
    tool: "preview_reuse",
    input: pageChange,
    task_id: "rfq-and-vendor-page-watch",
    subject: "rfq-and-vendor-page-watch-result",
    sequence: 1,
    clock: "2026-09-09T10:00:00.000Z",
  });
  assert.deepEqual(result, loadOutput("fitting-preview-page-change.json"));
  assert.equal(result.fitting, true);
  assert.equal(result.recognizedKind, "page_change_brief");
  assert.equal(result.sdk.observation.payload.verdict, "changed");
});

test("a non-fitting chat task returns a useful direct route without forcing the tool", () => {
  const result = invoke({ consumer: "dify", tool: "preview_reuse", input: chat, ...n45Options });
  assert.deepEqual(result, loadOutput("nonfitting-unrecognized.json"));
  assert.equal(result.ok, true);
  assert.equal(result.fitting, false);
  assert.equal(result.capabilityApplied, false);
  assert.match(result.usefulDirectRoute.cli, /tools\/result-reuse\/cli\.mjs/);
  assert.equal(result.runtimeExecutionStatus, RUNTIME_EXECUTION_STATUS);
});

test("a recognized result missing task identity is a precise refusal", () => {
  const result = invoke({
    consumer: "dify",
    tool: "preview_reuse",
    input: n45,
    subject: n45Options.subject,
    sequence: 1,
    clock: n45Options.clock,
  });
  assert.deepEqual(result, loadOutput("nonfitting-missing-identity.json"));
  assert.equal(result.ok, false);
  assert.equal(result.fitting, true);
  assert.match(result.message, /task-id/);
});

test("export without opt-in reuses the SDK refusal", () => {
  const result = invoke({ consumer: "dify", tool: "export_reuse", input: n45, ...n45Options });
  assert.deepEqual(result, loadOutput("nonfitting-export-without-opt-in.json"));
  assert.equal(result.ok, false);
  const matched = exportReuse(n45, {
    taskId: n45Options.task_id,
    subject: n45Options.subject,
    sequence: n45Options.sequence,
    clock: n45Options.clock,
  });
  assert.equal(matched.ok, false);
  assert.equal(result.sdk.message, matched.message);
});

test("opt-in export matches the retained fixture and the SDK", () => {
  const result = invoke({ consumer: "dify", tool: "export_reuse", input: n45, ...n45Options, opt_in: true });
  assert.deepEqual(result, loadOutput("fitting-export-n45.json"));
  const direct = exportReuse(n45, {
    taskId: n45Options.task_id,
    subject: n45Options.subject,
    sequence: n45Options.sequence,
    clock: n45Options.clock,
    optIn: true,
  });
  assert.equal(direct.ok, true);
  assert.deepEqual(result.sdk.observation, direct.observation);
});

test("decide-or-reuse binds a public synthetic decision without calling a producer", () => {
  const result = invoke({
    consumer: "dify",
    tool: "decide_or_reuse",
    input: before,
    produced,
    task_id: "source-change-example",
    subject: "source-change-example-decision",
    sequence: 1,
    clock: "2026-09-09T08:00:00.000Z",
    horizon: 168,
    opt_in: true,
  });
  assert.deepEqual(result, loadOutput("fitting-decide-or-reuse-bind.json"));
  const direct = bindUsefulDecision(before, produced, {
    taskId: "source-change-example",
    subject: "source-change-example-decision",
    sequence: 1,
    clock: "2026-09-09T08:00:00.000Z",
    horizonHours: 168,
    optIn: true,
  });
  assert.equal(direct.ok, true);
  assert.equal(direct.producerInvoked, false);
  assert.deepEqual(result.sdk.observation, direct.observation);
});

test("the Ghost adapter projects an unpublished draft and does not call Ghost", () => {
  const result = invoke({ consumer: "ghost", tool: "preview_reuse", input: n45, ...n45Options });
  assert.deepEqual(result, loadOutput("fitting-ghost-preview-n45.json"));
  assert.equal(result.runtime, "ghost");
  assert.equal(result.ghostDraft.projected, true);
  assert.equal(result.ghostDraft.published, false);
  assert.equal(result.ghostDraft.status, "draft");
  assert.equal(result.runtimeCalled, false);
  assert.equal(result.runtimeExecutionStatus, RUNTIME_EXECUTION_STATUS);
});
