import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import Stripe from "stripe";
import { accountChargeHold, applyAccountOrderHold, isAccountChargeHoldEvent } from "../lib/account-charge-hold.js";
import { fulfillFromIntent } from "../lib/fulfill.js";
import { firstUseIntake, intakeDigest } from "../lib/first-use-intake.js";
import { deliverFirstUseReport, firstUseWorkQueue } from "../lib/first-use-delivery.js";
import { createMemoryPaymentAttemptStore } from "../lib/payment-attempt-store.js";
import { AGENT_FIRST_USE_REPORT as offer, CURRENCY, getOffer } from "../pricing.js";
import { createStripeWebhookRouter } from "../routes/stripe-webhook.js";

const details = "From a cold start, find a public example and complete one read-only tool call.";
const intake = firstUseIntake({ targetUrl: "https://example.com/mcp", details });
const cents = getOffer(offer).amount;
const secret = "whsec_fixture_not_a_real_secret";
const pdf = Buffer.from("%PDF-1.7 fixture report, never a customer artifact");
const links = { recordingUrl: "https://recording.example.com/view/fixture", recordingAccessConfirmed: true };

function memoryDb() {
  const orders = new Map(), objects = new Map(), profiles = new Map();
  const matches = (row, filters) => Object.entries(filters).every(([key, value]) => row[key] === value);
  const blob = (buf) => ({ size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  const ordersApi = () => {
    const filters = {};
    const api = {
      select() { return api; },
      eq(key, value) { filters[key] = value; return api; },
      order() { return api; },
      limit() { return api; },
      then(resolve, reject) {
        const found = [...orders.values()].filter((row) => matches(row, filters));
        return Promise.resolve({ data: found, error: null }).then(resolve, reject);
      },
      async maybeSingle() {
        const found = [...orders.values()].filter((row) => matches(row, filters));
        return { data: found[0] ?? null, error: null };
      },
      async single() {
        const { data } = await api.maybeSingle();
        return { data, error: data ? null : new Error("missing") };
      },
      upsert(row, { onConflict, ignoreDuplicates } = {}) {
        assert.equal(onConflict, "stripe_payment_intent");
        assert.equal(ignoreDuplicates, true);
        const existed = [...orders.values()].some((item) => item.stripe_payment_intent === row.stripe_payment_intent);
        if (!existed) orders.set(row.id, { ...row, created_at: new Date().toISOString() });
        return { select: async () => ({ data: existed ? [] : [{ id: row.id }], error: null }) };
      },
      update(patch) {
        const chain = {
          eq(key, value) { filters[key] = value; return chain; },
          select() { return chain; },
          async maybeSingle() {
            const found = [...orders.values()].filter((row) => matches(row, filters));
            for (const row of found) orders.set(row.id, { ...row, ...patch });
            const next = found[0] ? orders.get(found[0].id) : null;
            return { data: next ? { id: next.id } : null, error: null };
          },
          then(resolve, reject) { return chain.maybeSingle().then(resolve, reject); },
        };
        return chain;
      },
    };
    return api;
  };
  return {
    orders, objects, profiles,
    from(table) {
      if (table === "profiles") {
        return { update(patch) { return { eq: async (_col, id) => { profiles.set(id, { ...patch }); return { error: null }; } }; } };
      }
      if (table === "orders") return ordersApi();
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "intake-uploads");
        return {
          async upload(path, body) { if (objects.has(path)) return { error: new Error("exists") }; objects.set(path, body); return { error: null }; },
          async download(path) { return objects.has(path) ? { data: blob(objects.get(path)), error: null } : { error: new Error("missing") }; },
          async createSignedUrl(path) { return objects.has(path) ? { data: { signedUrl: "/signed/" + path }, error: null } : { error: new Error("missing") }; },
        };
      },
    },
  };
}

async function openFirstUse(db, { paymentIntentId, charge, receipts }) {
  const store = createMemoryPaymentAttemptStore();
  const uid = randomUUID();
  const attempt = await store.insert({
    id: randomUUID(), user_id: uid, offer, amount: cents, currency: CURRENCY, status: "open",
    checkout_rail: "stripe", stripe_payment_intent: paymentIntentId,
    intake_snapshot: intake, intake_hash: intakeDigest(intake),
  });
  const intent = {
    id: paymentIntentId, amount: cents, amount_received: cents, currency: CURRENCY,
    status: "succeeded", livemode: false, receipt_email: "buyer@example.test",
    metadata: { uid, offer, payment_attempt_id: attempt.id, email: "buyer@example.test" },
    ...(charge ? { latest_charge: charge.id } : {}),
  };
  const stripeClient = {
    charges: { retrieve: async (id) => { assert.equal(id, charge?.id); return charge; } },
  };
  let receiptCount = 0;
  const result = await fulfillFromIntent(intent, {
    sb: db, attemptStore: store, live: false, stripeClient,
    receipt: async () => { receiptCount += 1; receipts?.push(paymentIntentId); },
  });
  return { uid, attempt, intent, result, receiptCount, store, stripeClient };
}

async function deliver(db, orderId) {
  return deliverFirstUseReport({ id: orderId, sb: db, pdf, ...links });
}

