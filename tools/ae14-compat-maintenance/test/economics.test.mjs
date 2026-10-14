import assert from "node:assert/strict";
import test from "node:test";
import { feeAtoms, quoteCaptures } from "../src/fee.mjs";
import { runMaintenanceOccurrence } from "../src/occurrence.mjs";
import { request } from "./support.mjs";

test("per-capture floor keeps 19, 20, 21, and a large integer exact", () => {
  assert.equal(feeAtoms(19n), 0n);
  assert.equal(feeAtoms(20n), 1n);
  assert.equal(feeAtoms(21n), 1n);
  assert.equal(feeAtoms(9007199254740993n), 450359962737049n);
  const separate = quoteCaptures([19n, 21n]);
  const combined = quoteCaptures([40n]);
  assert.equal(separate.feeAtoms, "1");
  assert.equal(combined.feeAtoms, "2");
  assert.equal(separate.perCaptureDiffersFromCombined, true);
  assert.deepEqual(separate.perCaptureNetAtoms, ["19", "20"]);
  assert.equal(combined.perCaptureNetAtoms[0], "38");
});

test("a quoted occurrence uses one capture floor and does not fold rail cost into it", async () => {
  const one = await runMaintenanceOccurrence(request({ economics: { grossAtoms: "21" } }));
  const pair = await runMaintenanceOccurrence(request({
    economics: { grossAtoms: undefined, captures: ["19", "21"] },
  }));
  assert.equal(one.economics.feeAtoms, "1");
  assert.deepEqual(one.economics.perCaptureNetAtoms, ["20"]);
  assert.equal(one.economics.secondFeeAtoms, "0");
  assert.equal(one.economics.cashCost, "unknown");
  assert.equal(one.economics.modeledCost, "unknown");
  assert.equal(pair.economics.feeAtoms, "1");
  assert.equal(pair.economics.combinedGrossFeeAtoms, "2");
  assert.equal(pair.quoteWrites, 1);
  assert.equal(pair.railPosts, 0);
});

test("cumulative fee, guessed token price, unknown-as-zero, and cash-shaped cost are refused", async () => {
  const cumulative = await runMaintenanceOccurrence(request({ economics: { feeMode: "cumulative" } }));
  const guessed = await runMaintenanceOccurrence(request({ economics: { tokenPriceRecommendation: "1" } }));
  const zero = await runMaintenanceOccurrence(request({ economics: { reviewBurden: "0" } }));
  const cash = await runMaintenanceOccurrence(request({ economics: { cashCost: "1.00" } }));
  const transport = await runMaintenanceOccurrence(request({ economics: { observedEffort: "transport" } }));
  assert.equal(cumulative.code, "cumulative_fee");
  assert.equal(guessed.code, "guessed_token_price");
  assert.equal(guessed.tokenPriceRecommendation, null);
  assert.equal(zero.code, "unknown_stored_as_zero");
  assert.equal(cash.code, "modeled_cost_presented_as_cash");
  assert.equal(transport.ok, true);
  assert.equal(transport.economics.observedEffort, "unknown");
  assert.equal(transport.economics.observedCompleteEffort, "unknown");
  assert.equal(transport.economics.declaredEffort, "declared");
});

test("withdrawal, unearned reclaim, and post-capture refund take no second fee and stay distinct", async () => {
  const operations = ["withdrawal", "unearned_reclaim", "post_capture_refund"];
  const results = [];
  for (const operation of operations) {
    results.push(await runMaintenanceOccurrence(request({
      economics: { operation, grossAtoms: "20" },
    })));
  }
  assert.deepEqual(results.map((result) => result.economics.operation), operations);
  for (const result of results) {
    assert.equal(result.economics.feeAtoms, "0");
    assert.equal(result.economics.secondFeeAtoms, "0");
    assert.equal(result.economics.noSecondFee, true);
    assert.equal(result.economics.operationDistinct, true);
    assert.equal(result.captured, false);
  }
});

test("a stale supplied horizon stops before acceptance", async () => {
  const result = await runMaintenanceOccurrence(request({ horizonHours: 24 }));
  assert.equal(result.detected, "stale_baseline");
  assert.equal(result.disposition, "stale_baseline");
  assert.equal(result.acceptance, "not_applicable");
  assert.equal(result.quoteWrites, 0);
  assert.equal(result.useful, true);
});

test("payment replay is blocked by the recipe guard", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { readFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "ae14-e11-pay-"));
  const prior = JSON.parse(readFileSync(new URL("../fixtures/prior.json", import.meta.url), "utf8"));
  prior.payment = { attempted: true };
  const path = join(dir, "prior.json");
  writeFileSync(path, JSON.stringify(prior));
  const blocked = await runMaintenanceOccurrence(request({ priorPath: path, replayPayment: true }));
  const authority = await runMaintenanceOccurrence(request({ replayPayment: true }));
  assert.equal(blocked.code, "payment_replay_blocked");
  assert.equal(authority.code, "payment_authority_required");
  assert.equal(blocked.railPosts, 0);
  assert.equal(authority.funding.paymentSent, false);
});
