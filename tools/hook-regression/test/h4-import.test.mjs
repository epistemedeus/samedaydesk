import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { diagnosePaymentPayload } from "../lib/diagnose.mjs";
import { loadH4Fixtures, importH4MerchantPlanner } from "../lib/h4.mjs";
import { loadFixture } from "../lib/load-fixture.mjs";
import { planOmittedHintFill } from "../lib/plan-fill.mjs";
import { signedPayloadUnchanged } from "../lib/authority.mjs";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("import H4 fixtures/rules when present and agree on missing_hint diagnostics", async () => {
  const h4 = loadH4Fixtures();
  if (!h4.present) {
    assert.ok(true, "H4 tree/branch not present; local fixtures remain G02-owned");
    return;
  }
  const localMissing = loadFixture(join(packRoot, "fixtures/missing-bazaar.json"));
  const h4Missing = h4.fixtures.missingBazaar;
  assert.ok(h4Missing, "H4 missing-bazaar fixture imported");
  const localDiag = diagnosePaymentPayload(localMissing.paymentPayload, {
    declared: localMissing.declared,
    requirements: localMissing.requirements,
  });
  const h4Diag = diagnosePaymentPayload(h4Missing.paymentPayload, {
    declared: h4Missing.declared,
    requirements: h4Missing.requirements,
  });
  assert.deepEqual(
    localDiag.diagnostics.find((row) => row.field === "extensions.bazaar"),
    h4Diag.diagnostics.find((row) => row.field === "extensions.bazaar"),
  );
  assert.equal(h4Diag.diagnostics.find((row) => row.field === "extensions.bazaar").signed, false);
  assert.equal(h4Diag.diagnostics.find((row) => row.field === "extensions.bazaar").drift, "missing_hint");

  const planner = await importH4MerchantPlanner();
  if (!planner.present) return;
  const clone = structuredClone(h4Missing.paymentPayload);
  const originalPayload = structuredClone(clone.payload);
  const planned = planner.module.planIndexingPayloadContinuity(clone, h4Missing.declared);
  planner.module.applyIndexingContinuityPatches(clone, planned.patches);
  assert.equal(planned.provenance.untouchedAuthority, true);
  assert.equal(planned.provenance.declinedPayment, false);
  assert.deepEqual(clone.payload, originalPayload);
  const localPlan = planOmittedHintFill(h4Missing.paymentPayload, h4Missing.declared);
  assert.equal(localPlan.provenance.bazaar, planned.provenance.bazaar);
  assert.equal(signedPayloadUnchanged(h4Missing.paymentPayload, localPlan.clone), true);
});
