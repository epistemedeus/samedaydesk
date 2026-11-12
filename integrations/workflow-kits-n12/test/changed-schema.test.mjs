import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { applyDeclaredSchemaAdapter, createClientEndpoint, createKitEffects, fromMakeExecution, fromN8nExecution, runPeriod } from "../index.mjs";
import { schemaChangeWebhookBody, periodNWebhookBody } from "../scripts/build-artifacts.mjs";
import { buildWorkflowRequest } from "../src/workflow-request.mjs";
import { CLOCK, readJson, readVendorFixture } from "./helpers.mjs";

const VENDORED = readVendorFixture("synthetic-later-period-schema-change.json");
const ADAPTER = { payloadVersion: "later-period-output-keys.v1" };

for (const [platform, adapt, periodNRel, laterRel] of [
  ["make", fromMakeExecution, "fixtures/make/execution-period-n.json", "fixtures/make/execution-schema-change.json"],
  ["n8n", fromN8nExecution, "fixtures/n8n/execution-period-n.json", "fixtures/n8n/execution-schema-change.json"],
]) {
  describe(`changed schema later period via ${platform}`, () => {
    test("the export carries the vendored schema-change fixture unchanged", () => {
      const later = adapt(readJson(laterRel), { clock: CLOCK });
      assert.deepEqual(later.ingestion, VENDORED);
      assert.ok("outputKeys" in later.workflowOutput);
    });

    test("unadapted: schema_changed, complete false, no effect; declared adapter recovers on a new request with exactly one effect", () => {
      const effects = createKitEffects();
      const periodN = runPeriod(adapt(readJson(periodNRel), { clock: CLOCK }), { effects });
      const keyN = periodN.period.idempotencyKey;
      assert.equal(periodN.period.decision, "accept");
      assert.equal(effects.appliedCount(), 1);
      const effectNBefore = JSON.stringify(effects.get(keyN));

      const unadapted = runPeriod(adapt(readJson(laterRel), { clock: CLOCK }), { effects, periodN: periodN.result });
      assert.equal(unadapted.period.exception.code, "schema_changed");
      assert.equal(unadapted.period.completeness.complete, false);
      assert.deepEqual(unadapted.period.completeness.missingFields, ["output"]);
      assert.equal(unadapted.period.retry.retryable, false);
      assert.equal(unadapted.adapter, null);
      assert.equal(effects.appliedCount(), 1);

      const declared = { ...adapt(readJson(laterRel), { clock: CLOCK }), schemaAdapter: ADAPTER };
      const adapted = runPeriod(declared, { effects, periodN: periodN.result });
      assert.equal(adapted.period.decision, "accept");
      assert.equal(adapted.period.exception, null);
      assert.equal(adapted.period.completeness.complete, true);
      assert.notEqual(adapted.period.idempotencyKey, keyN);
      assert.equal(adapted.period.retry.secondEffect, false);
      assert.equal(adapted.result.outcome, "useful_no_change");
      assert.deepEqual(adapted.adapter.renamed, [["outputKeys", "output"]]);
      assert.equal(adapted.adapter.declaredBy, "caller");
      assert.equal(effects.appliedCount(adapted.period.idempotencyKey), 1);
      assert.equal(effects.appliedCount(keyN), 1);
      assert.equal(effects.appliedCount(), 2);
      assert.equal(JSON.stringify(effects.get(keyN)), effectNBefore);

      const replay = runPeriod(declared, { effects, periodN: periodN.result });
      assert.equal(replay.period.retry.recovered, true);
      assert.equal(replay.period.retry.secondEffect, false);
      assert.equal(effects.appliedCount(), 2);
    });
  });
}

describe("schema adapters are explicit only", () => {
  test("no adapter is applied without a declaration", () => {
    const input = { ingestion: VENDORED, workflowOutput: VENDORED.payload };
    const out = applyDeclaredSchemaAdapter(input);
    assert.equal(out.applied, false);
    assert.equal(out.input, input);
  });

  test("an unknown adapter version is refused", () => {
    const out = applyDeclaredSchemaAdapter({ ingestion: VENDORED, schemaAdapter: { payloadVersion: "guess.v9" } });
    assert.equal(out.ok, false);
    assert.equal(out.reason, "schema_adapter_unknown");
  });

  test("the declared adapter refuses a payload that has both or neither key", () => {
    const both = applyDeclaredSchemaAdapter({ ingestion: { ...VENDORED, payload: { ...VENDORED.payload, output: [] } }, schemaAdapter: ADAPTER });
    assert.equal(both.reason, "schema_adapter_conflict");
    const neither = applyDeclaredSchemaAdapter({ ingestion: readVendorFixture("synthetic-period-n-capture.json"), schemaAdapter: ADAPTER });
    assert.equal(neither.reason, "schema_adapter_not_applicable");
  });

  test("client endpoint path: schema_changed first, then the declared adapter recovers once", () => {
    const endpoint = createClientEndpoint({ clock: CLOCK });
    const n = periodNWebhookBody();
    endpoint.handle({ path: "/periods", body: buildWorkflowRequest({ platform: "n8n", period: n.period, workflowOutput: n.period.capture.payload, committed: true, clock: CLOCK }) });
    const plain = schemaChangeWebhookBody();
    const r1 = endpoint.handle({ path: "/periods", body: buildWorkflowRequest({ platform: "n8n", period: plain.period, workflowOutput: plain.period.capture.payload, committed: true, clock: CLOCK }) });
    assert.equal(r1.body.period.exception.code, "schema_changed");
    const declared = schemaChangeWebhookBody({ schemaAdapter: ADAPTER });
    const r2 = endpoint.handle({ path: "/periods", body: buildWorkflowRequest({ platform: "n8n", period: declared.period, workflowOutput: declared.period.capture.payload, committed: true, clock: CLOCK }) });
    assert.equal(r2.body.period.decision, "accept");
    assert.equal(endpoint.effects.appliedCount(), 2);
  });
});
