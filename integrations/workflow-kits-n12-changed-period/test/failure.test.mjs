import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CLIENT_ENDPOINT } from "../src/client-endpoint.mjs";
import { KIT_CODES, suggestedActionFor } from "../src/exceptions.mjs";
import { journeyOwedReference, periodNPlus1Request, periodNRequest } from "../src/fixtures.mjs";
import { byKey, endpoint, evaluate, evaluateAndApply } from "./helpers.mjs";

const EXCEPTION_KEYS = ["code", "fieldPath", "fields", "message", "recordKey", "retryable", "sameIdempotencyKey", "source", "suggestedAction"];

function afterPeriodN() {
  const ep = endpoint();
  evaluateAndApply(ep, periodNRequest());
  return ep;
}

describe("failures: typed, located, never applied", () => {
  test("not permitted is non-retryable and points at the consent field", () => {
    const r = byKey(evaluate(afterPeriodN(), periodNPlus1Request()).body)["r-005"];
    assert.deepEqual(Object.keys(r.exception).sort(), EXCEPTION_KEYS);
    assert.equal(r.exception.code, "ingestion_not_permitted");
    assert.equal(r.exception.source, "journey");
    assert.equal(r.exception.retryable, false);
    assert.equal(r.exception.fieldPath, "records[4].consent");
    assert.equal(r.ledgerKey, null);
  });

  test("stale capture is retryable without a replay key and points at capture.at", () => {
    const r = byKey(evaluate(afterPeriodN(), periodNPlus1Request()).body)["r-004"];
    assert.equal(r.exception.code, "capture_stale");
    assert.equal(r.exception.retryable, true);
    assert.equal(r.exception.sameIdempotencyKey, null);
    assert.equal(r.exception.fieldPath, "records[3].capture.at");
    assert.match(r.exception.suggestedAction, /fresh capture/);
  });

  test("continuation file missing and token-shaped task ids are refused per record", () => {
    const missing = periodNRequest();
    missing.period.caller.continuationFileMissing = true;
    const a = evaluate(endpoint(), missing).body.records[0];
    assert.equal(a.exception.code, "continuation_file_missing");
    assert.equal(a.exception.retryable, false);
    assert.equal(a.exception.fieldPath, "period.caller.continuationFileMissing");
    const token = periodNRequest();
    token.period.taskId = "pc1.synthetic-not-a-task-id";
    const b = evaluate(endpoint(), token).body.records[0];
    assert.equal(b.exception.code, "token_used_as_task_ref");
    assert.equal(b.exception.fieldPath, "period.taskId");
  });

  test("an owed reference that fails its integrity check refuses the period before any record runs", () => {
    const ep = afterPeriodN();
    const ref = { ...journeyOwedReference(), integrity: "0".repeat(64) };
    const res = evaluate(ep, periodNPlus1Request({ owedReference: ref })).body;
    assert.equal(res.ok, false);
    assert.equal(res.configErrors[0].code, "integrity_mismatch");
    assert.equal(res.configErrors[0].fieldPath, "period.owedReference");
    assert.equal(res.configErrors[0].retryable, false);
    assert.equal(ep.effects.commitCount(), 3);
  });

  test("a bound owed reference is carried on the result, consume-only", () => {
    const res = evaluate(afterPeriodN(), periodNPlus1Request()).body;
    assert.deepEqual(Object.keys(res.owedBinding).sort(), ["integrity", "obligationId", "referenceDigest", "taskRef"]);
    assert.equal(res.owedBinding.taskRef, periodNPlus1Request().period.caller.correlationId);
  });

  test("duplicate record keys in one request are refused", () => {
    const request = periodNRequest();
    request.records.push({ ...request.records[0], captureRef: "cap-other" });
    const res = evaluate(endpoint(), request).body;
    assert.equal(res.configErrors[0].code, "record_key_duplicate");
    assert.equal(res.configErrors[0].recordKey, "r-001");
  });

  test("a record that is not an object is schema_changed at its index", () => {
    const request = periodNRequest();
    request.records[1] = "r-002";
    const r = evaluate(endpoint(), request).body.records[1];
    assert.equal(r.exception.code, "schema_changed");
    assert.equal(r.exception.fieldPath, "records[1]");
  });

  test("apply without a ready evaluation, or with a mismatched key, applies nothing", () => {
    const ep = endpoint();
    const none = ep.handle({ url: `${CLIENT_ENDPOINT}/apply`, headers: { "Idempotency-Key": "k" }, body: { ledgerKey: "k" } });
    assert.equal(none.status, 409);
    assert.equal(none.body.exception.code, "apply_without_evaluation");
    const mismatch = ep.handle({ url: `${CLIENT_ENDPOINT}/apply`, headers: { "Idempotency-Key": "a" }, body: { ledgerKey: "b" } });
    assert.equal(mismatch.status, 400);
    assert.equal(ep.externalEffects(), 0);
    assert.equal(ep.handle({ url: `${CLIENT_ENDPOINT}/unknown`, body: {} }).status, 404);
  });

  test("every kit code and journey code has a suggested action", () => {
    for (const code of [...KIT_CODES, "schema_changed", "terms_changed", "capture_stale", "uncommitted", "ingestion_missing", "ingestion_incomplete", "ingestion_not_permitted", "continuation_file_missing", "integrity_mismatch", "owed_reference_unbound"]) {
      assert.ok(suggestedActionFor(code).length > 20, code);
    }
  });
});
