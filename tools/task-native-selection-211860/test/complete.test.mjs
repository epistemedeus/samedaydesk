import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonical } from "../src/canonical.mjs";
import { normalizeCallerEntry } from "../src/catalog.mjs";
import { EXPECTED, SUPPLIED_CONTRACT } from "../src/complete-contract.mjs";
import { completeReadiness } from "../src/complete.mjs";
import { probePublic } from "../src/probe.mjs";
import { PublicHostError } from "../src/public-host.mjs";
import { selectTask } from "../src/select.mjs";

const NOW = "2026-10-11T20:40:00.000Z";
const repo = fileURLToPath(new URL("../../..", import.meta.url));
const register = fileURLToPath(new URL("../scripts/hide-express-register.mjs", import.meta.url));

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
  return { ...load("../fixtures/consumer/quote-decimal-complete.json"), ...extra };
}

function hiddenImport(modulePath) {
  return spawnSync(process.execPath, [
    "--import",
    register,
    "--input-type=module",
    "-e",
    `await import(${JSON.stringify(modulePath)})`,
  ], { encoding: "utf8" });
}

test("the caller contract matches the predeclared supplied contract", () => {
  const spec = load("../fixtures/consumer/quote-decimal-complete.json");
  assert.equal(canonical(spec.contract), canonical(SUPPLIED_CONTRACT));
  assert.equal(spec.meaningId, "quote-decimal-label");
  assert.notEqual(EXPECTED.conforming.nextAction, EXPECTED.wrong.nextAction);
  assert.notEqual(EXPECTED.absentPath.nextAction, EXPECTED.conforming.nextAction);
});

test("importing task-readiness still requires express, and the pure module does not", () => {
  const natural = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `await import(${JSON.stringify(join(repo, "tools/l08-agent-repair/lib/task-readiness.mjs"))})`,
  ], { encoding: "utf8" });
  if (natural.status !== 0) {
    assert.match(natural.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.match(natural.stderr, /express/);
  }
  const hidden = hiddenImport(join(repo, "tools/l08-agent-repair/lib/task-readiness.mjs"));
  assert.notEqual(hidden.status, 0);
  assert.match(hidden.stderr, /ERR_MODULE_NOT_FOUND/);
  assert.match(hidden.stderr, /express/);
  const pure = spawnSync(process.execPath, [
    "--import",
    register,
    "--input-type=module",
    "-e",
    `import { semanticResult } from ${JSON.stringify(join(repo, "tools/l08-agent-repair/lib/readiness-contract.mjs"))};
process.stdout.write(JSON.stringify({
  soon: semanticResult({ data: { quote: "soon" } }),
  decimal: semanticResult({ data: { quote: "1.25" } }),
}));`,
  ], { encoding: "utf8" });
  assert.equal(pure.status, 0, pure.stderr);
  const parsed = JSON.parse(pure.stdout);
  assert.equal(parsed.soon.state, "fail");
  assert.equal(parsed.soon.shape, "string");
  assert.equal(parsed.decimal.state, "pass");
});

test("a shell string and a wrong pin do not invoke the contract module", async () => {
  const command = await completeReadiness({
    catalog: catalog(),
    task: task(),
    callerInput: input({ command: "node tools/l08-agent-repair/cold-client.mjs task-readiness" }),
    repoRoot: "/tmp/not-a-consumer-repo",
    now: NOW,
  });
  assert.equal(command.invocation.state, "not_invoked");
  assert.equal(command.invocation.reason, "command_refused");
  assert.equal(command.invocation.adapterInvoked, false);
  assert.equal(command.outsideAcceptance.accepted, false);

  const stalePin = await completeReadiness({
    catalog: catalog(),
    task: task(),
    callerInput: input({ pin: "259ea74da295f12d64e2aae9cb2042c4a14c6b96" }),
    repoRoot: "/tmp/not-a-consumer-repo",
    now: NOW,
  });
  assert.equal(stalePin.invocation.state, "not_invoked");
  assert.equal(stalePin.pin.state, "stale_pin");
  assert.equal(stalePin.stages.execution, "not_invoked");

  const wrongPin = await completeReadiness({
    catalog: catalog(),
    task: task(),
    callerInput: input({ pin: "deadbeef" }),
    repoRoot: "/tmp/not-a-consumer-repo",
    now: NOW,
  });
  assert.equal(wrongPin.pin.state, "pin_mismatch");
  assert.equal(wrongPin.invocation.state, "not_invoked");
  assert.equal(wrongPin.pin.adapterInvoked, false);
});

