import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { acceptRepairIntake, completeRepair, intakeFromFixture } from "../src/intake.ts";
import { assertHonestDiagnostics, markFieldSigned } from "../src/diagnostics.ts";
import { designCanary, executeCanaryPurchase, invokeLiveSettle } from "../src/canary.ts";
import {
  refusePaymentFnReassignment,
  refusePriceChange,
} from "../src/guardrails.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mismatch = join(packRoot, "fixtures/mismatch-missing-resource.json");
const sampleSale = join(packRoot, "fixtures/sample-example-intake.json");
const missingInput = join(packRoot, "fixtures/missing-supplied-input.json");

test("seeded failure fixture-becomes-sale: SAMPLE/--example/fixture marked paid, settled, or customer", () => {
  const expected = {
    code: "fixture-becomes-sale",
    rejected: true,
    completed: false,
    saleState: "not_a_sale",
    allowedProvenance: ["fixture", "test"],
    reason:
      "Fixture, SAMPLE, or --example input cannot enter provenance=customer or any paid/settled state",
  };

  const fromFile = acceptRepairIntake(JSON.parse(readFileSync(sampleSale, "utf8")));
  assert.equal(fromFile.ok, false);
  if (!fromFile.ok) assert.deepEqual(fromFile.failure, expected);

  const examplePaid = intakeFromFixture(mismatch, {
    flags: ["--example"],
    paid: true,
  });
  assert.equal(examplePaid.ok, false);
  if (!examplePaid.ok) assert.deepEqual(examplePaid.failure, expected);

  const fixtureCustomer = intakeFromFixture(mismatch, { provenance: "customer" });
  assert.equal(fixtureCustomer.ok, false);
  if (!fixtureCustomer.ok) assert.deepEqual(fixtureCustomer.failure, expected);

  const fixtureSettled = intakeFromFixture(mismatch, { settled: true });
  assert.equal(fixtureSettled.ok, false);
  if (!fixtureSettled.ok) assert.deepEqual(fixtureSettled.failure, expected);
});

test("seeded failure live settle invoked from the canary design", () => {
  const expected = {
    code: "live-settle-refused",
    rejected: true,
    authorized: false,
    settleInvoked: false,
    purchaseInvoked: false,
    reason: "authorized=false canary design must not call live settle",
  };
  const plan = designCanary();
  assert.equal(plan.canary.authorized, false);
  const settle = invokeLiveSettle(plan.canary);
  assert.equal(settle.ok, false);
  assert.deepEqual(settle.failure, expected);
  const purchase = executeCanaryPurchase(plan);
  assert.equal(purchase.ok, false);
  assert.deepEqual(purchase.failure, expected);
});

test("seeded failure diagnostic treats unsigned indexing hint as payment-signature authority", () => {
  const expected = {
    code: "unsigned-hint-is-not-authority",
    rejected: true,
    signedAuthority: "payload",
    unsignedHints: ["resource", "extensions.bazaar"],
    reason:
      "resource and extensions.bazaar are unsigned indexing hints; only payload carries payment-signature authority",
  };

  const dishonestResource = {
    field: "resource",
    present: true,
    signed: true,
    drift: "none",
  };
  const resourceCheck = assertHonestDiagnostics([dishonestResource]);
  assert.equal(resourceCheck.ok, false);
  if (!resourceCheck.ok) {
    assert.deepEqual(resourceCheck.failure, expected);
    assert.deepEqual(resourceCheck.offender, dishonestResource);
  }

  const dishonestBazaar = {
    field: "extensions.bazaar",
    present: false,
    signed: true,
    drift: "missing_hint",
  };
  const bazaarCheck = assertHonestDiagnostics([dishonestBazaar]);
  assert.equal(bazaarCheck.ok, false);
  if (!bazaarCheck.ok) assert.deepEqual(bazaarCheck.failure, expected);

  const mark = markFieldSigned("resource", true);
  assert.equal(mark.ok, false);
  if (!mark.ok) assert.deepEqual(mark.failure, expected);
});

test("seeded failure changing live prices or reassigning verifyPayment / settlePayment", () => {
  const expected = {
    code: "live-payment-surface-immutable",
    rejected: true,
    livePrices: {
      extract: "$0.005",
      "seller-integrity-audit": "$0.01",
    },
    verifyPaymentReassigned: false,
    settlePaymentReassigned: false,
    reason: "Must not change live prices or reassign verifyPayment / settlePayment",
  };

  const price = refusePriceChange({ extract: "$0.006" });
  assert.equal(price.ok, false);
  assert.deepEqual(price.failure, expected);

  const verify = refusePaymentFnReassignment({ verifyPayment: () => "nope" });
  assert.equal(verify.ok, false);
  assert.deepEqual(verify.failure, expected);

  const settle = refusePaymentFnReassignment({ settlePayment: () => "nope" });
  assert.equal(settle.ok, false);
  assert.deepEqual(settle.failure, expected);
});

test("seeded failure missing supplied input accepted as a completed repair", () => {
  const expected = {
    code: "missing-supplied-input",
    rejected: true,
    completed: false,
    required: ["digestSha256", "mediaType", "bytes"],
    reason: "Completed repair requires suppliedInput digestSha256, mediaType, and bytes",
  };

  const draft = JSON.parse(readFileSync(missingInput, "utf8"));
  const accepted = acceptRepairIntake(draft);
  assert.equal(accepted.ok, false);
  if (!accepted.ok) {
    assert.equal(accepted.completed, false);
    assert.deepEqual(accepted.failure, expected);
  }

  const completed = completeRepair({
    defectId: "g03-missing-input",
    provenance: "fixture",
    saleState: "not_a_sale",
    scope: "x",
    acceptanceTest: "x",
    rollback: "x",
  });
  assert.equal(completed.ok, false);
  assert.equal(completed.completed, false);
  assert.deepEqual(completed.failure, expected);

  const emptyDigest = acceptRepairIntake({
    defectId: "g03-empty",
    suppliedInput: { digestSha256: "", mediaType: "application/json", bytes: 1 },
    scope: "x",
    acceptanceTest: "x",
    rollback: "x",
    provenance: "fixture",
  });
  assert.equal(emptyDigest.ok, false);
  if (!emptyDigest.ok) assert.deepEqual(emptyDigest.failure, expected);

  const zeroBytes = acceptRepairIntake({
    defectId: "g03-zero",
    suppliedInput: {
      digestSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      mediaType: "application/json",
      bytes: 0,
    },
    scope: "x",
    acceptanceTest: "x",
    rollback: "x",
    provenance: "fixture",
  });
  assert.equal(zeroBytes.ok, false);
  if (!zeroBytes.ok) assert.deepEqual(zeroBytes.failure, expected);
});
