import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { designCanary, executeCanaryPurchase, invokeLiveSettle } from "../src/canary.ts";
import { assertHonestDiagnostics, markFieldSigned } from "../src/diagnostics.ts";
import {
  FIXTURE_BECOMES_SALE,
  LIVE_PAYMENT_SURFACE_IMMUTABLE,
  LIVE_SETTLE_REFUSED,
  MISSING_SUPPLIED_INPUT,
  UNSIGNED_HINT_NOT_AUTHORITY,
} from "../src/failures.ts";
import {
  NEO_CLAIM_IDS,
  NEO_NOT_PATCHED_ON_SDS,
  assertCanaryMustNotSettle,
  assertFixtureCannotBecomeCustomer,
  assertLivePricesUnchanged,
  refuseNeoPatchedOnSdsClaim,
  refusePaymentFnReassignment,
  refusePriceChange,
} from "../src/guardrail-h4r.ts";
import { acceptRepairIntake, completeRepair } from "../src/intake.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sampleSale = join(packRoot, "fixtures/sample-example-intake.json");
const missingInput = join(packRoot, "fixtures/missing-supplied-input.json");

test("Neo patched-on-SDS claim is rejected for F01/F07 aliases", () => {
  assert.deepEqual(NEO_NOT_PATCHED_ON_SDS, {
    code: "neo-defect-not-patched-on-sds",
    rejected: true,
    patchedOnSds: false,
    ids: ["M-termsVersion", "M-F07"],
    reason: "F01/F07 Neo defects are not patched on SDS",
  });
  assert.equal(NEO_NOT_PATCHED_ON_SDS.patchedOnSds, false);
  assert.deepEqual([...NEO_CLAIM_IDS], [
    "M-termsVersion",
    "M-F07",
    "F01",
    "F07",
    "termsVersion",
  ]);

  for (const id of NEO_CLAIM_IDS) {
    const claimed = refuseNeoPatchedOnSdsClaim({
      id,
      patchedOnSds: true,
      note: "must never be accepted as an SDS patch",
    });
    assert.equal(claimed.ok, false);
    assert.equal(claimed.rejected, true);
    assert.equal(claimed.failure.patchedOnSds, false);
    assert.deepEqual(claimed.failure, NEO_NOT_PATCHED_ON_SDS);
    assert.deepEqual(claimed.failure.ids, ["M-termsVersion", "M-F07"]);
  }

  const batch = refuseNeoPatchedOnSdsClaim({
    ids: ["M-termsVersion", "M-F07", "F01", "F07", "termsVersion"],
    patchedOnSds: true,
  });
  assert.equal(batch.ok, false);
  assert.deepEqual(batch.failure, NEO_NOT_PATCHED_ON_SDS);

  const byString = refuseNeoPatchedOnSdsClaim("F01");
  assert.equal(byString.ok, false);
  assert.equal(byString.failure.code, "neo-defect-not-patched-on-sds");
});

test("fixture-becomes-sale still rejected for SAMPLE customer intake", () => {
  const sample = JSON.parse(readFileSync(sampleSale, "utf8"));
  assert.equal(sample.provenance, "customer");
  assert.match(String(sample.defectId), /SAMPLE/i);

  const fromFile = acceptRepairIntake(sample);
  assert.equal(fromFile.ok, false);
  if (!fromFile.ok) assert.deepEqual(fromFile.failure, FIXTURE_BECOMES_SALE);

  const guarded = assertFixtureCannotBecomeCustomer(sample);
  assert.equal(guarded.ok, false);
  if (!guarded.ok) {
    assert.equal(guarded.rejected, true);
    assert.deepEqual(guarded.failure, FIXTURE_BECOMES_SALE);
    assert.equal(guarded.failure.saleState, "not_a_sale");
  }

  const customerOnly = assertFixtureCannotBecomeCustomer({
    provenance: "customer",
    saleState: "not_a_sale",
  });
  assert.equal(customerOnly.ok, false);
  if (!customerOnly.ok) assert.deepEqual(customerOnly.failure, FIXTURE_BECOMES_SALE);

  const settled = assertFixtureCannotBecomeCustomer({
    provenance: "fixture",
    saleState: "settled",
  });
  assert.equal(settled.ok, false);
  if (!settled.ok) assert.deepEqual(settled.failure, FIXTURE_BECOMES_SALE);

  const allowed = assertFixtureCannotBecomeCustomer({
    provenance: "fixture",
    saleState: "not_a_sale",
  });
  assert.deepEqual(allowed, {
    ok: true,
    rejected: false,
    provenance: "fixture",
    saleState: "not_a_sale",
  });
});

