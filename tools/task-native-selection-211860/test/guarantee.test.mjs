import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeCallerEntry } from "../src/catalog.mjs";
import { CATALOG_SCHEMA, FEATURE } from "../src/constants.mjs";
import { buildFeedback, compareEffort } from "../src/feedback.mjs";
import { executeSyntheticLoopback } from "../src/execute.mjs";
import { supportsOutput } from "../src/schema-support.mjs";
import { selectTask } from "../src/select.mjs";
import { task } from "./fixture.mjs";

const NOW = "2026-10-11T11:40:00.000Z";

function stringSchema(titleSchema) {
  return {
    type: "object",
    additionalProperties: true,
    required: ["title"],
    properties: { title: titleSchema },
  };
}

function entry(partial) {
  const normalized = normalizeCallerEntry({
    id: partial.id,
    sourceRef: partial.sourceRef || `https://example.com/${partial.id}`,
    origin: "https://example.com",
    method: partial.method || "GET",
    path: partial.path || `/${partial.id}`,
    direct: partial.direct === true,
    owned: partial.owned === true,
    operationId: partial.operationId || partial.id,
    summaryUntrusted: partial.summaryUntrusted || "",
    requiredInputs: partial.requiredInputs || [],
    outputSchema: partial.outputSchema,
    price: partial.price,
  });
  assert.equal(normalized.error, null, normalized.error || partial.id);
  return normalized.entry;
}

function catalog(entries) {
  return {
    schema: CATALOG_SCHEMA,
    feature: FEATURE,
    acquiredAt: NOW,
    coverage: null,
    entries,
  };
}

function titleTask(meaningId = "title-label") {
  return task({
    taskRef: "title-guarantee",
    requiredOutput: { meaningId, paths: [{ path: "title", type: "string" }] },
  });
}

test("a nullable producer does not satisfy a string-only allowed set", () => {
  const support = supportsOutput(stringSchema({ type: ["string", "null"] }), {
    paths: [{ path: "title", type: "string" }],
  });
  assert.equal(support.ok, false);
  assert.equal(support.reason, "type_not_guaranteed:title");
  assert.equal(support.spec, "allowed_output_set");
  assert.equal(support.claim, "refused");
  const narrower = supportsOutput(stringSchema({ type: "string" }), {
    paths: [{ path: "title", type: ["string", "null"] }],
  });
  assert.equal(narrower.ok, true);
  assert.equal(narrower.claim, "demonstrated_guarantee");
  const nullable = supportsOutput(stringSchema({ type: "string", nullable: true }), {
    paths: [{ path: "title", type: "string" }],
  });
  assert.equal(nullable.reason, "type_not_guaranteed:title");
  const combinator = supportsOutput(stringSchema({ anyOf: [{ type: "string" }, { type: "null" }] }), {
    paths: [{ path: "title", type: "string" }],
  });
  assert.equal(combinator.reason, "schema_unsupported:title");
  const integer = supportsOutput({
    type: "object",
    required: ["status"],
    properties: { status: { type: "integer" } },
  }, { paths: [{ path: "status", type: "number" }] });
  assert.equal(integer.reason, "type_not_guaranteed:status");
});

test("a wider producer enum is outside the allowed set", () => {
  const schema = {
    type: "object",
    required: ["decision"],
    properties: {
      decision: { type: "string", enum: ["machine_buyable", "contract_ready", "repair_required"] },
    },
  };
  const wider = supportsOutput(schema, {
    paths: [{ path: "decision", type: "string", enum: ["machine_buyable"] }],
  });
  assert.equal(wider.ok, false);
  assert.equal(wider.reason, "enum_not_guaranteed:decision");
  const narrower = supportsOutput({
    type: "object",
    required: ["decision"],
    properties: { decision: { type: "string", enum: ["machine_buyable"] } },
  }, { paths: [{ path: "decision", type: "string", enum: ["machine_buyable", "contract_ready"] }] });
  assert.equal(narrower.ok, true);
  assert.equal(narrower.claim, "demonstrated_guarantee");
});

