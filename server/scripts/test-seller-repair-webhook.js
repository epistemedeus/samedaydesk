import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

process.env.PULSE_FILE = "/dev/null";
process.env.STRIPE_WEBHOOK_SECRET = "test-webhook-secret";
delete process.env.NEOMORPHIC_SELLER_CONFORMANCE_STRIPE_PAYMENT_LINK_ID;

const { createStripeWebhookRouter } = await import("../routes/stripe-webhook.js");

const CONFIGURED_LINK = "plink_neomorphicSellerConformanceFixture";
const KNOWN_FINDING = "hypernatt-liq-radar-20260830";

function checkoutEvent(overrides = {}, type = "checkout.session.completed") {
  return {
    type,
    data: {
      object: {
        id: "cs_fixture_paid",
        payment_status: "paid",
        status: "complete",
        amount_total: 49000,
        currency: "usd",
        payment_link: CONFIGURED_LINK,
        client_reference_id: KNOWN_FINDING,
        payment_intent: "pi_fixture_paid",
        customer_details: { email: "seller@example.test" },
        custom_fields: [{
          key: "public_target_url",
          label: { custom: "Public target URL", type: "custom" },
          type: "text",
          text: { value: "https://seller.example.test/paid-route" },
        }],
        ...overrides,
      },
    },
  };
}

function expiredCheckoutEvent(overrides = {}, type = "checkout.session.expired") {
  return checkoutEvent({
    id: "cs_fixture_expired",
    payment_status: "unpaid",
    status: "expired",
    payment_intent: "pi_expired_must_not_be_retrieved",
    ...overrides,
  }, type);
}

