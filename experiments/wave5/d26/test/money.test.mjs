import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatUsdc, parseDecimal, usdcAtomic, usdCents } from "../lib/money.mjs";
import { computeCostAtomic } from "../lib/fees.mjs";

describe("money units", () => {
  it("parses USDC 6dp and Stripe cents 2dp as unlike amounts", () => {
    assert.equal(parseDecimal("0.003", 6), 3000n);
    assert.equal(formatUsdc(3000n), "0.003000");
    assert.equal(usdcAtomic("0.30").unit, "usdc-atomic");
    assert.equal(usdCents("0.30").unit, "usd-cents");
    assert.equal(usdcAtomic("0.30").value, 300000n);
    assert.equal(usdCents("0.30").value, 30n);
    assert.notEqual(usdcAtomic("0.30").value, usdCents("0.30").value);
  });

  it("60s T3 unlimited Linux model is 834 USDC atomic", () => {
    assert.equal(computeCostAtomic(1), 834n);
    assert.equal(computeCostAtomic(60_000), 834n);
    assert.equal(formatUsdc(834n), "0.000834");
  });
});
