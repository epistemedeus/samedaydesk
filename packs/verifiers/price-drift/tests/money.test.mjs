import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAmountMatchesAtomic,
  formatCompactUsdc,
  parseAtomicString,
  parseUsdcDecimal,
} from "../src/money.mjs";

test("atomic 5000 is 0.005 USDC", () => {
  assert.equal(parseUsdcDecimal("0.005", "amount").toString(), "5000");
  assert.equal(parseUsdcDecimal("0.005000", "amount").toString(), "5000");
  assert.equal(formatCompactUsdc(5000n), "0.005");
});

test("atomic 10000 is 0.01 USDC", () => {
  assert.equal(parseUsdcDecimal("0.01", "amount").toString(), "10000");
  assert.equal(formatCompactUsdc(10000n), "0.01");
});

test("JS number money is refused", () => {
  assert.throws(() => parseUsdcDecimal(0.005, "amount"), /JS number/);
  assert.throws(() => parseAtomicString(5000, "amountAtomic"), /JS number/);
});

test("amount must match atomic", () => {
  assert.equal(assertAmountMatchesAtomic("0.005", "5000", "extract").toString(), "5000");
  assert.throws(
    () => assertAmountMatchesAtomic("5000", "5000", "extract"),
    /does not match amountAtomic/,
  );
});
