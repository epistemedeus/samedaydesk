import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DATA_ROOT, loadPin } from "../lib/paths.mjs";
import { loadStore } from "../lib/store.mjs";
import { COVERAGE_STATEMENT, DISJOINT_FROM } from "../lib/schema.mjs";
import { detectH04Leak, disjointFromH04 } from "../lib/h04.mjs";

test("catalog, pin, and coverage file deny universal coverage", () => {
  const store = loadStore(DATA_ROOT);
  const pin = loadPin();
  const coverage = readFileSync(join(DATA_ROOT, "COVERAGE.txt"), "utf8");
  assert.equal(store.catalog.coverage.universal, false);
  assert.equal(store.catalog.coverage.namedSourceOnly, true);
  assert.equal(store.catalog.coverage.statement, COVERAGE_STATEMENT);
  assert.equal(pin.universalCoverage, false);
  assert.equal(pin.liveScrape, false);
  assert.equal(store.catalog.liveScrape, false);
  assert.ok(coverage.includes(COVERAGE_STATEMENT));
  assert.ok(store.catalog.coverageGaps.length >= 3);
  assert.ok(store.catalog.coverageGaps.some((gap) => gap.id === "taskforce"));
  assert.ok(store.catalog.coverageGaps.some((gap) => gap.id === "unnamed-work-platforms"));
});

test("pack is disjoint from H04 licensed regression packs", () => {
  const store = loadStore(DATA_ROOT);
  const pin = loadPin();
  assert.equal(disjointFromH04(store.catalog), true);
  assert.deepEqual(pin.disjointFrom, DISJOINT_FROM);
  for (const item of store.records) {
    assert.deepEqual(detectH04Leak(item.record), []);
    assert.equal(Object.hasOwn(item.record, "hiddenAnswers"), false);
    assert.equal(Object.hasOwn(item.record, "goldAnswers"), false);
    assert.equal(Object.hasOwn(item.record, "regressionPack"), false);
  }
});

test("H04 leak candidate is refused", () => {
  const store = loadStore(DATA_ROOT);
  const sample = structuredClone(store.records[0].record);
  sample.id = "h04-leak-seed";
  sample.hiddenAnswers = { q1: "secret gold" };
  const errors = detectH04Leak(sample);
  assert.ok(errors.some((item) => item.code === "h04_regression_pack_leak"));
});