test("stale, expired, absent, and changed readiness sources are not invoked", async () => {
  const base = catalog();
  const caller = input();
  const fresh = structuredClone(base);
  fresh.entries = fresh.entries.filter((entry) => entry.id !== "discovery:task-readiness");
  const stale = await completeReadiness({
    catalog: base,
    task: task(),
    callerInput: caller,
    repoRoot: "/tmp/not-a-consumer-repo",
    freshCatalog: fresh,
    now: NOW,
  });
  assert.equal(stale.blocked[0].reasons.includes("stale_source"), true);
  assert.equal(stale.invocation.state, "not_invoked");

  const expiredCatalog = structuredClone(base);
  const expiredEntry = expiredCatalog.entries.find((entry) => entry.id === "discovery:task-readiness");
  expiredEntry.expiresAt = "2020-01-01T00:00:00.000Z";
  expiredEntry.expiryState = "known";
  const expired = await completeReadiness({
    catalog: expiredCatalog,
    task: task(),
    callerInput: caller,
    repoRoot: "/tmp/not-a-consumer-repo",
    now: NOW,
  });
  assert.equal(expired.blocked[0].reasons.includes("expired"), true);

  const absentCatalog = structuredClone(base);
  const absentEntry = absentCatalog.entries.find((entry) => entry.id === "discovery:task-readiness");
  absentEntry.outputSchema = null;
  absentEntry.outputSchemaState = "absent";
  absentEntry.outputSchemaSha256 = null;
  const absent = await completeReadiness({
    catalog: absentCatalog,
    task: task(),
    callerInput: caller,
    repoRoot: "/tmp/not-a-consumer-repo",
    now: NOW,
  });
  assert.equal(absent.blocked[0].reasons.includes("output_contract_absent"), true);

  const changedFresh = structuredClone(base);
  const changedEntry = changedFresh.entries.find((entry) => entry.id === "discovery:task-readiness");
  changedEntry.outputSchemaSha256 = "changed";
  const changed = await completeReadiness({
    catalog: base,
    task: task(),
    callerInput: caller,
    repoRoot: "/tmp/not-a-consumer-repo",
    freshCatalog: changedFresh,
    now: NOW,
  });
  assert.equal(changed.blocked[0].reasons.includes("source_changed"), true);
  assert.equal(changed.invocation.state, "not_invoked");
});

test("the pure contract check separates a decimal, a wrong string, and a missing path", async () => {
  const journey = await completeReadiness({
    catalog: catalog(),
    task: task(),
    callerInput: input({ meaningId: "not-a-semantic-id" }),
    repoRoot: repo,
    now: NOW,
  });
  assert.equal(journey.stages.query, "accepted");
  assert.equal(journey.stages.selection, "selected");
  assert.equal(journey.stages.execution, "consumer_invoked");
  assert.equal(journey.stages.ownerAcceptance, "recorded");
  assert.equal(journey.stages.outsideAcceptance, "not_observed");
  assert.equal(journey.selection.entryId, "discovery:task-readiness");
  assert.equal(journey.meaningIdRole, "task_label");
  assert.equal(journey.semanticEquivalence, false);
  assert.equal(journey.discoveryQuote.state, "no_fit");
  assert.deepEqual(journey.discoveryQuote.documentReasons, ["path_absent:data.quote"]);
  assert.equal(journey.invocation.faithfulInvocation, false);
  assert.equal(journey.invocation.adapterInvoked, false);
  assert.equal(journey.invocation.completedUserTask, false);
  assert.equal(journey.invocation.quoteGenerated, false);
  assert.equal(journey.sourceAcquisition.valuePatternEvaluatedBy, "semanticResult");
  assert.equal(journey.sourceAcquisition.coldStartUsedForInvocation, false);
  assert.equal(journey.sourceAcquisition.coldStartUntrusted.length > 0, true);
  assert.equal(journey.outputValidation.ok, true);
  assert.equal(journey.outputValidation.decisionChanged, true);
  assert.equal(journey.actual.conforming.nextAction, "decimal_match");
  assert.equal(journey.actual.conforming.semantic.state, "pass");
  assert.equal(journey.actual.wrong.nextAction, "value_mismatch:data.quote");
  assert.equal(journey.actual.wrong.semantic.shape, "string");
  assert.equal(journey.actual.wrong.schema.state, "pass");
  assert.equal(journey.actual.malformed.semantic.shape, "number");
  assert.equal(journey.actual.absentPath.nextAction, "seller_response_required_path_missing:data.quote");
  assert.equal(journey.actual.absentPath.semantic.state, "pass");
  assert.equal(journey.actual.nullable.nextAction, "type_not_guaranteed:data.quote");
  assert.equal(journey.actual.enum.nextAction, "enum_not_guaranteed:data.quote");
  assert.equal(journey.actual.unsupported.nextAction, "schema_unsupported");
  assert.equal(journey.actual.conforming.quoteGenerated, false);
  assert.equal(journey.actual.conforming.paymentSent, false);
  assert.equal(journey.actual.conforming.repairPosted, false);
  assert.equal(journey.ownerAcceptance.accepted, true);
  assert.equal(journey.ownerAcceptance.ownerQa, true);
  assert.equal(journey.ownerAcceptance.independentCustomer, false);
  assert.equal(journey.outsideAcceptance.state, "not_observed");
  assert.equal(journey.outsideAcceptance.accepted, false);
  assert.equal(journey.attention.amount, null);
  assert.equal(journey.attention.state, "unknown");
  assert.equal(journey.directComparison.sameDecision, true);
  assert.equal(journey.directComparison.directPathRetained, true);
  assert.equal(journey.directComparison.savingsClaim, false);
  assert.equal(journey.downstreamEffects.coldStartExecuted, false);
  assert.equal(journey.nextAction, "value_mismatch:data.quote");
});

