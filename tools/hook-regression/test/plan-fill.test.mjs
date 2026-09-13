import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadFixture } from "../lib/load-fixture.mjs";
import { planOmittedHintFill, refuseRewritePayloadToFixDiscovery } from "../lib/plan-fill.mjs";
import { signedPayloadUnchanged } from "../lib/authority.mjs";
import { REWRITE_PAYLOAD_TO_FIX_DISCOVERY } from "../lib/failures.mjs";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("filling omitted route-owned hints does not change signed authority", () => {
  const loaded = loadFixture(join(packRoot, "fixtures/missing-bazaar.json"));
  const originalPayload = structuredClone(loaded.paymentPayload.payload);
  const original = structuredClone(loaded.paymentPayload);
  const planned = planOmittedHintFill(original, loaded.declared);
  assert.equal(planned.provenance.declinedPayment, false);
  assert.equal(planned.provenance.untouchedAuthority, true);
  assert.equal(planned.mutatedOriginal, false);
  assert.deepEqual(original.payload, originalPayload);
  assert.deepEqual(planned.clone.payload, originalPayload);
  assert.equal(signedPayloadUnchanged(original, planned.clone), true);
  assert.ok(planned.clone.extensions?.bazaar);
  assert.equal(planned.provenance.bazaar, "filled");
  assert.equal(original.extensions, undefined);
});

test("rewrite of signed payload to fix discovery is rejected", () => {
  const loaded = loadFixture(join(packRoot, "fixtures/rewrite-payload-to-fix-discovery.json"));
  const refused = refuseRewritePayloadToFixDiscovery(
    loaded.json.paymentPayload,
    loaded.json.rewrittenPayload,
  );
  assert.equal(refused.ok, false);
  assert.equal(refused.rejected, true);
  assert.deepEqual(refused.failure, REWRITE_PAYLOAD_TO_FIX_DISCOVERY);
  assert.equal(
    signedPayloadUnchanged(loaded.json.paymentPayload, loaded.json.rewrittenPayload),
    false,
  );
});
