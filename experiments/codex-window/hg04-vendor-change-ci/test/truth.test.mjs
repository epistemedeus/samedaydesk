import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { evaluatePair, invoiceAndForecast, loadUsage, machineAction, parsePricingSnapshot } from "../lib/truth.mjs";
import { ROOT } from "./helpers.mjs";

const openaiBefore = JSON.parse(readFileSync(join(ROOT, "fixtures/openai-gpt35-turbo-20230613-20240125/before.json"), "utf8"));
const openaiAfter = JSON.parse(readFileSync(join(ROOT, "fixtures/openai-gpt35-turbo-20230613-20240125/after.json"), "utf8"));
const openaiSource = JSON.parse(readFileSync(join(ROOT, "fixtures/openai-gpt35-turbo-20230613-20240125/SOURCE.json"), "utf8"));
const hostileAfter = JSON.parse(readFileSync(join(ROOT, "fixtures/hostile-partial-capture/after.json"), "utf8"));
const hostileSource = JSON.parse(readFileSync(join(ROOT, "fixtures/hostile-partial-capture/SOURCE.json"), "utf8"));

test("schema requires field, finite value, and unit", () => {
  const bad = parsePricingSnapshot({ rows: [{ field: "x", value: "1.0", unit: "USD" }] }, "after");
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(" "), /finite number/);
});

test("unit mismatch is not comparable", () => {
  const ev = evaluatePair({
    beforeJson: { rows: [{ field: "x", value: 1, unit: "USD/1K-tokens" }] },
    afterJson: { rows: [{ field: "x", value: 1000, unit: "USD/1M-tokens" }] },
    kitArtifact: { status: "partial" },
  });
  assert.equal(ev.unit.unitComparable, false);
  assert.equal(ev.independentArithmetic.length, 0);
  assert.equal(ev.wrapperStatus, "partial");
});

test("openai pair: schema, unit, coverage, membership, arithmetic", () => {
  const ev = evaluatePair({
    beforeJson: openaiBefore,
    afterJson: openaiAfter,
    source: openaiSource,
    kitArtifact: { status: "actionable" },
  });
  assert.equal(ev.schema.ok, true);
  assert.equal(ev.unit.unitComparable, true);
  assert.equal(ev.coverage.complete, true);
  assert.deepEqual(ev.membership.added, []);
  assert.deepEqual(ev.membership.removed, []);
  assert.deepEqual(ev.membership.shared, ["gpt-3.5-turbo-input", "gpt-3.5-turbo-output"]);
  assert.equal(ev.independentArithmetic.length, 2);
  assert.equal(ev.independentArithmetic[0].delta, -0.001);
  assert.equal(ev.independentArithmetic[1].delta, -0.0005);
  assert.equal(ev.wrapperStatus, "actionable");
  assert.equal(ev.billing.invoiceClaim, false);
  assert.equal(ev.billing.forecast, false);
});

test("hostile partial capture: coverage hole, not retirement", () => {
  const ev = evaluatePair({
    beforeJson: openaiBefore,
    afterJson: hostileAfter,
    source: hostileSource,
    kitArtifact: { status: "actionable" },
  });
  assert.equal(ev.schema.ok, true);
  assert.equal(ev.coverage.complete, false);
  assert.deepEqual(ev.membership.removed, ["gpt-3.5-turbo-output"]);
  assert.equal(ev.wrapperStatus, "partial");
  assert.equal(machineAction({ wrapperStatus: ev.wrapperStatus, baselineMatched: true }).kind, "resolve-partial-capture");
});

test("no usage means no invoice and no forecast", () => {
  const billing = invoiceAndForecast(loadUsage(null));
  assert.equal(billing.invoiceClaim, false);
  assert.equal(billing.forecast, false);
  const labeled = invoiceAndForecast(loadUsage({ label: "hypothetical", tokens: 10_000_000 }));
  assert.equal(labeled.invoiceClaim, false);
  assert.equal(labeled.forecast, false);
});

test("baseline mismatch action never updates the file", () => {
  const action = machineAction({ wrapperStatus: "actionable", baselineMatched: false, invoiceClaim: false });
  assert.equal(action.kind, "hold-baseline");
  assert.equal(action.ci, "fail");
  assert.equal(action.updateBaseline, false);
});