test("live settle from canary design is still refused", () => {
  const plan = designCanary();
  assert.equal(plan.canary.authorized, false);
  const viaHelper = invokeLiveSettle(plan.canary);
  assert.equal(viaHelper.ok, false);
  assert.deepEqual(viaHelper.failure, LIVE_SETTLE_REFUSED);

  const viaGuard = assertCanaryMustNotSettle(plan.canary);
  assert.equal(viaGuard.ok, false);
  assert.equal(viaGuard.rejected, true);
  assert.deepEqual(viaGuard.failure, LIVE_SETTLE_REFUSED);
  assert.equal(viaGuard.failure.authorized, false);
  assert.equal(viaGuard.failure.settleInvoked, false);

  const purchase = executeCanaryPurchase(plan);
  assert.equal(purchase.ok, false);
  assert.deepEqual(purchase.failure, LIVE_SETTLE_REFUSED);
});

test("unsigned indexing hint is still not payment-signature authority", () => {
  const dishonestResource = {
    field: "resource",
    present: true,
    signed: true,
    drift: "none",
  };
  const resourceCheck = assertHonestDiagnostics([dishonestResource]);
  assert.equal(resourceCheck.ok, false);
  if (!resourceCheck.ok) {
    assert.deepEqual(resourceCheck.failure, UNSIGNED_HINT_NOT_AUTHORITY);
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
  if (!bazaarCheck.ok) assert.deepEqual(bazaarCheck.failure, UNSIGNED_HINT_NOT_AUTHORITY);

  const mark = markFieldSigned("resource", true);
  assert.equal(mark.ok, false);
  if (!mark.ok) assert.deepEqual(mark.failure, UNSIGNED_HINT_NOT_AUTHORITY);
});

test("live price change and verifyPayment / settlePayment reassignment are still refused", () => {
  const pins = assertLivePricesUnchanged();
  assert.deepEqual(pins, {
    ok: true,
    extract: "$0.005",
    sellerIntegrityAudit: "$0.01",
  });

  const price = refusePriceChange({ extract: "$0.006" });
  assert.equal(price.ok, false);
  assert.deepEqual(price.failure, LIVE_PAYMENT_SURFACE_IMMUTABLE);

  const verify = refusePaymentFnReassignment({ verifyPayment: () => "nope" });
  assert.equal(verify.ok, false);
  assert.deepEqual(verify.failure, LIVE_PAYMENT_SURFACE_IMMUTABLE);

  const settle = refusePaymentFnReassignment({ settlePayment: () => "nope" });
  assert.equal(settle.ok, false);
  assert.deepEqual(settle.failure, LIVE_PAYMENT_SURFACE_IMMUTABLE);
});

test("missing supplied input is still not a completed repair", () => {
  const draft = JSON.parse(readFileSync(missingInput, "utf8"));
  const accepted = acceptRepairIntake(draft);
  assert.equal(accepted.ok, false);
  if (!accepted.ok) {
    assert.equal(accepted.completed, false);
    assert.deepEqual(accepted.failure, MISSING_SUPPLIED_INPUT);
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
  assert.deepEqual(completed.failure, MISSING_SUPPLIED_INPUT);
});

test("canary remains authorized=false and must not settle", () => {
  const plan = designCanary("extract");
  assert.equal(plan.canary.authorized, false);
  assert.equal(plan.designOnly, true);
  assert.equal(plan.executed, false);
  assert.equal(plan.settleInvoked, false);
  assert.equal(plan.purchaseInvoked, false);

  const refused = assertCanaryMustNotSettle(plan);
  assert.equal(refused.ok, false);
  assert.equal(refused.failure.authorized, false);
  assert.equal(refused.failure.settleInvoked, false);
  assert.deepEqual(refused.failure, LIVE_SETTLE_REFUSED);
});
