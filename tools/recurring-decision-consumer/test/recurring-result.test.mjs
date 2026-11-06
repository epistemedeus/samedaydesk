import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { directRecurringResult } from "../src/direct-baseline.mjs";
import { buildEffortProbes, classifyOperating, measureWholeEffort, recurringView } from "../src/effort.mjs";
import { produceRecurringResult } from "../src/recurring-result.mjs";
import { sourceReceipt } from "../src/receipt.mjs";
import { showState } from "../src/state.mjs";
import { BUNDLE_OUTCOMES, OUTCOMES, REASONS, RECURRING_RESULT_SCHEMA } from "../src/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = join(root, "fixtures");
const cli = join(root, "cli.mjs");
const CLOCK = "2026-11-05T23:21:56.441Z";
const CAPTURE_AT = "2026-11-05T20:47:23.165Z";
const WORKFLOW = "eFUkVKYk8xXbM7LV";
const NODE = "Shape Capture Fields";

function load(relativePath) {
  return JSON.parse(readFileSync(join(fixtures, relativePath), "utf8"));
}

function baseInput(overrides = {}) {
  return {
    saved: load("n8n-stored/derived-sibling-execution-2.json"),
    capture: null,
    workflowId: WORKFLOW,
    executionId: "2",
    nodeName: NODE,
    intents: load("recurring/intents.json").intents,
    priors: load("recurring/priors.json"),
    references: { byIntent: {} },
    clock: CLOCK,
    horizonHours: 168,
    schedule: load("recurring/schedule.json"),
    stateDir: null,
    adapt: false,
    cancel: false,
    ownerQaPriors: true,
    ...overrides,
  };
}

function decision(result, intentId) {
  const found = result.decisions.find((item) => item.intentId === intentId);
  assert.ok(found, intentId);
  return found;
}

