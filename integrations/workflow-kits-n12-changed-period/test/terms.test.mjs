import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { periodNPlus1Request, periodNRequest } from "../src/fixtures.mjs";
import { periodNPlus1Preview, periodNPreview } from "../src/vendor-paths.mjs";
import { byKey, endpoint, evaluate, evaluateAndApply, root } from "./helpers.mjs";

const T_N = periodNPreview().termsVersion;
const T_N1 = periodNPlus1Preview().termsVersion;

function twoPeriods() {
  const ep = endpoint();
  evaluateAndApply(ep, periodNRequest());
  evaluateAndApply(ep, periodNPlus1Request({ stale: false }));
  return ep;
}

describe("old accepted terms are preserved", () => {
  test("period N receipts keep the period N termsVersion after period N+1 applies under new terms", () => {
    const ep = twoPeriods();
    const receipts = ep.receipts.snapshot();
    assert.deepEqual(receipts.filter((r) => r.periodId === "period-N").map((r) => r.termsVersion), [T_N, T_N, T_N]);
    assert.deepEqual(receipts.filter((r) => r.periodId === "period-N+1").map((r) => r.termsVersion), [T_N1, T_N1, T_N1, T_N1]);
  });

  test("rerunning period N with the later exchange terms is terms_changed; nothing evaluated, committed or applied", () => {
    const ep = twoPeriods();
    const commits = ep.effects.commitCount();
    const before = JSON.stringify(ep.receipts.snapshot());
    const body = evaluate(ep, periodNRequest({ termsPreview: periodNPlus1Preview() })).body;
    for (const r of body.records) {
      assert.equal(r.exception.code, "terms_changed");
      assert.equal(r.exception.source, "ledger");
      assert.deepEqual(r.exception.fields, [{ kind: "terms_changed", path: "termsVersion", expected: T_N, actual: T_N1 }]);
      assert.equal(r.receipt.termsVersion, T_N);
      assert.match(r.exception.suggestedAction, /Old accepted terms stay attached/);
    }
    assert.equal(ep.effects.commitCount(), commits);
    assert.equal(JSON.stringify(ep.receipts.snapshot()), before);
  });

  test("a locally hashed termsVersion that differs from the exchange value is terms_changed from the journey", () => {
    const ep = endpoint();
    evaluateAndApply(ep, periodNRequest());
    const request = periodNPlus1Request({ stale: false, claimLocalHash: true });
    assert.notEqual(request.period.termsInput.claimedTermsVersion, T_N1);
    const r = byKey(evaluate(ep, request).body)["r-001"];
    assert.equal(r.exception.code, "terms_changed");
    assert.equal(r.exception.source, "journey");
    assert.equal(r.exception.fieldPath, "period.termsInput.claimedTermsVersion");
    assert.equal(ep.externalEffects(), 3);
  });

  test("the journey's replay carries the period N accepted terms alongside the new ones", () => {
    const ep = endpoint();
    evaluateAndApply(ep, periodNRequest());
    const r = byKey(evaluate(ep, periodNPlus1Request({ stale: false })).body)["r-002"];
    assert.equal(r.termsVersion, T_N1);
    assert.equal(r.period.recordEvidence.termsVersion, T_N1);
  });

  test("kit source never hashes terms itself", () => {
    for (const name of readdirSync(join(root, "src"))) {
      const text = readFileSync(join(root, "src", name), "utf8");
      assert.ok(!/hashTermsVersion\s*\(/.test(text), `${name} calls hashTermsVersion`);
      assert.ok(!/createHash\([^)]*\)[\s\S]{0,80}terms/i.test(text), `${name} hashes terms`);
    }
  });
});
