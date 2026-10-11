import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonical } from "../src/canonical.mjs";
import { QUOTE_SUCCESS } from "../src/consumer-contract.mjs";
import { consumeQualified } from "../src/consume.mjs";

const NOW = "2026-10-11T12:10:00.000Z";
const repo = fileURLToPath(new URL("../../..", import.meta.url));

function load(name) {
  return JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
}

function catalog() {
  return load("../acquired/normalized.json");
}

function task() {
  return load("../fixtures/tasks/free-readiness.json");
}

function input(extra = {}) {
  return { ...load("../fixtures/consumer/quote-decimal.json"), ...extra };
}

test("the caller success file matches the predeclared contract", () => {
  const spec = load("../fixtures/consumer/quote-decimal.json");
  assert.equal(canonical(spec.success), canonical(QUOTE_SUCCESS));
  assert.equal(spec.meaningId, "quote-decimal-label");
});

test("a shell string is refused before the consumer is loaded", async () => {
  const journey = await consumeQualified({
    catalog: catalog(),
    task: task(),
    callerInput: input({ command: "node tools/l08-agent-repair/cold-client.mjs task-readiness" }),
    repoRoot: "/tmp/not-a-consumer-repo",
    now: NOW,
  });
  assert.equal(journey.invocation.state, "not_invoked");
  assert.equal(journey.invocation.reason, "command_refused");
  assert.equal(journey.invocation.coldStartExecuted, false);
  assert.equal(journey.stages.acceptance, "not_observed");
});

test("stale, expired, and absent readiness sources are not invoked", async () => {
  const base = catalog();
  const fresh = structuredClone(base);
  fresh.entries = fresh.entries.filter((entry) => entry.id !== "discovery:task-readiness");
  const stale = await consumeQualified({
    catalog: base,
    task: task(),
    callerInput: input(),
    repoRoot: "/tmp/not-a-consumer-repo",
    freshCatalog: fresh,
    now: NOW,
  });
  assert.equal(stale.invocation.state, "not_invoked");
  assert.equal(stale.blocked[0].reasons.includes("stale_source"), true);

  const expiredCatalog = structuredClone(base);
  const expiredEntry = expiredCatalog.entries.find((entry) => entry.id === "discovery:task-readiness");
  expiredEntry.expiresAt = "2020-01-01T00:00:00.000Z";
  expiredEntry.expiryState = "known";
  const expired = await consumeQualified({
    catalog: expiredCatalog,
    task: task(),
    callerInput: input(),
    repoRoot: "/tmp/not-a-consumer-repo",
    now: NOW,
  });
  assert.equal(expired.invocation.state, "not_invoked");
  assert.equal(expired.blocked[0].reasons.includes("expired"), true);

  const absentCatalog = structuredClone(base);
  const absentEntry = absentCatalog.entries.find((entry) => entry.id === "discovery:task-readiness");
  absentEntry.outputSchema = null;
  absentEntry.outputSchemaState = "absent";
  absentEntry.outputSchemaSha256 = null;
  const absent = await consumeQualified({
    catalog: absentCatalog,
    task: task(),
    callerInput: input(),
    repoRoot: "/tmp/not-a-consumer-repo",
    now: NOW,
  });
  assert.equal(absent.invocation.state, "not_invoked");
  assert.equal(absent.blocked[0].reasons.includes("output_contract_absent"), true);

  const changedFresh = structuredClone(base);
  const changedEntry = changedFresh.entries.find((entry) => entry.id === "discovery:task-readiness");
  changedEntry.outputSchemaSha256 = "changed";
  const changed = await consumeQualified({
    catalog: base,
    task: task(),
    callerInput: input(),
    repoRoot: "/tmp/not-a-consumer-repo",
    freshCatalog: changedFresh,
    now: NOW,
  });
  assert.equal(changed.invocation.state, "not_invoked");
  assert.equal(changed.blocked[0].reasons.includes("source_changed"), true);
});

test("the owned adapter runs only after the readiness document qualifies", async () => {
  const journey = await consumeQualified({
    catalog: catalog(),
    task: task(),
    callerInput: input({ meaningId: "repair-complete" }),
    repoRoot: repo,
    now: NOW,
  });
  assert.equal(journey.stages.query, "accepted");
  assert.equal(journey.stages.render, "rendered");
  assert.equal(journey.stages.selection, "selected");
  assert.equal(journey.stages.execution, "consumer_invoked");
  assert.equal(journey.stages.acceptance, "not_observed");
  assert.equal(journey.selection.entryId, "discovery:task-readiness");
  assert.equal(journey.meaningIdRole, "task_label");
  assert.equal(journey.semanticEquivalence, false);
  assert.equal(journey.discoveryQuote.state, "no_fit");
  assert.equal(journey.discoveryQuote.reason, "no_eligible_output");
  assert.deepEqual(journey.discoveryQuote.documentReasons, ["path_absent:data.quote"]);
  assert.equal(journey.discoveryQuote.semanticEquivalence, false);
  assert.equal(journey.invocation.coldStartExecuted, false);
  assert.equal(journey.invocation.completedUserTask, false);
  assert.equal(journey.sourceAcquisition.coldStartUsedForInvocation, false);
  assert.equal(journey.sourceAcquisition.coldStartUntrusted.length > 0, true);
  assert.equal(journey.sourceAcquisition.pin, "00267aeb03c3ce01b9b318f5ee0172aee34d7e34");
  assert.equal(journey.sourceAcquisition.valuePatternEvaluatedBy, "not_invoked");
  assert.equal(journey.outputValidation.ok, true);
  assert.equal(journey.outputValidation.decisionChanged, true);
  assert.equal(journey.outputValidation.admissibleOnBoth, true);
  assert.equal(journey.ownerUsefulness.accepted, false);
  assert.equal(journey.ownerUsefulness.completedUserTask, false);
  assert.equal(journey.ownerUsefulness.decisionAdmissibleIsAcceptance, false);
  assert.equal(journey.downstreamEffects.paymentSent, false);
  assert.equal(journey.downstreamEffects.publicDeploymentActivated, false);
  assert.equal(journey.downstreamEffects.claimSubmitted, false);
  assert.equal(journey.actual.positive.ok, true);
  assert.equal(journey.actual.positive.repairComplete, true);
  assert.equal(journey.actual.negative.ok, false);
  assert.equal(journey.actual.negative.findings[0], "seller_response_required_path_missing:data.quote");
  assert.equal(journey.directComparison.sameDecision, true);
  assert.equal(journey.directComparison.directPathRetained, true);
  assert.equal(journey.directComparison.savingsClaim, false);
});
