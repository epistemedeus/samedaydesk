import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { diagnosePaymentPayload, assertHonestDiagnostics } from "../lib/diagnose.mjs";
import { loadFixture } from "../lib/load-fixture.mjs";
import { MERCHANT_PIN } from "../lib/rules.mjs";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("intact payload: payload signed; resource and bazaar are unsigned present hints", () => {
  const loaded = loadFixture(join(packRoot, "fixtures/ok-payload.json"));
  const result = diagnosePaymentPayload(loaded.paymentPayload, {
    declared: loaded.declared,
    requirements: loaded.requirements,
  });
  assert.equal(result.paymentRetried, false);
  assert.equal(result.declinedPayment, false);
  assert.equal(result.signedAuthority, "payload");
  assert.equal(result.merchantPin, MERCHANT_PIN);
  assert.deepEqual(result.bazaarIndexes, ["resource", "extensions.bazaar"]);
  assert.deepEqual(result.diagnostics, [
    { field: "payload", present: true, signed: true, drift: "none" },
    { field: "resource", present: true, signed: false, drift: "none" },
    { field: "extensions.bazaar", present: true, signed: false, drift: "none" },
    { field: "other", present: false, signed: false, drift: "none" },
  ]);
  assert.equal(assertHonestDiagnostics(result.diagnostics).ok, true);
});

test("missing bazaar hint: diagnostic missing_hint with signed false; never abort verify/settle", () => {
  const loaded = loadFixture(join(packRoot, "fixtures/missing-bazaar.json"));
  const result = diagnosePaymentPayload(loaded.paymentPayload, {
    declared: loaded.declared,
    requirements: loaded.requirements,
  });
  assert.deepEqual(
    result.diagnostics.find((row) => row.field === "extensions.bazaar"),
    { field: "extensions.bazaar", present: false, signed: false, drift: "missing_hint" },
  );
  assert.deepEqual(
    result.diagnostics.find((row) => row.field === "payload"),
    { field: "payload", present: true, signed: true, drift: "none" },
  );
  assert.deepEqual(
    result.diagnostics.find((row) => row.field === "resource"),
    { field: "resource", present: true, signed: false, drift: "none" },
  );
  assert.equal(result.declinedPayment, false);
  assert.equal(result.paymentRetried, false);
});

test("sibling paymentRequirements is other, unsigned, and not a Bazaar index field", () => {
  const loaded = loadFixture(join(packRoot, "fixtures/sibling-payment-requirements.json"));
  const result = diagnosePaymentPayload(loaded.paymentPayload, {
    declared: loaded.declared,
    requirements: loaded.requirements,
    siblingPaymentRequirements: loaded.json.paymentRequirements,
  });
  assert.deepEqual(
    result.diagnostics.find((row) => row.field === "other"),
    { field: "other", present: true, signed: false, drift: "none" },
  );
  assert.equal(result.bazaarIndexes.includes("resource"), true);
  assert.equal(result.rules.doesNotIndex.includes("paymentRequirements"), true);
  assert.equal(result.diagnostics.find((row) => row.field === "resource")?.drift, "missing_hint");
});