async function createHarness(t, { neomorphicPaymentLinkId = CONFIGURED_LINK } = {}) {
  const calls = {
    fulfill: [],
    notify: [],
    retrieve: [],
  };
  const intents = new Map();
  const stripeClient = {
    webhooks: {
      constructEvent(rawBody, signature, secret) {
        if (signature !== "valid-fixture-signature" || secret !== "test-webhook-secret") {
          throw new Error("fixture signature mismatch");
        }
        return JSON.parse(rawBody.toString("utf8"));
      },
    },
    paymentIntents: {
      async retrieve(id) {
        calls.retrieve.push(id);
        return intents.get(id) || { id, metadata: {} };
      },
    },
  };
  const fulfill = async (intent) => {
    calls.fulfill.push(intent);
    return intent.metadata?.uid
      ? { ok: true, orderId: `order_${intent.metadata.uid}`, isNew: true }
      : { ok: false, reason: "no_uid" };
  };
  const notify = async (subject, html) => {
    calls.notify.push({ subject, html });
  };

  const app = express();
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, _res, next) => {
    req.rawBody = req.body;
    next();
  });
  app.use("/api/stripe", createStripeWebhookRouter({
    stripeClient,
    stripeConfigured: () => true,
    fulfill,
    notify,
    neomorphicPaymentLinkId,
  }));

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  async function post(event, signature = "valid-fixture-signature") {
    return fetch(`http://127.0.0.1:${server.address().port}/api/stripe/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: JSON.stringify(event),
    });
  }

  function reset() {
    calls.fulfill.length = 0;
    calls.notify.length = 0;
    calls.retrieve.length = 0;
    intents.clear();
  }

  return { calls, intents, post, reset };
}

function assertGenericNotificationOnly(calls) {
  assert.equal(calls.notify.length, 1);
  assert.match(calls.notify[0].subject, /^Checkout completed — /);
  assert.match(calls.notify[0].html, /A hosted Checkout completed without a linked account/);
  assert.doesNotMatch(calls.notify[0].subject, /Neomorphic seller repair/);
  assert.doesNotMatch(calls.notify[0].html, /paid Neomorphic fixed-scope seller-repair engagement/);
  assert.doesNotMatch(calls.notify[0].html, new RegExp(KNOWN_FINDING));
}

function assertNoWebhookEffects(calls) {
  assert.equal(calls.retrieve.length, 0);
  assert.equal(calls.fulfill.length, 0);
  assert.equal(calls.notify.length, 0);
}

test("Stripe webhook isolates exact Neomorphic abandonment from fulfillment", async (t) => {
  const { calls, post, reset } = await createHarness(t);

  await t.test("expired unpaid exact-link session emits one bounded operator notice", async () => {
    const response = await post(expiredCheckoutEvent({
      metadata: { internal_note: "must-not-leak" },
      customer_details: {
        email: "abandoned@example.test",
        name: "Must Not Leak",
      },
    }));
    assert.equal(response.status, 200);
    assert.equal(calls.retrieve.length, 0);
    assert.equal(calls.fulfill.length, 0);
    assert.equal(calls.notify.length, 1);
    const [{ subject, html }] = calls.notify;
    assert.equal(subject, "Neomorphic seller repair checkout expired — $490.00");
    assert.match(html, /expired unpaid/);
    assert.match(html, new RegExp(`Finding ID: ${KNOWN_FINDING}`));
    assert.match(html, /Checkout Session: cs_fixture_expired/);
    assert.match(html, /Customer email: abandoned@example\.test/);
    assert.match(html, /Public target URL: https:\/\/seller\.example\.test\/paid-route/);
    assert.match(html, /Amount: \$490\.00/);
    assert.doesNotMatch(html, /PaymentIntent|Offer label|Must Not Leak|must-not-leak/);
  });

  await t.test("optional buyer and target context is omitted when absent", async () => {
    reset();
    const response = await post(expiredCheckoutEvent({
      id: "cs_expired_without_optional_context",
      customer_details: null,
      customer_email: null,
      custom_fields: [],
    }));
    assert.equal(response.status, 200);
    assert.equal(calls.notify.length, 1);
    assert.doesNotMatch(calls.notify[0].html, /Customer email|Public target URL/);
    assert.equal(calls.retrieve.length, 0);
    assert.equal(calls.fulfill.length, 0);
  });

  const rejectedAttributions = [
    ["foreign Payment Link", { payment_link: "plink_foreignFixture" }],
    ["missing finding", { client_reference_id: null }],
    ["regex-valid unknown finding", { client_reference_id: "unknown-finding-20260902" }],
    ["malformed finding", { client_reference_id: "bad finding/id" }],
    ["array finding", { client_reference_id: [KNOWN_FINDING] }],
    ["non-string finding", { client_reference_id: 42 }],
    ["wrong amount", { amount_total: 48999 }],
    ["wrong currency", { currency: "eur" }],
    ["paid expired state", { payment_status: "paid" }],
    ["expired event with non-expired state", { status: "open" }],
  ];
  for (const [name, overrides] of rejectedAttributions) {
    await t.test(name, async () => {
      reset();
      const response = await post(expiredCheckoutEvent(overrides));
      assert.equal(response.status, 200);
      assertNoWebhookEffects(calls);
    });
  }

  await t.test("unpaid non-expired event remains ignored", async () => {
    reset();
    const response = await post(expiredCheckoutEvent({ status: "complete" }, "checkout.session.completed"));
    assert.equal(response.status, 200);
    assertNoWebhookEffects(calls);
  });

  await t.test("bad signature rejects an otherwise attributed expired session", async () => {
    reset();
    const response = await post(expiredCheckoutEvent(), "bad-fixture-signature");
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Bad signature/);
    assertNoWebhookEffects(calls);
  });
});

test("Stripe webhook admits only an exact paid Neomorphic seller-repair attribution", async (t) => {
  const harness = await createHarness(t);
  const { calls, intents, post, reset } = harness;

  await t.test("completed session preserves the finding and operator handoff context", async () => {
    intents.set("pi_fixture_paid", { id: "pi_fixture_paid", metadata: {} });
    const response = await post(checkoutEvent());
    assert.equal(response.status, 200);
    assert.deepEqual(calls.retrieve, ["pi_fixture_paid"]);
    assert.equal(calls.fulfill.length, 1);
    assert.equal(calls.notify.length, 1);
    const [{ subject, html }] = calls.notify;
    assert.equal(subject, "Neomorphic seller repair paid — $490.00");
    assert.match(html, new RegExp(`Finding ID: ${KNOWN_FINDING}`));
    assert.match(html, /Checkout Session: cs_fixture_paid/);
    assert.match(html, /PaymentIntent: pi_fixture_paid/);
    assert.match(html, /Customer email: seller@example\.test/);
    assert.match(html, /Public target URL: https:\/\/seller\.example\.test\/paid-route/);
    assert.match(html, /Amount: \$490\.00/);
  });

  await t.test("delayed-payment success uses the same attributed notification", async () => {
    reset();
    intents.set("pi_async_paid", { id: "pi_async_paid", metadata: {} });
    const response = await post(checkoutEvent({
      id: "cs_async_paid",
      payment_intent: "pi_async_paid",
    }, "checkout.session.async_payment_succeeded"));
    assert.equal(response.status, 200);
    assert.equal(calls.notify.length, 1);
    assert.match(calls.notify[0].subject, /^Neomorphic seller repair paid/);
    assert.match(calls.notify[0].html, /Checkout Session: cs_async_paid/);
    assert.match(calls.notify[0].html, /PaymentIntent: pi_async_paid/);
  });

  await t.test("attributed notification still records a missing PaymentIntent explicitly", async () => {
    reset();
    const response = await post(checkoutEvent({
      id: "cs_paid_without_intent",
      payment_intent: null,
    }));
    assert.equal(response.status, 200);
    assert.equal(calls.retrieve.length, 0);
    assert.equal(calls.fulfill.length, 0);
    assert.equal(calls.notify.length, 1);
    assert.match(calls.notify[0].subject, /^Neomorphic seller repair paid/);
    assert.match(calls.notify[0].html, /Checkout Session: cs_paid_without_intent/);
    assert.match(calls.notify[0].html, /PaymentIntent: —/);
  });

  const rejectedAttributions = [
    ["unpaid session", { payment_status: "unpaid" }, 0],
    ["incomplete session", { status: "open" }, 1],
    ["wrong amount", { amount_total: 48999 }, 1],
    ["wrong currency", { currency: "eur" }, 1],
    ["foreign Payment Link", { payment_link: "plink_foreignFixture" }, 1],
    ["absent reference", { client_reference_id: null }, 1],
    ["regex-valid unknown finding", { client_reference_id: "unknown-finding-20260902" }, 1],
    ["malformed finding", { client_reference_id: "bad finding/id" }, 1],
    ["duplicate-reference input", { client_reference_id: [KNOWN_FINDING, KNOWN_FINDING] }, 1],
  ];
  for (const [name, overrides, genericNotifications] of rejectedAttributions) {
    await t.test(name, async () => {
      reset();
      intents.set("pi_fixture_paid", { id: "pi_fixture_paid", metadata: {} });
      const response = await post(checkoutEvent(overrides));
      assert.equal(response.status, 200);
      if (genericNotifications === 0) {
        assert.equal(calls.retrieve.length, 0);
        assert.equal(calls.fulfill.length, 0);
        assert.equal(calls.notify.length, 0);
      } else {
        assertGenericNotificationOnly(calls);
      }
    });
  }

  await t.test("unsupported Checkout event type is ignored even if its fields look paid", async () => {
    reset();
    const response = await post(checkoutEvent({}, "checkout.session.async_payment_failed"));
    assert.equal(response.status, 200);
    assert.equal(calls.retrieve.length, 0);
    assert.equal(calls.fulfill.length, 0);
    assert.equal(calls.notify.length, 0);
  });

  await t.test("account-backed metadata fulfillment remains authoritative", async () => {
    reset();
    intents.set("pi_account", {
      id: "pi_account",
      metadata: {
        uid: "user_fixture",
        offer: "seller_contract_repair",
        finding_id: KNOWN_FINDING,
      },
    });
    const response = await post(checkoutEvent({ payment_intent: "pi_account" }));
    assert.equal(response.status, 200);
    assert.deepEqual(calls.retrieve, ["pi_account"]);
    assert.equal(calls.fulfill.length, 1);
    assert.equal(calls.fulfill[0].metadata.uid, "user_fixture");
    assert.equal(calls.notify.length, 0);
  });

  await t.test("payment_intent.succeeded fulfillment remains unchanged", async () => {
    reset();
    const intent = {
      id: "pi_direct_account",
      metadata: { uid: "direct_user", offer: "seller_contract_repair" },
    };
    const response = await post({ type: "payment_intent.succeeded", data: { object: intent } });
    assert.equal(response.status, 200);
    assert.equal(calls.retrieve.length, 0);
    assert.deepEqual(calls.fulfill, [intent]);
    assert.equal(calls.notify.length, 0);
  });

  await t.test("generic Payment Link notification remains generic", async () => {
    reset();
    intents.set("pi_generic", {
      id: "pi_generic",
      metadata: { label: "Operator-scoped work", amount: "12500" },
    });
    const response = await post(checkoutEvent({
      id: "cs_generic",
      amount_total: 12500,
      payment_link: "plink_genericFixture",
      client_reference_id: null,
      payment_intent: "pi_generic",
      custom_fields: [],
      customer_details: { email: "generic@example.test" },
    }));
    assert.equal(response.status, 200);
    assert.equal(calls.fulfill.length, 1);
    assert.equal(calls.notify.length, 1);
    assert.equal(calls.notify[0].subject, "Checkout completed — $125.00");
    assert.match(calls.notify[0].html, /Session: cs_generic/);
    assert.match(calls.notify[0].html, /Email: generic@example\.test/);
    assert.match(calls.notify[0].html, /Offer label: Operator-scoped work/);
    assert.doesNotMatch(calls.notify[0].html, /Neomorphic/);
  });

  await t.test("bad webhook signature is rejected at the existing boundary", async () => {
    reset();
    const response = await post(checkoutEvent(), "bad-fixture-signature");
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Bad signature/);
    assert.equal(calls.retrieve.length, 0);
    assert.equal(calls.fulfill.length, 0);
    assert.equal(calls.notify.length, 0);
  });
});

test("absent Neomorphic Link configuration defaults to generic handling", async (t) => {
  const { calls, intents, post, reset } = await createHarness(t, { neomorphicPaymentLinkId: null });
  const expiredResponse = await post(expiredCheckoutEvent());
  assert.equal(expiredResponse.status, 200);
  assertNoWebhookEffects(calls);

  reset();
  intents.set("pi_fixture_paid", { id: "pi_fixture_paid", metadata: {} });
  const response = await post(checkoutEvent());
  assert.equal(response.status, 200);
  assertGenericNotificationOnly(calls);
});
