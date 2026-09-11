import assert from "node:assert/strict";
import test from "node:test";

import { designCanary, executeCanaryPurchase, invokeLiveSettle } from "../src/canary.ts";
import { LIVE_PRICES } from "../src/constants.ts";

test("canary design is ownerQa, not external revenue, unauthorized, design-only", () => {
  const plan = designCanary("extract");
  assert.deepEqual(plan.canary, {
    purchaseCap: {
      amount: LIVE_PRICES.extract.amountAtomic,
      asset: LIVE_PRICES.extract.asset,
      network: LIVE_PRICES.extract.network,
    },
    ownerQa: true,
    externalRevenue: false,
    authorized: false,
  });
  assert.equal(plan.designOnly, true);
  assert.equal(plan.executed, false);
  assert.equal(plan.purchaseInvoked, false);
  assert.equal(plan.settleInvoked, false);
  assert.equal(plan.livePriceDisplay, "$0.005");
});

test("seller-integrity-audit canary cap matches live $0.01 pin and stays unauthorized", () => {
  const plan = designCanary("seller-integrity-audit");
  assert.deepEqual(plan.canary.purchaseCap, {
    amount: "10000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: "eip155:8453",
  });
  assert.equal(plan.canary.authorized, false);
  assert.equal(plan.livePriceDisplay, "$0.01");
  assert.equal(plan.ownerQa, true);
  assert.equal(plan.externalRevenue, false);
});

test("canary helpers refuse purchase and settle without touching a network", () => {
  const plan = designCanary();
  assert.equal(invokeLiveSettle(plan.canary).ok, false);
  assert.equal(executeCanaryPurchase(plan).ok, false);
});
