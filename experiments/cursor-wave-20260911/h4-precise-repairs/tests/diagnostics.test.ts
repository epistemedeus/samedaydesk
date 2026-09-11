import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyIndexingContinuityPatches,
  planIndexingPayloadContinuity,
} from "../fixtures/merchant-pr54/indexing-payload-continuity.mjs";
import {
  assertHonestDiagnostics,
  diagnosePaymentPayload,
} from "../src/diagnostics.ts";
import { loadFixture } from "../src/load-fixture.ts";
import { MERCHANT_PIN } from "../src/constants.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("missing resource hint: payload is signed; resource is an unsigned missing hint", () => {
  const loaded = loadFixture(join(packRoot, "fixtures/mismatch-missing-resource.json"));
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
    { field: "resource", present: false, signed: false, drift: "missing_hint" },
    { field: "extensions.bazaar", present: false, signed: false, drift: "missing_hint" },
    { field: "other", present: false, signed: false, drift: "none" },
  ]);
  assert.equal(result.continuity.untouchedAuthority, true);
  assert.equal(result.continuity.declinedPayment, false);
  assert.equal(result.continuity.resourceProvenance, "filled");
  assert.equal(assertHonestDiagnostics(result.diagnostics).ok, true);
});

test("missing bazaar hint keeps resource unsigned even when present", () => {
  const loaded = loadFixture(join(packRoot, "fixtures/mismatch-missing-bazaar.json"));
  const result = diagnosePaymentPayload(loaded.paymentPayload, {
    declared: loaded.declared,
    requirements: loaded.requirements,
  });
  assert.deepEqual(
    result.diagnostics.find((row) => row.field === "resource"),
    { field: "resource", present: true, signed: false, drift: "none" },
  );
  assert.deepEqual(
    result.diagnostics.find((row) => row.field === "extensions.bazaar"),
    { field: "extensions.bazaar", present: false, signed: false, drift: "missing_hint" },
  );
  assert.deepEqual(
    result.diagnostics.find((row) => row.field === "payload"),
    { field: "payload", present: true, signed: true, drift: "none" },
  );
});

test("intact payload reports unsigned hints present with drift none", () => {
  const loaded = loadFixture(join(packRoot, "fixtures/intact-payload.json"));
  const result = diagnosePaymentPayload(loaded.paymentPayload, {
    declared: loaded.declared,
    requirements: loaded.requirements,
  });
  assert.deepEqual(result.diagnostics, [
    { field: "payload", present: true, signed: true, drift: "none" },
    { field: "resource", present: true, signed: false, drift: "none" },
    { field: "extensions.bazaar", present: true, signed: false, drift: "none" },
    { field: "other", present: false, signed: false, drift: "none" },
  ]);
  assert.equal(result.continuity.resourceProvenance, "present");
  assert.equal(result.continuity.bazaarProvenance, "present");
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
  assert.equal(result.diagnostics.find((row) => row.field === "resource")?.drift, "missing_hint");
});

test("filling omitted hints does not change signed payload authority", () => {
  const loaded = loadFixture(join(packRoot, "fixtures/mismatch-missing-resource.json"));
  const originalPayload = structuredClone(loaded.paymentPayload.payload);
  const clone = structuredClone(loaded.paymentPayload);
  const planned = planIndexingPayloadContinuity(clone, loaded.declared);
  applyIndexingContinuityPatches(clone, planned.patches);
  assert.deepEqual(clone.payload, originalPayload);
  assert.equal(planned.provenance.untouchedAuthority, true);
  assert.equal(planned.provenance.declinedPayment, false);
  assert.ok(clone.resource);
  assert.ok(clone.extensions && clone.extensions.bazaar);
});