test("charge-before-receipt facts match care: refunded, disputed, or amount_refunded holds", () => {
  assert.equal(accountChargeHold({ refunded: false, disputed: false, amount_refunded: 0 }), null);
  assert.equal(accountChargeHold({ refunded: true, disputed: false, amount_refunded: 4900 }).status, "refunded");
  assert.equal(accountChargeHold({ refunded: false, disputed: true, amount_refunded: 0 }).status, "review");
  assert.equal(accountChargeHold({ refunded: false, disputed: false, amount_refunded: 100 }).status, "review");
  assert.equal(accountChargeHold({ refunded: false, disputed: false, amount_refunded: 0 }, "charge.dispute.created").status, "review");
  assert.equal(accountChargeHold({ refunded: false, disputed: false, amount_refunded: 0 }, "radar.early_fraud_warning.created").status, "review");
  assert.equal(isAccountChargeHoldEvent("payment_intent.succeeded"), false);
  assert.equal(isAccountChargeHoldEvent("charge.refunded"), true);
});

test("a refunded charge at fulfill holds the first-use order and refuses delivery", async () => {
  const db = memoryDb();
  const charge = { id: "ch_q49_refund_first", payment_intent: "pi_q49_refund_first", livemode: false, refunded: true, disputed: false, amount_refunded: 4900 };
  const { result, receiptCount } = await openFirstUse(db, { paymentIntentId: "pi_q49_refund_first", charge });
  assert.equal(result.ok, true);
  assert.equal(result.held, true);
  assert.equal(result.orderId, "order_pi_q49_refund_first");
  assert.equal(receiptCount, 0);
  assert.equal(db.orders.get(result.orderId).status, "refunded");
  assert.deepEqual(await firstUseWorkQueue({ sb: db }), []);
  await assert.rejects(() => deliver(db, result.orderId), /cannot accept this delivery/);
});

test("refund or dispute after a received first-use order holds delivery", async (t) => {
  process.env.SDS_PRIVATE_PREVIEW = "1";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  const db = memoryDb();
  const { result, receiptCount } = await openFirstUse(db, { paymentIntentId: "pi_q49_refund_later" });
  assert.equal(result.held, false);
  assert.equal(result.orderId, "order_pi_q49_refund_later");
  assert.equal(receiptCount, 1);
  assert.equal(db.orders.get(result.orderId).status, "received");

  const stripeLib = new Stripe("sk_test_fixture_not_a_real_key");
  const charges = new Map();
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use("/api/stripe", createStripeWebhookRouter({
    stripeClient: {
      webhooks: stripeLib.webhooks,
      charges: { retrieve: async (id) => charges.get(id) },
    },
    stripeConfigured: () => true,
    fulfill: async () => { throw new Error("succeeded path is not this test"); },
    holdAccountOrder: (event, opts) => import("../lib/account-charge-hold.js")
      .then(({ holdAccountOrderFromCharge }) => holdAccountOrderFromCharge(event, { ...opts, sb: db, live: false })),
  }));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const post = async (type, object) => {
    const payload = JSON.stringify({ id: "evt_" + type.replaceAll(".", "_"), type, livemode: false, data: { object } });
    const signature = stripeLib.webhooks.generateTestHeaderString({ payload, secret });
    const response = await fetch(base + "/api/stripe/webhook", {
      method: "POST", body: payload, headers: { "content-type": "application/json", "stripe-signature": signature },
    });
    return { status: response.status, body: await response.json() };
  };

  const refunded = await post("charge.refunded", {
    id: "ch_q49_refund_later", payment_intent: "pi_q49_refund_later", livemode: false,
    refunded: true, disputed: false, amount_refunded: 4900,
  });
  assert.equal(refunded.status, 200);
  assert.equal(db.orders.get(result.orderId).status, "refunded");
  await assert.rejects(() => deliver(db, result.orderId), /cannot accept this delivery/);

  const { result: disputed } = await openFirstUse(db, { paymentIntentId: "pi_q49_dispute_later" });
  assert.equal(db.orders.get(disputed.orderId).status, "received");
  charges.set("ch_q49_dispute_later", {
    id: "ch_q49_dispute_later", payment_intent: "pi_q49_dispute_later", livemode: false,
    refunded: false, disputed: true, amount_refunded: 0,
  });
  const dispute = await post("charge.dispute.created", { id: "dp_q49_later", charge: "ch_q49_dispute_later" });
  assert.equal(dispute.status, 200);
  assert.equal(db.orders.get(disputed.orderId).status, "review");
  await assert.rejects(() => deliver(db, disputed.orderId), /cannot accept this delivery/);
});

test("applyAccountOrderHold does not un-deliver an already delivered first-use order", async () => {
  const db = memoryDb();
  const { result } = await openFirstUse(db, { paymentIntentId: "pi_q49_already_delivered" });
  const delivered = await deliver(db, result.orderId);
  assert.equal(delivered.status, "delivered");
  const applied = await applyAccountOrderHold(db, {
    paymentIntentId: "pi_q49_already_delivered",
    hold: { status: "refunded", amountRefunded: 4900, total: true, disputed: false, earlyFraud: false },
  });
  assert.equal(applied.alreadyDelivered, true);
  assert.equal(applied.status, "delivered");
  assert.equal(db.orders.get(result.orderId).status, "delivered");
  assert.equal(db.orders.get(result.orderId).meta.charge_hold.status, "refunded");
});