test("a cheaper nullable contract does not take a string-only selection", () => {
  const result = selectTask({
    catalog: catalog([
      entry({
        id: "nullable-cheap",
        outputSchema: stringSchema({ type: ["string", "null"] }),
        price: { state: "known", amount: "0.001", currency: "USD" },
      }),
      entry({
        id: "string-priced",
        outputSchema: stringSchema({ type: "string" }),
        price: { state: "known", amount: "0.005", currency: "USD" },
      }),
    ]),
    now: NOW,
    task: titleTask(),
  });
  assert.equal(result.stages.query.meaningIdRole, "task_label");
  assert.equal(result.stages.query.semanticEquivalence, false);
  assert.equal(result.stages.query.outputSpec, "allowed_output_set");
  assert.equal(result.stages.selected.operationId, "string-priced");
  assert.equal(result.stages.selected.impliedCheapest, false);
  assert.equal(result.stages.selected.economicComparison, "sole_priced");
  const refused = result.stages.render.ineligible.find((row) => row.operationId === "nullable-cheap");
  assert.equal(refused.reasons.includes("type_not_guaranteed:title"), true);
  assert.equal(refused.outputClaim, "refused");
});

test("different currencies and an undenominated quote stay unranked", () => {
  const mixed = selectTask({
    catalog: catalog([
      entry({
        id: "usd-low",
        outputSchema: stringSchema({ type: "string" }),
        price: { state: "known", amount: "0.50", currency: "USD" },
      }),
      entry({
        id: "eur-lower-digits",
        outputSchema: stringSchema({ type: "string" }),
        price: { state: "known", amount: "0.10", currency: "EUR" },
      }),
    ]),
    now: NOW,
    task: titleTask(),
  });
  assert.equal(mixed.stages.selected.state, "unranked");
  assert.equal(mixed.stages.selected.entryId, null);
  assert.equal(mixed.stages.selected.economicComparison, "unresolved");
  assert.equal(mixed.stages.selected.impliedCheapest, false);
  assert.equal(mixed.stages.selected.alternativeOrder, "entry_id_trace");
  assert.deepEqual(mixed.stages.selected.alternatives.map((row) => row.operationId), ["eur-lower-digits", "usd-low"]);

  const bare = normalizeCallerEntry({
    id: "no-currency",
    sourceRef: "https://example.com/no-currency",
    origin: "https://example.com",
    outputSchema: stringSchema({ type: "string" }),
    price: { state: "known", amount: "0.25", currency: null },
  });
  assert.equal(bare.error, null);
  assert.equal(bare.entry.price.state, "undenominated");
  assert.equal(bare.entry.price.currency, null);
  const beside = selectTask({
    catalog: catalog([
      bare.entry,
      entry({
        id: "usd-known",
        outputSchema: stringSchema({ type: "string" }),
        price: { state: "known", amount: "1.00", currency: "USD" },
      }),
    ]),
    now: NOW,
    task: titleTask(),
  });
  assert.equal(beside.stages.selected.state, "unranked");
  assert.equal(beside.stages.selected.impliedCheapest, false);
  const lower = entry({
    id: "b-smaller",
    outputSchema: stringSchema({ type: "string" }),
    price: { state: "known", amount: "9007199254740992", currency: "USD" },
  });
  const higher = entry({
    id: "a-larger",
    outputSchema: stringSchema({ type: "string" }),
    price: { state: "known", amount: "9007199254740993", currency: "USD" },
  });
  const exact = selectTask({
    catalog: catalog([higher, lower]),
    now: NOW,
    task: titleTask(),
  });
  assert.equal(exact.stages.selected.operationId, "b-smaller");
  assert.equal(exact.stages.selected.economicComparison, "exact_decimal");
  assert.equal(exact.stages.selected.impliedCheapest, false);
  const equalScale = selectTask({
    catalog: catalog([
      entry({
        id: "scale-a",
        outputSchema: stringSchema({ type: "string" }),
        price: { state: "known", amount: "1.10", currency: "USD" },
      }),
      entry({
        id: "scale-b",
        outputSchema: stringSchema({ type: "string" }),
        price: { state: "known", amount: "1.1", currency: "USD" },
        direct: true,
      }),
    ]),
    now: NOW,
    task: titleTask(),
  });
  assert.equal(equalScale.stages.selected.operationId, "scale-b");
  assert.equal(equalScale.stages.selected.tieBreak, null);
});