test("one stored capture answers multiple useful decisions", () => {
  const result = produceRecurringResult(baseInput({ adapt: true }));
  assert.equal(result.schema, RECURRING_RESULT_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.useful, true);
  assert.equal(result.outcome, BUNDLE_OUTCOMES.compared);
  assert.equal(result.changeScore, undefined);
  assert.equal(result.capture.derivedFixture, true);
  assert.equal(result.capture.newExecution, false);
  assert.equal(result.capture.newApiCall, false);
  assert.equal(result.capture.capturedAt, CAPTURE_AT);
  assert.equal(result.capture.envelope, "sibling");
  assert.equal(result.freshness.captureWithinHorizon, true);
  assert.equal(result.installation.status, "prepared");
  assert.equal(result.installation.installed, false);
  assert.equal(result.installation.workflowReuse, "existing-unpublished-no-new-charge");
  assert.equal(result.installation.newCharge, false);
  assert.equal(result.installation.standingWatcher, false);
  assert.equal(result.priorsClass, "owner-qa");
  assert.equal(result.customerObservation, false);
  assert.equal(result.decisions.length, 3);

  const title = decision(result, "watch-title");
  assert.equal(title.result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(title.result.useful, true);
  assert.equal(title.result.reason, REASONS.fieldsMatch);
  assert.equal(title.adaptation, null);

  const status = decision(result, "watch-status");
  assert.equal(status.result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(status.result.useful, true);
  assert.deepEqual(status.result.decision.unchangedFields, ["status"]);

  const drift = decision(result, "watch-title-drift");
  assert.equal(drift.result.outcome, OUTCOMES.usefulChange);
  assert.equal(drift.result.useful, true);
  assert.deepEqual(drift.result.decision.changedFields, ["title"]);
  assert.equal(drift.adaptation.applied, true);
  assert.equal(drift.adaptation.result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(drift.adaptation.result.useful, true);
  assert.deepEqual(drift.adaptation.before, { title: "Prior Different Title" });
  assert.deepEqual(drift.adaptation.after, { title: "Example Domain" });
  assert.deepEqual(result.adaptation.intentIds, ["watch-title-drift"]);
});

test("adapted prior is a later no-change on the same capture", () => {
  const first = produceRecurringResult(baseInput({ adapt: true }));
  const adaptedPrior = decision(first, "watch-title-drift").adaptation.adaptedPrior;
  const priors = structuredClone(load("recurring/priors.json"));
  priors.byIntent["watch-title-drift"] = adaptedPrior;
  const second = produceRecurringResult(baseInput({ priors, adapt: true }));
  const drift = decision(second, "watch-title-drift");
  assert.equal(drift.result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(drift.result.useful, true);
  assert.equal(drift.adaptation, null);
});

test("in-horizon and stale freshness stay on the decision", () => {
  const fresh = produceRecurringResult(baseInput());
  assert.equal(fresh.freshness.captureWithinHorizon, true);
  for (const item of fresh.decisions) assert.equal(item.result.freshness.withinHorizon, true);

  const schedule = structuredClone(load("recurring/schedule.json"));
  schedule.scope.horizonHours = 0;
  const stale = produceRecurringResult(baseInput({ horizonHours: 0, schedule }));
  assert.equal(stale.ok, true);
  assert.equal(stale.useful, false);
  assert.equal(stale.freshness.captureWithinHorizon, false);
  for (const item of stale.decisions) {
    assert.equal(item.result.outcome, OUTCOMES.stale);
    assert.equal(item.result.reason, REASONS.captureStale);
    assert.equal(item.result.useful, false);
    assert.deepEqual(item.result.decision.changedFields, []);
    assert.equal(item.adaptation, null);
  }
});

test("adaptation writes useful state and skips a false change", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-recur-"));
  const result = produceRecurringResult(baseInput({ adapt: true, stateDir: dir }));
  const driftState = showState(join(dir, "watch-title-drift.json"));
  assert.equal(driftState.ok, true);
  assert.equal(driftState.state.retainedResult.outcome, OUTCOMES.usefulNoChange);
  assert.equal(showState(join(dir, "watch-title.json")).state.retainedResult.outcome, OUTCOMES.usefulNoChange);

  const references = {
    byIntent: {
      "watch-title-drift": { expectedOutcome: OUTCOMES.usefulNoChange },
    },
  };
  const held = mkdtempSync(join(tmpdir(), "rdc-recur-hold-"));
  const refused = produceRecurringResult(baseInput({ adapt: false, stateDir: held, references }));
  const drift = decision(refused, "watch-title-drift");
  assert.equal(drift.result.controls.falseChange, true);
  assert.equal(drift.result.useful, false);
  assert.equal(drift.result.reason, REASONS.referenceFalseChange);
  assert.equal(drift.adaptation, null);
  assert.equal(showState(join(held, "watch-title-drift.json")).missing, true);
  assert.equal(showState(join(held, "watch-title.json")).state.sequence, 1);
});

test("cancellation removes portable state and does not run again", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-cancel-"));
  produceRecurringResult(baseInput({ adapt: true, stateDir: dir }));
  assert.equal(showState(join(dir, "watch-title.json")).ok, true);
  const cancelled = produceRecurringResult(baseInput({ cancel: true, stateDir: dir }));
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.outcome, BUNDLE_OUTCOMES.cancelled);
  assert.equal(cancelled.reason, REASONS.scheduleCancelled);
  assert.equal(cancelled.cancellation.cancelled, true);
  assert.equal(cancelled.cancellation.standingWatcher, false);
  assert.equal(cancelled.decisions.length, 0);
  assert.equal(cancelled.schedule.status, "cancelled");
  assert.deepEqual(cancelled.cancellation.removed.map((item) => item.removed), [true, true, true]);
  assert.equal(showState(join(dir, "watch-title.json")).missing, true);

  const again = produceRecurringResult(baseInput({
    schedule: cancelled.schedule,
    stateDir: dir,
    adapt: true,
  }));
  assert.equal(again.outcome, BUNDLE_OUTCOMES.cancelled);
  assert.equal(again.decisions.length, 0);
  assert.equal(showState(join(dir, "watch-status.json")).missing, true);
});

test("false and missed controls stay on their own intents", () => {
  const result = produceRecurringResult(baseInput({
    references: {
      byIntent: {
        "watch-title": { expectedOutcome: OUTCOMES.usefulChange },
        "watch-title-drift": { expectedOutcome: OUTCOMES.usefulNoChange },
      },
    },
  }));
  const title = decision(result, "watch-title");
  assert.equal(title.result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(title.result.controls.missedChange, true);
  assert.equal(title.result.useful, false);
  assert.equal(title.result.reason, REASONS.referenceMissedChange);
  const drift = decision(result, "watch-title-drift");
  assert.equal(drift.result.outcome, OUTCOMES.usefulChange);
  assert.equal(drift.result.controls.falseChange, true);
  assert.equal(drift.result.useful, false);
  const status = decision(result, "watch-status");
  assert.equal(status.result.useful, true);
  assert.equal(status.result.controls.falseChange, false);
  assert.equal(status.result.controls.missedChange, false);
});

test("ambiguous, missing, unsupported, and unknown dispositions are preserved", () => {
  const ambiguousSaved = load("n8n-stored/derived-sibling-execution-2.json");
  ambiguousSaved.execution.data = structuredClone(ambiguousSaved.data);
  const ambiguous = produceRecurringResult(baseInput({ saved: ambiguousSaved }));
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.outcome, OUTCOMES.unknown);
  assert.equal(ambiguous.reason, REASONS.executionAmbiguous);
  assert.equal(ambiguous.captureDisposition.preserved, true);
  assert.equal(ambiguous.decisions.length, 0);

  const missingSaved = load("n8n-stored/derived-sibling-execution-2.json");
  delete missingSaved.data.resultData.runData[NODE];
  const missing = produceRecurringResult(baseInput({ saved: missingSaved }));
  assert.equal(missing.ok, true);
  assert.equal(missing.outcome, OUTCOMES.unavailable);
  assert.equal(missing.reason, REASONS.executionNodeMissing);
  assert.equal(missing.captureDisposition.preserved, true);
  assert.equal(missing.decisions.length, 0);

  const intents = structuredClone(load("recurring/intents.json").intents);
  intents.push({
    schema: "samedaydesk.recurring-decision-intent.v1",
    intentId: "watch-other-subject",
    subject: "other-subject",
    fields: ["title"],
    compare: "field_equality",
  });
  const schedule = structuredClone(load("recurring/schedule.json"));
  schedule.scope.intentIds = [...schedule.scope.intentIds, "watch-other-subject"];
  const unsupported = produceRecurringResult(baseInput({ intents, schedule }));
  assert.equal(decision(unsupported, "watch-title").result.outcome, OUTCOMES.usefulNoChange);
  const other = decision(unsupported, "watch-other-subject");
  assert.equal(other.result.outcome, OUTCOMES.unsupported);
  assert.equal(other.result.reason, REASONS.subjectMismatch);
  assert.equal(other.result.useful, false);

  const unknownIntents = structuredClone(load("recurring/intents.json").intents);
  unknownIntents.push({
    schema: "samedaydesk.recurring-decision-intent.v1",
    intentId: "watch-absent-field",
    subject: "example-page",
    fields: ["notPresent"],
    compare: "field_equality",
  });
  const unknownSchedule = structuredClone(load("recurring/schedule.json"));
  unknownSchedule.scope.intentIds = [...unknownSchedule.scope.intentIds, "watch-absent-field"];
  const unknown = produceRecurringResult(baseInput({ intents: unknownIntents, schedule: unknownSchedule }));
  const absent = decision(unknown, "watch-absent-field");
  assert.equal(absent.result.outcome, OUTCOMES.unknown);
  assert.equal(absent.result.reason, REASONS.fieldsAbsent);
  assert.deepEqual(absent.result.decision.absentFields, ["notPresent"]);
  assert.equal(decision(unknown, "watch-status").result.useful, true);
});

test("a standing watcher schedule is refused before decisions", () => {
  const dir = mkdtempSync(join(tmpdir(), "rdc-watch-"));
  const schedule = structuredClone(load("recurring/schedule.json"));
  schedule.standingWatcher = true;
  const refused = produceRecurringResult(baseInput({ schedule, stateDir: dir, adapt: true }));
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, REASONS.invalidInput);
  assert.equal(refused.decisions.length, 0);
  assert.equal(refused.installation.standingWatcher, false);
  assert.equal(showState(join(dir, "watch-title.json")).missing, true);
});

