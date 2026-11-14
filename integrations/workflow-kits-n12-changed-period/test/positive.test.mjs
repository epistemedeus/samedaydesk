import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { mapRecord } from "../src/mapping.mjs";
import { mappingRegistry, periodNRequest } from "../src/fixtures.mjs";
import { CAPTURE_SCHEMA, periodNPreview } from "../src/vendor-paths.mjs";
import { apply, byKey, endpoint, evaluate } from "./helpers.mjs";

describe("period N: declared mapping v1, every record accepted and applied once", () => {
  test("mapping is deterministic and fills the permitted capture", () => {
    const entry = mappingRegistry().versions[0];
    const record = periodNRequest().records[0];
    const a = mapRecord(entry, record, { captureSchema: CAPTURE_SCHEMA });
    const b = mapRecord(entry, structuredClone(record), { captureSchema: CAPTURE_SCHEMA });
    assert.deepEqual(a, b);
    assert.equal(a.ok, true);
    assert.equal(a.recordKey, "r-001");
    assert.deepEqual(a.capture.payload, { title: record.heading, status: "complete", output: record.keys });
    assert.equal(a.capture.captureId, record.captureRef);
    assert.equal(a.capture.capturedAt, record.capturedAt);
    assert.deepEqual(a.capture.permission, { permitted: true });
    assert.equal(a.capture.schema, CAPTURE_SCHEMA);
  });

  test("evaluate returns ready with the frozen period interface; apply writes one receipt each", () => {
    const ep = endpoint();
    const request = periodNRequest();
    const body = evaluate(ep, request).body;
    assert.equal(body.ok, true);
    assert.equal(body.mappingVersion, "workflow-output.v1");
    assert.deepEqual(body.summary, { records: 3, ready: 3, alreadyApplied: 0, exceptions: 0, retryable: 0 });
    for (const record of body.records) {
      assert.equal(record.outcome, "ready");
      assert.deepEqual(Object.keys(record.period).sort(), ["completeness", "decision", "exception", "idempotencyKey", "periodId", "recordEvidence", "retry"]);
      assert.deepEqual(Object.keys(record.period.recordEvidence).sort(), ["captureId", "capturedAt", "contextId", "correlationId", "followsTaskId", "ingestionDigest", "taskId", "termsVersion"]);
      assert.equal(record.period.decision, "accept");
      assert.match(record.idempotencyKey, /^sha256:[0-9a-f]{64}$/);
      assert.equal(record.ledgerKey, `${record.idempotencyKey}:${record.recordKey}`);
      assert.equal(record.period.recordEvidence.termsVersion, periodNPreview().termsVersion, "termsVersion is the exchange value, passed through");
      assert.equal(record.period.recordEvidence.taskId, request.period.taskId);
      assert.equal(record.period.recordEvidence.correlationId, request.period.caller.correlationId);
      const res = apply(ep, record, body.periodId);
      assert.equal(res.status, 201);
      assert.equal(res.body.outcome, "applied");
      assert.equal(res.body.receipt.termsVersion, periodNPreview().termsVersion);
      assert.equal(res.body.receipt.mappingVersion, "workflow-output.v1");
    }
    assert.equal(ep.externalEffects(), 3);
    assert.equal(new Set(body.records.map((r) => r.idempotencyKey)).size, 3);
  });

  test("the same inputs give the same idempotency keys on a fresh endpoint", () => {
    const keys = () => evaluate(endpoint(), periodNRequest()).body.records.map((r) => r.idempotencyKey);
    assert.deepEqual(keys(), keys());
  });

  test("a second evaluate of an applied period reports already_applied with the original receipt", () => {
    const ep = endpoint();
    const first = evaluate(ep, periodNRequest()).body;
    for (const r of first.records) apply(ep, r, first.periodId);
    const again = byKey(evaluate(ep, periodNRequest()).body);
    for (const r of first.records) {
      assert.equal(again[r.recordKey].outcome, "already_applied");
      assert.equal(again[r.recordKey].receipt.ledgerKey, r.ledgerKey);
      assert.equal(again[r.recordKey].period.retry.recovered, true);
      assert.equal(again[r.recordKey].period.retry.secondEffect, false);
    }
    assert.equal(ep.externalEffects(), 3);
  });
});