test("known free direct still dominates a denominated price", () => {
  const result = selectTask({
    catalog: catalog([
      entry({
        id: "priced",
        outputSchema: stringSchema({ type: "string" }),
        price: { state: "known", amount: "0.005", currency: "USD" },
        owned: true,
      }),
      entry({
        id: "free-direct",
        outputSchema: stringSchema({ type: "string" }),
        price: { state: "known_free", amount: "0" },
        direct: true,
      }),
    ]),
    now: NOW,
    task: titleTask(),
  });
  assert.equal(result.stages.selected.operationId, "free-direct");
  assert.equal(result.stages.selected.cost.state, "known_free");
  assert.equal(result.stages.selected.cost.currency, null);
  assert.equal(result.stages.selected.direct, true);
  assert.equal(result.stages.selected.economicComparison, "known_free");
  assert.equal(result.stages.selected.impliedCheapest, false);
  assert.equal(result.stages.selected.alsoEligible[0].relation, "dominated_by_known_free");
});

test("meaningId stays a label on the acquired contracts", () => {
  const acquired = JSON.parse(readFileSync(new URL("../acquired/normalized.json", import.meta.url), "utf8"));
  const extract = acquired.entries.find((row) => row.operationId === "extractUrl");
  const description = supportsOutput(extract.outputSchema, {
    paths: [{ path: "description", type: "string" }],
  });
  assert.equal(description.ok, false);
  assert.equal(description.reason, "path_optional:description");
  const careers = acquired.entries.find((row) => row.operationId === "readNamedCareersBoard");
  const location = supportsOutput(careers.outputSchema, {
    paths: [{
      path: "rows",
      type: "array",
      items: { required: ["location"], properties: { location: { type: "string" } } },
    }],
  });
  assert.equal(location.reason, "type_not_guaranteed:rows.location");
  const referral = acquired.entries.find((row) => row.operationId === "claimReceiptReferralRecheck");
  const narrowEnum = supportsOutput(referral.outputSchema, {
    paths: [{ path: "recheck.decision", type: "string", enum: ["machine_buyable"] }],
  });
  assert.equal(narrowEnum.reason, "enum_not_guaranteed:recheck.decision");
  const labeled = selectTask({
    catalog: acquired,
    now: NOW,
    task: task({
      taskRef: "label-only",
      requiredOutput: { meaningId: "listPlatformHealthCards", paths: [{ path: "flightNumber", type: "string" }] },
    }),
  });
  assert.equal(labeled.stages.selected.state, "no_fit");
  assert.equal(labeled.stages.query.meaningId, "listPlatformHealthCards");
  assert.equal(labeled.stages.query.meaningIdRole, "task_label");
  assert.equal(labeled.stages.query.semanticEquivalence, false);
});

test("feedback emits USD only for a USD display price", () => {
  const result = selectTask({
    catalog: catalog([
      entry({
        id: "usd",
        outputSchema: stringSchema({ type: "string" }),
        price: { state: "known", amount: "0.005", currency: "USD" },
      }),
    ]),
    now: NOW,
    task: titleTask(),
  });
  const usd = buildFeedback({ result, optIn: true, now: NOW });
  assert.equal(usd.measurements.some((row) => row.unit === "USD" && row.value === "0.005"), true);
  result.stages.selected.cost.currency = "EUR";
  const eur = buildFeedback({ result, optIn: true, now: NOW });
  assert.equal(eur.measurements.some((row) => row.unit === "USD"), false);
  const effort = compareEffort({ catalog: result.stages && catalog([
    entry({
      id: "usd",
      outputSchema: stringSchema({ type: "string" }),
      price: { state: "known", amount: "0.005", currency: "USD" },
    }),
  ]), task: titleTask(), now: NOW });
  assert.equal(effort.savingsClaim, false);
  assert.equal(effort.directContract.impliedCheapest, false);
  assert.equal(effort.directContract.economicWinner, null);
  assert.equal(effort.stages.executed, "not_executed");
  assert.equal(effort.stages.usefulAcceptance, "not_observed");
});

test("synthetic loopback delivers the declared method as a response fixture", async () => {
  const post = entry({
    id: "post-fixture",
    method: "POST",
    outputSchema: stringSchema({ type: "string" }),
    price: { state: "known_free", amount: "0", currency: "USD" },
  });
  const executed = await executeSyntheticLoopback({ entry: post, body: { title: "fixture" } });
  assert.equal(executed.method, "POST");
  assert.equal(executed.requestMethod, "POST");
  assert.equal(executed.methodDelivery, "declared_method");
  assert.equal(executed.fixture, "response_schema");
  assert.equal(executed.faithfulInvocation, false);
  assert.equal(executed.autonomousExternalUse, false);
  assert.equal(executed.contract.ok, true);
});