test("maintained path matches the direct baseline on every probe", () => {
  const probes = buildEffortProbes({
    ...baseInput(),
    nestedSaved: load("n8n-stored/derived-nested-execution-2.json"),
  });
  assert.ok(probes.length >= 10);
  for (const probe of probes) {
    const maintained = recurringView(produceRecurringResult(probe.input));
    const direct = recurringView(directRecurringResult(probe.input));
    assert.deepEqual(direct, maintained, probe.name);
  }
});

test("whole effort records build, review, and operating time", () => {
  const report = measureWholeEffort({
    ...baseInput(),
    nestedSaved: load("n8n-stored/derived-nested-execution-2.json"),
  }, 11);
  assert.equal(report.parity, true);
  assert.equal(report.ok, true);
  assert.equal(report.changeScore, null);
  assert.equal(report.noChangeDecisionValid, true);
  assert.equal(report.build.maintainedIncrementalBytes > 0, true);
  assert.equal(report.build.directBytes > 0, true);
  assert.equal(report.build.retainedBytes > report.build.maintainedIncrementalBytes, true);
  assert.equal(report.review.maintainedNewSurfaceBytes > 0, true);
  assert.equal(report.review.directSurfaceBytes > 0, true);
  assert.equal(report.review.retainedSurfaceBytes > 0, true);
  assert.equal(report.operating.maintainedMedianNs > 0, true);
  assert.equal(report.operating.directMedianNs > 0, true);
  assert.equal(Number.isFinite(report.operating.ratio), true);
  assert.equal(typeof report.finding.noChange, "boolean");
  assert.equal(classifyOperating(1).noChange, true);
  assert.equal(classifyOperating(1).operating, "no_material_operating_difference");
  assert.equal(report.cases.some((item) => item.name === "in-horizon-multi" && item.match), true);
  assert.equal(report.cases.some((item) => item.name === "stale" && item.match), true);
  assert.equal(report.cases.some((item) => item.name === "cancellation" && item.match), true);
});

