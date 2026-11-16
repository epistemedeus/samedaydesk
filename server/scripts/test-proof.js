import assert from "node:assert/strict";
import { test } from "node:test";
import { projectProof } from "../routes/proof.js";

const health = (total, internal, routeCount = 3) => ({
  settlementReconciliation: { ledger: { reconciledSettlements: total, byClass: { internal } } },
  paymentProtocols: { x402: { routeCount } },
});

test("the proof projection reports actual zeros and leaves unknown counts null", () => {
  assert.equal(projectProof(health(3, { settlements: 0 })).internalSettlements, 0);
  assert.equal(projectProof(health(3, undefined)).internalSettlements, null);
  assert.equal(projectProof(health(3, { settlements: 4 })).internalSettlements, null);
  assert.equal(projectProof(health(3, { settlements: 1 }, "3")).x402Routes, null);
  assert.equal(projectProof(health(0, { settlements: 0 })).settlements, 0);
});

test("an absent or invalid total cannot replace the dated snapshot", () => {
  for (const bad of [undefined, "4", -1, NaN, 1.5]) assert.equal(projectProof(health(bad)), null);
  assert.equal(projectProof(null), null);
});