test("a missing caller cost stays unknown and distinct currencies stay unranked", () => {
  const missing = normalizeCallerEntry({
    id: "missing-cost",
    operationId: "missing-cost",
    sourceRef: "caller:missing-cost",
    origin: "https://example.com",
    method: "GET",
    path: "/x",
    direct: true,
    outputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    price: { state: "unknown" },
  });
  assert.equal(missing.entry.price.state, "unknown");
  assert.equal(missing.entry.price.amount, null);
  const undenominated = normalizeCallerEntry({
    id: "no-currency",
    operationId: "no-currency",
    sourceRef: "caller:no-currency",
    origin: "https://example.com",
    method: "GET",
    path: "/x",
    direct: true,
    outputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    price: { state: "known", amount: "1.00", currency: null },
  });
  assert.equal(undenominated.entry.price.state, "undenominated");
  assert.equal(undenominated.entry.price.amount, "1.00");
  const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"] };
  const mixed = selectTask({
    catalog: {
      schema: "samedaydesk.task-native-selection.catalog.v1",
      entries: [
        entry("usd-row", "0.50", "USD", schema),
        entry("eur-row", "0.10", "EUR", schema),
      ],
    },
    task: {
      schema: "samedaydesk.task-native-selection.task.v1",
      taskRef: "mixed-currency",
      requiredOutput: { meaningId: "title-label", paths: [{ path: "title", type: "string" }] },
      applicability: { pricedExecution: "allowed", availableInputs: [], asOf: NOW },
    },
    now: NOW,
  });
  assert.equal(mixed.stages.selected.state, "unranked");
  assert.equal(mixed.stages.selected.impliedCheapest, false);
  assert.equal(mixed.stages.selected.entryId, null);
});

test("a private redirect is refused before a second hop", async () => {
  let calls = 0;
  await assert.rejects(() => probePublic("https://example.com/resource", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    transport: async () => {
      calls += 1;
      return { status: 302, headers: { location: "http://127.0.0.1/secret" }, body: Buffer.alloc(0), truncated: false };
    },
  }), (error) => error instanceof PublicHostError && error.code === "host_refused");
  assert.equal(calls, 1);
});

function entry(id, amount, currency, outputSchema) {
  return {
    id,
    operationId: id,
    sourceRef: `https://example.com/${id}`,
    sourceKind: "openapi",
    authority: "catalog",
    origin: "https://example.com",
    method: "GET",
    path: `/${id}`,
    owned: false,
    direct: false,
    requiredInputs: [],
    outputSchema,
    outputSchemaState: "present",
    outputSchemaSha256: id,
    price: {
      state: "known",
      amount,
      currency,
      charged: true,
      atomic: null,
      conflict: null,
      sources: ["test"],
    },
    summaryUntrusted: "",
    nextAction: null,
    expiresAt: null,
    expiryState: "unknown",
  };
}