test("new source does not call n8n, install a watcher, or import the evaluator into the baseline", () => {
  const files = [
    "src/recurring-result.mjs",
    "src/direct-baseline.mjs",
    "src/effort.mjs",
    "src/schedule.mjs",
    "src/receipt.mjs",
  ];
  for (const relativePath of files) {
    const source = readFileSync(join(root, relativePath), "utf8");
    assert.equal(source.includes("fetch("), false, relativePath);
    assert.equal(source.includes("setInterval"), false, relativePath);
    assert.equal(source.includes("setTimeout"), false, relativePath);
    assert.equal(source.includes("http.request"), false, relativePath);
    assert.equal(source.includes("https.request"), false, relativePath);
    assert.equal(source.includes("X-N8N-API-KEY"), false, relativePath);
    assert.equal(source.includes("child_process"), false, relativePath);
  }
  const baseline = readFileSync(join(root, "src/direct-baseline.mjs"), "utf8");
  assert.equal(baseline.includes("evaluate.mjs"), false);
  assert.equal(baseline.includes("n8n-stored.mjs"), false);
  assert.equal(baseline.includes("recurring-result.mjs"), false);
  const maintained = readFileSync(join(root, "src/recurring-result.mjs"), "utf8");
  assert.match(maintained, /evaluateDecision/);
  assert.match(maintained, /readStoredCapture/);
});

