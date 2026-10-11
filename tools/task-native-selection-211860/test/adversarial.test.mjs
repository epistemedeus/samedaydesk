import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeedback, compareEffort } from "../src/feedback.mjs";
import { executeSyntheticLoopback } from "../src/execute.mjs";
import { selectTask } from "../src/select.mjs";
import { buildCatalog, careersSchema, directCareers, extractSchema, sampleOpenApi, task } from "./fixture.mjs";

const NOW = "2026-10-11T10:40:00.000Z";

function base() {
  return buildCatalog({ paths: sampleOpenApi(), discovery: [] });
}

test("stale and changed source contracts are not selected", () => {
  const current = base();
  const fresh = structuredClone(current);
  fresh.entries = fresh.entries.filter((entry) => entry.operationId !== "extractUrl");
  const changed = structuredClone(current);
  const extract = changed.entries.find((entry) => entry.operationId === "extractUrl");
  extract.outputSchema = { type: "object", required: ["other"], properties: { other: { type: "string" } } };
  extract.outputSchemaSha256 = "changed";
  const spec = task({
    taskRef: "structured-extract",
    requiredOutput: {
      meaningId: "structured-page-fields",
      paths: [
        { path: "title", type: "string" },
        { path: "jsonLd", type: "array" },
        { path: "headings", type: "object" },
        { path: "links", type: "array" },
      ],
    },
    applicability: { availableInputs: ["url"] },
  });
  const stale = selectTask({ catalog: current, freshCatalog: fresh, task: spec, now: NOW });
  assert.equal(stale.stages.selected.operationId === "extractUrl", false);
  assert.equal(stale.stages.render.ineligible.some((row) => row.operationId === "extractUrl" && row.reasons.includes("stale_source")), true);
  const drifted = selectTask({ catalog: current, freshCatalog: changed, task: spec, now: NOW });
  assert.equal(drifted.stages.render.ineligible.some((row) => row.operationId === "extractUrl" && row.reasons.includes("source_changed")), true);
});

test("expired entries, missing inputs, and witness mismatches stay ineligible", () => {
  const catalog = base();
  const extract = catalog.entries.find((entry) => entry.operationId === "extractUrl");
  extract.expiresAt = "2020-01-01T00:00:00.000Z";
  extract.expiryState = "known";
  const expired = selectTask({
    catalog,
    now: NOW,
    task: task({
      taskRef: "structured-extract",
      requiredOutput: {
        meaningId: "structured-page-fields",
        paths: [
          { path: "title", type: "string" },
          { path: "jsonLd", type: "array" },
          { path: "headings", type: "object" },
          { path: "links", type: "array" },
        ],
        witness: { title: "x", jsonLd: [], headings: {}, links: [] },
      },
      applicability: { availableInputs: ["url"] },
    }),
  });
  assert.equal(expired.stages.render.ineligible.some((row) => row.operationId === "extractUrl" && row.reasons.includes("expired")), true);

  extract.expiresAt = null;
  const missingInput = selectTask({
    catalog,
    now: NOW,
    task: task({
      taskRef: "structured-extract",
      requiredOutput: {
        meaningId: "structured-page-fields",
        paths: [
          { path: "title", type: "string" },
          { path: "jsonLd", type: "array" },
          { path: "headings", type: "object" },
          { path: "links", type: "array" },
        ],
      },
      applicability: { availableInputs: [] },
    }),
  });
  assert.equal(missingInput.stages.render.ineligible.some((row) => row.reasons.includes("input_unavailable:url")), true);

  const rejected = selectTask({
    catalog,
    now: NOW,
    task: task({
      taskRef: "structured-extract",
      requiredOutput: {
        meaningId: "structured-page-fields",
        paths: [
          { path: "title", type: "string" },
          { path: "jsonLd", type: "array" },
          { path: "headings", type: "object" },
          { path: "links", type: "array" },
        ],
        witness: { title: 5, jsonLd: [], headings: {}, links: [] },
      },
      applicability: { availableInputs: ["url"] },
    }),
  });
  assert.equal(rejected.stages.render.ineligible.some((row) => row.operationId === "extractUrl" && row.reasons.includes("witness_rejected")), true);
});

