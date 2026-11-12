import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { periodNPlus1Request, periodNRequest } from "../src/fixtures.mjs";
import { apply, byKey, endpoint, evaluate, evaluateAndApply, replay } from "./helpers.mjs";

describe("retry and outcome recovery", () => {
  test("uncommitted first request: retryable, replay with the same key commits once, then applies once", () => {
    const ep = endpoint({ faults: [{ type: "uncommitted", periodId: "period-N+1", recordKey: "r-002" }] });
    evaluateAndApply(ep, periodNRequest());
    const body = evaluate(ep, periodNPlus1Request({ stale: false })).body;
    const r2 = byKey(body)["r-002"];
    assert.equal(r2.exception.code, "uncommitted");
    assert.equal(r2.exception.retryable, true);
    assert.equal(r2.sameIdempotencyKey, r2.idempotencyKey);
    const commitsBefore = ep.effects.commitCount(r2.idempotencyKey);
    assert.equal(commitsBefore, 0, "nothing fabricated for the uncommitted request");
    const replayed = replay(ep, r2).body.record;
    assert.equal(replayed.outcome, "ready");
    assert.equal(replayed.idempotencyKey, r2.idempotencyKey);
    assert.equal(ep.effects.commitCount(r2.idempotencyKey), 1);
    assert.equal(apply(ep, replayed, body.periodId).status, 201);
    const again = replay(ep, r2).body.record;
    assert.equal(again.outcome, "already_applied");
    assert.equal(again.period.retry.recovered, true);
    assert.equal(again.period.retry.secondEffect, false);
    assert.equal(ep.effects.commitCount(r2.idempotencyKey), 1);
  });

  test("lost apply reply: the effect happened once; a rerun reports already_applied and applies nothing", () => {
    const ep = endpoint({ faults: [{ type: "lost_apply_reply", periodId: "period-N", recordKey: "r-001" }] });
    const body = evaluate(ep, periodNRequest()).body;
    const lost = apply(ep, body.records[0], body.periodId);
    assert.equal(lost.transportError, true);
    assert.equal(ep.externalEffects(), 1);
    const rerun = byKey(evaluate(ep, periodNRequest()).body);
    assert.equal(rerun["r-001"].outcome, "already_applied");
    assert.equal(rerun["r-001"].receipt.applyCount, 1);
    const second = apply(ep, body.records[0], body.periodId);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, true);
    assert.equal(ep.externalEffects(), 1);
  });

  test("stale capture: rerun with a fresh capture applies the record once", () => {
    const ep = endpoint();
    evaluateAndApply(ep, periodNRequest());
    evaluateAndApply(ep, periodNPlus1Request());
    assert.equal(ep.receipts.forPeriodRecord("period-N+1", "r-004"), null);
    const rerun = byKey(evaluateAndApply(ep, periodNPlus1Request({ stale: false })));
    assert.equal(rerun["r-004"].outcome, "ready");
    assert.equal(ep.receipts.forPeriodRecord("period-N+1", "r-004").captureId, "cap-wk-cp-n1-r-004");
    assert.equal(rerun["r-001"].outcome, "already_applied");
  });

  test("record_already_applied: same period, same terms, changed capture is not applied twice", () => {
    const ep = endpoint();
    evaluateAndApply(ep, periodNRequest());
    const request = periodNRequest();
    request.records[0].captureRef = "cap-wk-cp-n-r-001-recaptured";
    const r = byKey(evaluate(ep, request).body)["r-001"];
    assert.equal(r.exception.code, "record_already_applied");
    assert.equal(r.exception.source, "kit");
    assert.equal(ep.externalEffects(), 3);
  });
});
