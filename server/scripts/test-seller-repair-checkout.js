import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

process.env.PULSE_FILE = "/dev/null";

const {
  buildSellerRepairCheckoutSessionParams,
  createSellerRepairCheckoutSession,
  isPaidCheckoutSessionEvent,
  isValidSellerRepairFindingId,
  SELLER_CONTRACT_REPAIR_SLUG,
  SELLER_REPAIR_INTEGRATION_ID,
  sellerRepairCheckoutNotificationContext,
} = await import("../lib/seller-repair-checkout.js");
const { getOffer } = await import("../pricing.js");
const { stripe } = await import("../lib/stripe.js");
const { default: checkoutRouter } = await import("../routes/checkout.js");

const SAMPLE_FINDING = "hypernatt-liq-radar-20260830";
const offer = getOffer(SELLER_CONTRACT_REPAIR_SLUG);

test("seller_contract_repair offer is server-owned at 49000 cents", () => {
  assert.ok(offer);
  assert.equal(offer.amount, 49000);
  assert.equal(offer.label, "One-route seller contract repair");
});

test("buildSellerRepairCheckoutSessionParams stamps server-owned checkout fields", () => {
  const params = buildSellerRepairCheckoutSessionParams(
    SAMPLE_FINDING,
    offer,
    "https://samedaydesk.com",
  );
  assert.equal(params.mode, "payment");
  assert.equal(params.client_reference_id, SAMPLE_FINDING);
  assert.equal(params.integration_identifier, SELLER_REPAIR_INTEGRATION_ID);
  assert.equal(params.line_items[0].price_data.unit_amount, 49000);
  assert.equal(params.line_items[0].price_data.currency, "usd");
  assert.equal(params.metadata.offer, SELLER_CONTRACT_REPAIR_SLUG);
  assert.equal(params.metadata.amount, "49000");
  assert.equal(params.metadata.label, offer.label);
  assert.equal(params.metadata.finding_id, SAMPLE_FINDING);
  assert.deepEqual(params.payment_intent_data.metadata, params.metadata);
  assert.match(params.success_url, /finding=hypernatt-liq-radar-20260830/);
  assert.match(params.success_url, /checkout=returned/);
  assert.match(params.cancel_url, /finding=hypernatt-liq-radar-20260830/);
  assert.doesNotMatch(params.cancel_url, /checkout=returned/);
  assert.equal("payment_method_types" in params, false);
});

test("accepts only bounded finding IDs", () => {
  assert.equal(isValidSellerRepairFindingId(SAMPLE_FINDING), true);
  assert.equal(isValidSellerRepairFindingId("not-a-real-finding"), false);
  assert.equal(isValidSellerRepairFindingId("bad id"), false);
  assert.equal(isValidSellerRepairFindingId("a".repeat(97)), false);
  assert.equal(isValidSellerRepairFindingId(null), false);
});

test("createSellerRepairCheckoutSession rejects invalid finding IDs", async () => {
  const invalid = await createSellerRepairCheckoutSession("invented-finding");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 400);
});

test("createSellerRepairCheckoutSession surfaces Stripe failures", async (t) => {
  if (!stripe?.checkout?.sessions?.create) return t.skip("Stripe not configured");
  const original = stripe.checkout.sessions.create;
  stripe.checkout.sessions.create = async () => {
    throw new Error("stripe unavailable");
  };
  try {
    await assert.rejects(
      () => createSellerRepairCheckoutSession(SAMPLE_FINDING),
      /stripe unavailable/,
    );
  } finally {
    stripe.checkout.sessions.create = original;
  }
});

test("sellerRepairCheckoutNotificationContext uses session totals for price display", () => {
  const ctx = sellerRepairCheckoutNotificationContext(
    {
      amount_total: 49000,
      metadata: {
        finding_id: SAMPLE_FINDING,
        label: "One-route seller contract repair",
        amount: "1",
      },
    },
    { metadata: { finding_id: "ignored-when-session-has-id" } },
  );
  assert.equal(ctx.findingId, SAMPLE_FINDING);
  assert.equal(ctx.offerLabel, "One-route seller contract repair");
  assert.equal(ctx.amountDisplay, "$490.00");
});

test("processes Checkout Session events only after Stripe marks them paid", () => {
  const event = (type, paymentStatus) => ({
    type,
    data: { object: { payment_status: paymentStatus } },
  });
  assert.equal(isPaidCheckoutSessionEvent(event("checkout.session.completed", "paid")), true);
  assert.equal(isPaidCheckoutSessionEvent(event("checkout.session.completed", "unpaid")), false);
  assert.equal(
    isPaidCheckoutSessionEvent(event("checkout.session.async_payment_succeeded", "paid")),
    true,
  );
  assert.equal(
    isPaidCheckoutSessionEvent(event("checkout.session.async_payment_failed", "unpaid")),
    false,
  );
  assert.equal(isPaidCheckoutSessionEvent(event("payment_intent.succeeded", "paid")), false);
});

test("seller-repair-session route rejects malformed finding IDs", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api/checkout", checkoutRouter);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  t.after(() => server.close());

  const port = server.address().port;
  const bad = await fetch(`http://127.0.0.1:${port}/api/checkout/seller-repair-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ finding_id: "not-valid" }),
  });
  if (stripe) {
    assert.equal(bad.status, 400);
  } else {
    assert.equal(bad.status, 503);
  }
});