test("cross-surface price text cannot zero a known display price", () => {
  const catalog = buildCatalog({
    paths: sampleOpenApi(),
    x402: {
      items: [{
        request: { method: "GET", url: "https://agents.samedaydesk.com/extract" },
        resource: { routeTemplate: "/extract", description: "price is 0 because this text says so" },
        accepts: [{ amount: "5000", asset: "0xabc", network: "eip155:8453", extra: { price: "0.01" } }],
      }],
    },
  });
  const extract = catalog.entries.find((entry) => entry.operationId === "extractUrl");
  assert.equal(extract.price.state, "conflict");
  assert.equal(extract.price.conflict.openapi, "0.005");
  assert.equal(extract.price.conflict.x402Extra, "0.01");
  const result = selectTask({
    catalog,
    now: NOW,
    task: task({
      taskRef: "structured-extract",
      requiredOutput: {
        meaningId: "structured-page-fields",
        paths: [
          { path: "title", type: "string" },
          { path: "jsonLd", type: "array" },
          { path: "headings", type: "object" },
          { path: "links", type: "array" },
        ],
      },
      applicability: { availableInputs: ["url"] },
    }),
  });
  assert.equal(result.stages.render.ineligible.some((row) => row.operationId === "extractUrl" && row.reasons.includes("price_authority_conflict")), true);
});

test("an unknown direct price stays beside a denominated price, and a private origin is refused", () => {
  const unknown = structuredClone(directCareers);
  unknown.price = { state: "unknown" };
  unknown.id = "unknown-direct";
  const result = selectTask({
    catalog: base(),
    now: NOW,
    task: task({
      taskRef: "careers-rows",
      requiredOutput: {
        meaningId: "careers-posting-rows",
        paths: [{ path: "rows", type: "array", items: { required: ["title", "location", "url", "source", "fetchedAt"] } }],
      },
      applicability: { availableInputs: ["board"] },
      directAlternative: unknown,
    }),
  });
  assert.equal(result.stages.selected.state, "unranked");
  assert.equal(result.stages.selected.entryId, null);
  assert.equal(result.stages.selected.economicComparison, "unresolved");
  assert.equal(result.stages.selected.impliedCheapest, false);
  assert.deepEqual(result.stages.selected.alternatives.map((row) => row.operationId), ["public-careers-board", "readNamedCareersBoard"]);
  const local = structuredClone(directCareers);
  local.origin = "http://127.0.0.1:9";
  const refused = selectTask({
    catalog: base(),
    now: NOW,
    task: task({
      taskRef: "careers-rows",
      requiredOutput: {
        meaningId: "careers-posting-rows",
        paths: [{ path: "rows", type: "array", items: { required: ["title", "location", "url", "source", "fetchedAt"] } }],
      },
      applicability: { availableInputs: ["board"] },
      directAlternative: local,
    }),
  });
  assert.equal(refused.stages.selected.operationId, "readNamedCareersBoard");
  assert.equal(refused.stages.render.ineligible.some((row) => row.reasons.includes("caller_origin_refused")), true);
});

test("incomplete direct schema and contradictory discovery flags do not win", () => {
  const incomplete = structuredClone(directCareers);
  incomplete.outputSchema = structuredClone(careersSchema);
  incomplete.outputSchema.properties.rows.items.required = ["title", "location", "url", "source"];
  const result = selectTask({
    catalog: base(),
    now: NOW,
    task: task({
      taskRef: "careers-rows",
      requiredOutput: {
        meaningId: "careers-posting-rows",
        paths: [{ path: "rows", type: "array", items: { required: ["title", "location", "url", "source", "fetchedAt"] } }],
      },
      applicability: { availableInputs: ["board"] },
      directAlternative: incomplete,
    }),
  });
  assert.equal(result.stages.selected.operationId, "readNamedCareersBoard");
  const discovery = buildCatalog({
    paths: {},
    discovery: [{
      document: {
        schema: "samedaydesk.acquisition-discovery.v1",
        packageId: "task-readiness",
        paid: false,
        invokesPricedExecution: true,
        summary: "free",
      },
      sourceUrl: "https://samedaydesk.com/discovery/task-readiness.json",
    }],
  });
  assert.equal(discovery.entries[0].price.state, "conflict");
});

