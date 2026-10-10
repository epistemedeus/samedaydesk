/**
 * Focused positive and failure cases for the shared measurement rule.
 * Count, money, custom, and atomic values stay on one contract.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { judgeMetric, inspectNumeric } from "../lib/observatory/contract.js";
import { integerLabel } from "../lib/observatory/convergence.js";
import { MEASUREMENT_RULE, classifyUnit, measuredLabel } from "../lib/observatory/measurement.js";

const HUGE_NUMBER = Number.MAX_SAFE_INTEGER + 2;
const HUGE_TEXT = "9007199254740993";
const ATOMIC_TEXT = "9007199254740993000";

test("measurement rule keeps exact money and rejects unsafe counts", () => {
  assert.equal(MEASUREMENT_RULE, "pilot.observatory-measurement.v1");
  const usd = judgeMetric({ key: "volume", state: "ok", value: "10.50", unit: "USD" });
  const usdc = judgeMetric({ key: "volume", state: "ok", value: "10.50", unit: "USDC" });
  const zero = judgeMetric({ key: "jobs", state: "ok", value: 0, unit: "count" });
  const textZero = judgeMetric({ key: "escrow", state: "ok", value: "0", unit: "USDC" });
  assert.equal(usd.state, "ok");
  assert.equal(usd.value, "10.50");
  assert.equal(usd.unit, "USD");
  assert.equal(usd.unitClass, "money");
  assert.equal(usdc.unit, "USDC");
  assert.equal(usdc.unitClass, "money");
  assert.notEqual(usd.unit, usdc.unit);
  assert.equal(zero.value, 0);
  assert.equal(zero.unitClass, "count");
  assert.equal(textZero.value, "0");
  assert.equal(textZero.unitClass, "money");

  for (const value of [1.5, "10.50", HUGE_NUMBER, HUGE_TEXT, -1, Number.NaN]) {
    const metric = judgeMetric({ key: "jobs", state: "ok", value, unit: "count" });
    assert.equal(metric.state, "invalid", String(value));
    assert.equal(metric.value, null, String(value));
    assert.equal(metric.unitClass, "count");
    assert.notEqual(metric.value, 0);
  }

  const hugeMoney = judgeMetric({ key: "volume", state: "ok", value: HUGE_NUMBER, unit: "USD" });
  assert.equal(hugeMoney.state, "invalid");
  assert.equal(hugeMoney.value, null);
  assert.equal(hugeMoney.unit, "USD");
  const hugeMoneyText = judgeMetric({ key: "volume", state: "ok", value: HUGE_TEXT, unit: "USDC" });
  assert.equal(hugeMoneyText.state, "invalid");
  assert.equal(hugeMoneyText.value, null);
  assert.equal(inspectNumeric(HUGE_NUMBER, "decimal").state, "invalid");
  assert.equal(inspectNumeric(HUGE_TEXT, "integer").state, "invalid");
  assert.equal(inspectNumeric(1021.25, "decimal").value, 1021.25);
  const aligned = judgeMetric({ key: "marketplaceCompletionRatio", state: "ok", value: "6/48", unit: "ratio" });
  assert.equal(aligned.state, "ok");
  assert.equal(aligned.value, "6/48");
  assert.equal(aligned.unitClass, "ratio");
  assert.equal(judgeMetric({ key: "zero-ratio", state: "ok", value: "0/48", unit: "ratio" }).value, "0/48");
  assert.equal(judgeMetric({ key: "bad-ratio", state: "ok", value: "6/0", unit: "ratio" }).value, null);
  assert.equal(judgeMetric({ key: "not-money", state: "ok", value: "6/48", unit: "USD" }).state, "invalid");
  assert.equal(judgeMetric({ key: "share", state: "ok", value: 0.73, unit: "ratio" }).value, 0.73);
});

test("custom units stay custom and atomic text stays exact", () => {
  const custom = judgeMetric({ key: "rows", state: "ok", value: "10.50", unit: "transactions" });
  assert.equal(custom.state, "ok");
  assert.equal(custom.value, "10.50");
  assert.equal(custom.unit, "transactions");
  assert.equal(custom.unitClass, "custom");
  assert.notEqual(custom.unitClass, "money");
  assert.notEqual(custom.unitClass, "count");
  assert.equal(classifyUnit("transactions").known, false);
  assert.equal(classifyUnit("usd").unitClass, "custom");
  assert.equal(classifyUnit({ name: "USD" }).unitClass, "invalid");

  assert.equal(integerLabel(11), "11");
  assert.equal(integerLabel("0"), "0");
  assert.equal(integerLabel(HUGE_TEXT), null);
  assert.equal(integerLabel(-1), null);
  assert.equal(integerLabel(Number.NaN), null);
  assert.equal(integerLabel("10.50"), null);
  assert.equal(integerLabel("5000", "atomic"), "5000");
  assert.equal(integerLabel(ATOMIC_TEXT, "atomic"), ATOMIC_TEXT);
  assert.equal(integerLabel(HUGE_NUMBER, "atomic"), null);
  assert.equal(integerLabel("-5", "atomic"), null);
  assert.equal(integerLabel("10.50", "atomic"), null);

  const negativeLabel = measuredLabel(-1, "provider_call_label");
  assert.equal(negativeLabel.state, "invalid");
  assert.equal(negativeLabel.value, null);
  assert.equal(negativeLabel.unitClass, "count");
  const nanLabel = measuredLabel(Number.NaN, "provider_payer_label");
  assert.equal(nanLabel.state, "invalid");
  assert.equal(Object.is(nanLabel.value, Number.NaN), false);
  const atomic = measuredLabel(ATOMIC_TEXT, "atomic");
  assert.equal(atomic.state, "measured");
  assert.equal(atomic.value, ATOMIC_TEXT);
  assert.equal(atomic.unitClass, "atomic");
  assert.notEqual(atomic.unitClass, "money");
});

test("the installed consumer copy of the measurement rule matches this file", () => {
  const serverRule = readFileSync(new URL("../lib/observatory/measurement.js", import.meta.url), "utf8");
  assert.match(serverRule, /export const MEASUREMENT_RULE = "pilot\.observatory-measurement\.v1"/);
  assert.equal(serverRule.includes("USD: contract(\"money\""), true);
  assert.equal(serverRule.includes("USDC: contract(\"money\""), true);
  assert.doesNotMatch(serverRule, /USD:\s*contract\("money", "decimal"\),\s*USDC:\s*contract\("money", "decimal"\)[\s\S]*USDC:\s*"USD"/);
});
