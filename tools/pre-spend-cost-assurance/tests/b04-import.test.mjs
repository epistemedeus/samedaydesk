import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadB04Money } from "../src/b04-import.mjs";
import { atomicToCapString } from "../src/money-display.mjs";
import { USDC_DECIMALS } from "../src/pins.mjs";

describe("B04 import shape", () => {
  test("loads fixture money when Neo is not attached", async () => {
    const money = await loadB04Money();
    assert.equal(money.attached, false);
    assert.equal(money.kind, "fixture");
    assert.equal(typeof money.atomicToDecimal, "function");
    assert.equal(typeof money.decimalToAtomic, "function");
    assert.equal(money.atomicToDecimal(5000n, USDC_DECIMALS), "0.005000");
    assert.equal(money.atomicToDecimal(10000n, USDC_DECIMALS), "0.010000");
    assert.equal(atomicToCapString(money.atomicToDecimal, 15000n, USDC_DECIMALS), "0.015");
    assert.equal(money.decimalToAtomic("0.005000", USDC_DECIMALS), 5000n);
    assert.equal(money.moneyScale("USDC"), 6);
  });

  test("5000 atomic is not 5000 dollars", async () => {
    const money = await loadB04Money();
    const usdc = atomicToCapString(money.atomicToDecimal, 5000n, USDC_DECIMALS);
    assert.equal(usdc, "0.005");
    assert.notEqual(usdc, "5000");
  });
});