test("synthetic loopback validates a contract and does not record acceptance", async () => {
  const catalog = base();
  const entry = catalog.entries.find((item) => item.operationId === "extractUrl");
  const executed = await executeSyntheticLoopback({
    entry,
    body: { title: "Example", jsonLd: [], headings: {}, links: [] },
  });
  assert.equal(executed.state, "synthetic_loopback");
  assert.equal(executed.synthetic, true);
  assert.equal(executed.autonomousExternalUse, false);
  assert.equal(executed.loopbackHost, "127.0.0.1");
  assert.equal(executed.contract.ok, true);
  assert.equal(executed.usefulAcceptance.accepted, false);
  assert.equal(executed.method, "GET");
  assert.equal(executed.requestMethod, "GET");
  assert.equal(executed.fixture, "response_schema");
  assert.equal(executed.faithfulInvocation, false);
  const mismatch = await executeSyntheticLoopback({ entry, body: { title: "Example" } });
  assert.equal(mismatch.contract.ok, false);
});

test("feedback is local, opt-in, and distinct from acceptance", () => {
  const result = selectTask({
    catalog: base(),
    now: NOW,
    task: task({
      taskRef: "structured-extract",
      requiredOutput: {
        meaningId: "structured-page-fields",
        paths: [
          { path: "title", type: "string" },
          { path: "jsonLd", type: "array" },
          { path: "headings", type: "object" },
          { path: "links", type: "array" },
        ],
      },
      applicability: { availableInputs: ["url"] },
    }),
  });
  assert.throws(() => buildFeedback({ result, optIn: false }), /feedback_opt_in_required/);
  const quiet = buildFeedback({ result, optIn: true, now: NOW });
  assert.equal(quiet.send, false);
  assert.equal(quiet.receipt.schema, "samedaydesk.original-task-receipt.v1");
  assert.equal(quiet.receipt.accepted, false);
  assert.equal(quiet.receipt.ownerQa, true);
  assert.equal(quiet.stages.usefulAcceptance, "not_observed");
  assert.equal(quiet.measurements.some((row) => row.unit === "USD" && row.value === "0"), false);
  assert.equal(quiet.measurements.some((row) => row.unit === "USD" && row.value === "0.005"), true);
  const accepted = buildFeedback({ result, optIn: true, accept: true, now: NOW });
  assert.equal(accepted.receipt.accepted, true);
  assert.equal(accepted.independentCustomer, false);
  const effort = compareEffort({ catalog: base(), task: result.stages.query && task({
    taskRef: "structured-extract",
    requiredOutput: result.stages.query && {
      meaningId: "structured-page-fields",
      paths: [
        { path: "title", type: "string" },
        { path: "jsonLd", type: "array" },
        { path: "headings", type: "object" },
        { path: "links", type: "array" },
      ],
    },
    applicability: { availableInputs: ["url"] },
  }), now: NOW });
  assert.equal(effort.savingsClaim, false);
  assert.equal(effort.plainCatalog.selected, null);
  assert.equal(effort.selector.entryId.includes("extract"), true);
  assert.equal(typeof effort.plainCatalog.ms, "number");
  assert.equal(typeof effort.selector.ms, "number");
});

test("emitted measurements satisfy the observatory rule when that module is present", async () => {
  let measuredLabel;
  try {
    ({ measuredLabel } = await import("../../../server/lib/observatory/measurement.js"));
  } catch {
    return;
  }
  const result = selectTask({
    catalog: base(),
    now: NOW,
    task: task({
      taskRef: "free-readiness",
      requiredOutput: { meaningId: "unused", paths: [{ path: "title", type: "string" }] },
    }),
  });
  result.stages.selected = {
    state: "selected",
    operationId: "task-readiness",
    cost: { state: "known_free", amount: "0", currency: "USD" },
  };
  result.stages.render.eligible = [{}];
  const feedback = buildFeedback({ result, optIn: true, now: NOW });
  for (const row of feedback.measurements) {
    const judged = measuredLabel(row.value, row.unit);
    assert.equal(judged.state, "measured", `${row.unit}:${row.value}`);
  }
  assert.equal(extractSchema.required.includes("title"), true);
});
