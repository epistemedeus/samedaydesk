import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compareEffort } from "../src/effort.mjs";
import { validateBundle } from "../src/schema.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

test("direct-cheaper compares measured separate and bundled costs", () => {
  const effort = compareEffort(validateBundle(load("direct-cheaper.json")).bundle);
  assert.equal(effort.disclosure, "measured");
  assert.equal(effort.comparison, "direct_lower_measured_effort");
  assert.equal(effort.directCostAtomic, "700000");
  assert.equal(effort.bundledCostAtomic, "900000");
  assert.equal(effort.breakEven.direct.breakEvenGrossAtomic, "14000000");
  assert.equal(effort.inventedPricing, false);
});

test("bundle-helpful reports a lower measured bundled cost", () => {
  const effort = compareEffort(validateBundle(load("bundle-helpful.json")).bundle);
  assert.equal(effort.comparison, "bundle_lowers_measured_effort");
  assert.equal(effort.directCostAtomic, "380000");
  assert.equal(effort.bundledCostAtomic, "250000");
  assert.equal(effort.breakEven.bundled.breakEvenGrossAtomic, "5000000");
});

test("unknown-effort stays costs_unknown and does not invent prices", () => {
  const effort = compareEffort(validateBundle(load("unknown-effort.json")).bundle);
  assert.equal(effort.disclosure, "costs_unknown");
  assert.equal(effort.comparison, "costs_unknown");
  assert.equal(effort.directCostAtomic, "costs_unknown");
  assert.equal(effort.bundledCostAtomic, "costs_unknown");
  assert.equal(effort.breakEven.direct.breakEvenGrossAtomic, "costs_unknown");
  assert.equal(effort.inventedPricing, false);
});