test("CLI recur, effort, and receipt", () => {
  const recur = spawnSync(process.execPath, [
    cli, "recur",
    "--saved", join(fixtures, "n8n-stored/derived-sibling-execution-2.json"),
    "--workflow-id", WORKFLOW,
    "--execution-id", "2",
    "--node", NODE,
    "--intents", join(fixtures, "recurring/intents.json"),
    "--priors", join(fixtures, "recurring/priors.json"),
    "--schedule", join(fixtures, "recurring/schedule.json"),
    "--clock", CLOCK,
    "--horizon", "168",
    "--adapt",
  ], { encoding: "utf8" });
  assert.equal(recur.status, 0, recur.stderr);
  const body = JSON.parse(recur.stdout);
  assert.equal(body.outcome, BUNDLE_OUTCOMES.compared);
  assert.equal(body.useful, true);
  assert.equal(decision(body, "watch-title").result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(decision(body, "watch-title-drift").adaptation.applied, true);

  const effort = spawnSync(process.execPath, [
    cli, "effort",
    "--saved", join(fixtures, "n8n-stored/derived-sibling-execution-2.json"),
    "--nested", join(fixtures, "n8n-stored/derived-nested-execution-2.json"),
    "--workflow-id", WORKFLOW,
    "--execution-id", "2",
    "--node", NODE,
    "--intents", join(fixtures, "recurring/intents.json"),
    "--priors", join(fixtures, "recurring/priors.json"),
    "--schedule", join(fixtures, "recurring/schedule.json"),
    "--clock", CLOCK,
    "--horizon", "168",
  ], { encoding: "utf8" });
  assert.equal(effort.status, 0, effort.stderr);
  const report = JSON.parse(effort.stdout);
  assert.equal(report.parity, true);
  assert.equal(report.noChangeDecisionValid, true);

  const receipt = spawnSync(process.execPath, [cli, "receipt"], { encoding: "utf8" });
  assert.equal(receipt.status, 0, receipt.stderr);
  const receiptBody = JSON.parse(receipt.stdout);
  assert.equal(receiptBody.prepared, true);
  assert.equal(receiptBody.installed, false);
  assert.equal(receiptBody.outsideUse, "none");
  assert.equal(receiptBody.payment, "none");
  assert.equal(receiptBody.workflow.newCharge, false);
  assert.equal(receiptBody.native.writer, "tools/recurring-decision-consumer");
  assert.equal(typeof receiptBody.native.executable, "string");
  assert.equal(typeof receiptBody.native.pid, "number");
});

test("receipt reads the live process and does not invent payment", () => {
  const receipt = sourceReceipt({
    AE14_NATIVE_EFFORT: "xhigh",
    GROK_SESSION_ID: "session-test",
    AE14_HOST: "h3",
  });
  assert.equal(receipt.prepared, true);
  assert.equal(receipt.installed, false);
  assert.equal(receipt.payment, "none");
  assert.equal(receipt.outsideUse, "none");
  assert.equal(receipt.native.catalogEffort, "xhigh");
  assert.equal(receipt.native.session, "session-test");
  assert.equal(receipt.native.vm, "h3");
  assert.equal(receipt.native.pid, process.pid);
  assert.equal(receipt.workflow.id, WORKFLOW);
});

test("nested envelope selects the same capture fields", () => {
  const nested = produceRecurringResult(baseInput({
    saved: load("n8n-stored/derived-nested-execution-2.json"),
  }));
  assert.equal(nested.ok, true);
  assert.equal(nested.capture.envelope, "nested-document");
  assert.equal(nested.capture.capturedAt, CAPTURE_AT);
  assert.equal(decision(nested, "watch-title").result.outcome, OUTCOMES.usefulNoChange);
  assert.equal(decision(nested, "watch-title-drift").result.outcome, OUTCOMES.usefulChange);
});
