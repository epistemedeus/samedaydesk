import assert from "node:assert/strict";
import test from "node:test";
import { belongsToAnotherRun, releaseRunOf } from "../lib/release-run.js";
import { checkoutArgs } from "../lib/care-contract.js";

const preview = { SDS_PRIVATE_PREVIEW: "1", RELEASE_RUN: "SDS-202611210930-abc123" };
const event = (metadata, parent) => ({ data: { object: { metadata, ...(parent ? { parent } : {}) } } });

test("only a private preview reads RELEASE_RUN", () => {
  assert.equal(releaseRunOf(preview), "SDS-202611210930-abc123");
  assert.equal(releaseRunOf({ RELEASE_RUN: "SDS-1" }), null);
  assert.equal(releaseRunOf({ SDS_PRIVATE_PREVIEW: "1", RELEASE_RUN: "bad run" }), null);
});

test("events tagged with another run are ignored, own and untagged events are not", () => {
  assert.equal(belongsToAnotherRun(event({ release_run: "EIN-1" }), preview), true);
  assert.equal(belongsToAnotherRun(event({}, { subscription_details: { metadata: { release_run: "NEO-1" } } }), preview), true);
  assert.equal(belongsToAnotherRun(event({ release_run: preview.RELEASE_RUN }), preview), false);
  assert.equal(belongsToAnotherRun(event({ sds_care_order: "x" }), preview), false);
  assert.equal(belongsToAnotherRun(event({ release_run: "EIN-1" }), {}), false, "production never ignores on a tag");
});

test("checkout sessions carry the run only when given one", () => {
  const order = { id: "6f1c1f0e-8a7b-4c1d-9e2f-0123456789ab", offer: "agent_front_door", amount_cents: 24900, integration_id: "i", checkout_expires_at: new Date(Date.now() + 7200_000).toISOString(), checkout_origin: "http://127.0.0.1:31871" };
  const secret = "s".repeat(64);
  assert.deepEqual(checkoutArgs(order, secret).metadata, { sds_care_order: order.id });
  const tagged = checkoutArgs(order, secret, "SDS-1");
  assert.equal(tagged.metadata.release_run, "SDS-1");
  assert.equal(tagged.payment_intent_data.metadata.release_run, "SDS-1");
});
