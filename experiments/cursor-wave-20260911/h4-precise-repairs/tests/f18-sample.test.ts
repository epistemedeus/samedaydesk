import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { designCanary, invokeLiveSettle } from "../src/canary.ts";
import { FIXTURE_BECOMES_SALE } from "../src/failures.ts";
import {
  assertSampleIsNotCustomerUse,
  isF18SampleShape,
  strengthenFixtureBecomesSale,
} from "../src/f18-sample.ts";
import { acceptRepairIntake, completeRepair } from "../src/intake.ts";
import type { RepairIntakeDraft } from "../src/types.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sampleSale = join(packRoot, "fixtures/sample-example-intake.json");
const corpusPath = join(packRoot, "fixtures/corpus/F18-sample.json");

const SUPPLIED = {
  digestSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  mediaType: "application/json",
  bytes: 32,
};

function sampleDraft(overrides: Record<string, unknown> = {}): RepairIntakeDraft {
  return {
    defectId: "F18-sample",
    suppliedInput: SUPPLIED,
    scope: "SAMPLE fixture completion is not customer use",
    acceptanceTest: "saleState stays not_a_sale; fixture-becomes-sale if promoted",
    rollback: "discard",
    provenance: "fixture",
    saleState: "not_a_sale",
    ...overrides,
  };
}

test("SAMPLE fixture completion is not customer use", () => {
  const completed = assertSampleIsNotCustomerUse(sampleDraft({ labels: ["SAMPLE"] }));
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.completed, true);
  assert.equal(completed.saleState, "not_a_sale");
  assert.notEqual(completed.intake.provenance, "customer");

  const promoted = assertSampleIsNotCustomerUse(
    sampleDraft({ labels: ["SAMPLE"], provenance: "customer" }),
  );
  assert.equal(promoted.ok, false);
  if (promoted.ok) return;
  assert.equal(promoted.rejected, true);
  assert.equal(promoted.completed, false);
  assert.deepEqual(promoted.failure, FIXTURE_BECOMES_SALE);

  const extraShapes = [
    { label: "SAMPLE" },
    { sampleLabel: "SAMPLE" },
    { exampleMode: true },
    { sourceKind: "sample" },
  ];
  for (const shape of extraShapes) {
    assert.equal(isF18SampleShape(sampleDraft(shape)), true);
    const rejected = strengthenFixtureBecomesSale(
      sampleDraft({ ...shape, provenance: "customer" }),
    );
    assert.equal(rejected.ok, false);
    if (rejected.ok) continue;
    assert.deepEqual(rejected.failure, FIXTURE_BECOMES_SALE);
    assert.equal(rejected.saleState, "not_a_sale");
  }
});

test("--example cannot complete as customer", () => {
  const viaFlags = assertSampleIsNotCustomerUse(
    sampleDraft({ flags: ["--example"], provenance: "customer" }),
  );
  assert.equal(viaFlags.ok, false);
  if (!viaFlags.ok) assert.deepEqual(viaFlags.failure, FIXTURE_BECOMES_SALE);

  const viaExampleFlag = completeRepair(
    sampleDraft({ exampleFlag: "--example", provenance: "customer" }),
  );
  assert.equal(viaExampleFlag.ok, false);
  if (!viaExampleFlag.ok) assert.deepEqual(viaExampleFlag.failure, FIXTURE_BECOMES_SALE);

  const viaExtra = assertSampleIsNotCustomerUse(
    sampleDraft({ provenance: "customer" }),
    ["--example"],
  );
  assert.equal(viaExtra.ok, false);
  if (!viaExtra.ok) {
    assert.equal(viaExtra.rejected, true);
    assert.deepEqual(viaExtra.failure, FIXTURE_BECOMES_SALE);
  }

  const unpromoted = assertSampleIsNotCustomerUse(sampleDraft({ flags: ["--example"] }));
  assert.equal(unpromoted.ok, true);
  if (unpromoted.ok) {
    assert.equal(unpromoted.saleState, "not_a_sale");
    assert.notEqual(unpromoted.intake.provenance, "customer");
  }
});

test("existing fixtures/sample-example-intake.json still rejected", () => {
  const json = JSON.parse(readFileSync(sampleSale, "utf8"));
  const fromIntake = acceptRepairIntake(json);
  assert.equal(fromIntake.ok, false);
  if (!fromIntake.ok) assert.deepEqual(fromIntake.failure, FIXTURE_BECOMES_SALE);

  const fromAssert = assertSampleIsNotCustomerUse(json);
  assert.equal(fromAssert.ok, false);
  if (!fromAssert.ok) {
    assert.equal(fromAssert.rejected, true);
    assert.deepEqual(fromAssert.failure, FIXTURE_BECOMES_SALE);
  }

  const strengthened = strengthenFixtureBecomesSale(json);
  assert.equal(strengthened.ok, false);
  if (!strengthened.ok) assert.deepEqual(strengthened.failure, FIXTURE_BECOMES_SALE);
});

test("completeRepair of SAMPLE draft stays saleState not_a_sale / rejected if promoted", () => {
  const unpromoted = completeRepair(sampleDraft({ labels: ["SAMPLE"] }));
  assert.equal(unpromoted.ok, true);
  if (!unpromoted.ok) return;
  assert.equal(unpromoted.completed, true);
  assert.equal(unpromoted.saleState, "not_a_sale");
  assert.notEqual(unpromoted.intake.provenance, "customer");

  const promoted = completeRepair(
    sampleDraft({ labels: ["SAMPLE"], provenance: "customer", paid: true, settled: true }),
  );
  assert.equal(promoted.ok, false);
  if (!promoted.ok) {
    assert.equal(promoted.rejected, true);
    assert.equal(promoted.completed, false);
    assert.deepEqual(promoted.failure, FIXTURE_BECOMES_SALE);
  }

  const extraPromoted = assertSampleIsNotCustomerUse(
    sampleDraft({ label: "SAMPLE", provenance: "customer" }),
  );
  assert.equal(extraPromoted.ok, false);
  if (!extraPromoted.ok) assert.deepEqual(extraPromoted.failure, FIXTURE_BECOMES_SALE);

  const nested = strengthenFixtureBecomesSale({
    intake: sampleDraft({ sampleLabel: "SAMPLE" }),
    provenance: "customer",
  });
  assert.equal(nested.ok, false);
  if (!nested.ok) assert.deepEqual(nested.failure, FIXTURE_BECOMES_SALE);
});

test("canary authorized=false still must not settle", () => {
  const plan = designCanary();
  assert.equal(plan.canary.authorized, false);
  const settle = invokeLiveSettle(plan.canary);
  assert.equal(settle.ok, false);
  assert.equal(settle.rejected, true);
  assert.equal(settle.failure.code, "live-settle-refused");
  assert.equal(settle.failure.authorized, false);
  assert.equal(settle.failure.settleInvoked, false);
});

test("corpus F18-sample is fixed_with_regression for evaluator f18-sample", () => {
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  assert.equal(corpus.id, "F18-sample");
  assert.equal(corpus.disposition, "fixed_with_regression");
  assert.equal(corpus.kind, "regression");
  assert.equal(corpus.evaluator, "f18-sample");
  assert.equal(corpus.saleState, "not_a_sale");
  assert.equal(corpus.provenance, "fixture");
  assert.equal(corpus.authorized, false);
});
