import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPaymentAttemptIdempotencyKey,
  createOfferPaymentIntent,
  hashPaymentAttemptFacts,
  markPaymentAttemptSucceeded,
} from "../lib/payment-attempt.js";
import { createMemoryPaymentAttemptStore } from "../lib/payment-attempt-store.js";
import { getOffer, CURRENCY } from "../pricing.js";
import {
  fulfillFromIntent,
  legacyOrderIdForUidOffer,
  orderIdForPaymentIntent,
} from "../lib/fulfill.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHECKOUT_SOURCE = readFileSync(join(ROOT, "../routes/checkout.js"), "utf8");
const FULFILL_SOURCE = readFileSync(join(ROOT, "../lib/fulfill.js"), "utf8");
const CLIENT_CHECKOUT = readFileSync(
  join(ROOT, "../../client/src/pages/Checkout.tsx"),
  "utf8",
);
const MIGRATION = readFileSync(
  join(ROOT, "../../supabase/migrations/0004_repeat_purchase_attempts.sql"),
  "utf8",
);

function fakeStripe({ intents = new Map(), onCreate } = {}) {
  const creates = [];
  const retrieves = [];
  return {
    creates,
    retrieves,
    paymentIntents: {
      create: async (params, options = {}) => {
        creates.push({ params, options });
        if (onCreate) onCreate(params, options);
        const key = options.idempotencyKey;
        assert.ok(key, "idempotencyKey required");
        for (const intent of intents.values()) {
          if (intent._idempotencyKey === key) return intent;
        }
        const intent = {
          id: `pi_fixture_${creates.length}`,
          client_secret: `secret_${creates.length}`,
          amount: params.amount,
          currency: params.currency,
          metadata: params.metadata,
          status: "requires_payment_method",
          _idempotencyKey: key,
        };
        intents.set(intent.id, intent);
        return intent;
      },
      retrieve: async (id) => {
        retrieves.push(id);
        const intent = intents.get(id);
        if (!intent) {
          const err = new Error("No such payment_intent");
          err.statusCode = 404;
          throw err;
        }
        return intent;
      },
    },
  };
}

function memoryFulfillDb() {
  const orders = new Map();
  const profiles = new Map();
  return {
    orders,
    profiles,
    from(table) {
      if (table === "drafts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
            }),
          }),
        };
      }
      if (table === "orders") {
        return {
          upsert(row, { onConflict, ignoreDuplicates } = {}) {
            assert.equal(onConflict, "id");
            assert.equal(ignoreDuplicates, true);
            const existed = orders.has(row.id);
            if (!existed) orders.set(row.id, { ...row });
            const inserted = existed ? [] : [{ id: row.id }];
            return {
              select: async () => ({ data: inserted, error: null }),
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          update(patch) {
            return {
              eq: async (_col, id) => {
                profiles.set(id, { ...(profiles.get(id) || {}), ...patch });
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

test("idempotency key binds to attempt id, not raw offer facts alone", () => {
  const a = buildPaymentAttemptIdempotencyKey({ attemptId: "attempt_aaa" });
  const b = buildPaymentAttemptIdempotencyKey({ attemptId: "attempt_bbb" });
  assert.equal(a, "sdd-pi-v2:attempt_aaa");
  assert.notEqual(a, b);
  const facts = hashPaymentAttemptFacts({
    uid: "user_1",
    offer: "agent_mcp_server",
    amount: 34900,
    currency: "usd",
    uploadPath: "",
  });
  assert.match(facts, /^[a-f0-9]{64}$/);
});

test("create retry with same attempt identity reuses one PaymentIntent", async () => {
  const store = createMemoryPaymentAttemptStore();
  const stripeClient = fakeStripe();
  const offer = getOffer("agent_mcp_server");

  const first = await createOfferPaymentIntent({
    stripeClient,
    store,
    uid: "user_checkout_1",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
    newAttemptId: () => "attempt_stable_1",
  });
  const second = await createOfferPaymentIntent({
    stripeClient,
    store,
    uid: "user_checkout_1",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
    paymentAttemptId: first.attemptId,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.intent.id, second.intent.id);
  assert.equal(first.attemptId, second.attemptId);
  assert.equal(first.idempotencyKey, buildPaymentAttemptIdempotencyKey({ attemptId: first.attemptId }));
  assert.equal(stripeClient.creates.length, 1);
  assert.equal(first.intent.amount, offer.amount);
  assert.equal(first.intent.metadata.payment_attempt_id, first.attemptId);
});

test("unknown retrieve keeps the same attempt identity for idempotent recreate", async () => {
  const store = createMemoryPaymentAttemptStore();
  let createCount = 0;
  const stripeClient = {
    paymentIntents: {
      create: async (params, options = {}) => {
        createCount += 1;
        return {
          id: `pi_recreate_${createCount}`,
          client_secret: `secret_${createCount}`,
          amount: params.amount,
          currency: params.currency,
          metadata: params.metadata,
          status: "requires_payment_method",
          _idempotencyKey: options.idempotencyKey,
        };
      },
      retrieve: async () => {
        throw new Error("upstream timeout");
      },
    },
  };

  const first = await createOfferPaymentIntent({
    stripeClient,
    store,
    uid: "user_u",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
    newAttemptId: () => "attempt_uncertain",
  });
  // Simulate persisted PI id with flaky retrieve on the next navigation/retry.
  await store.update(first.attemptId, { stripe_payment_intent: first.intent.id });

  const second = await createOfferPaymentIntent({
    stripeClient,
    store,
    uid: "user_u",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
    paymentAttemptId: first.attemptId,
  });

  assert.equal(second.attemptId, first.attemptId);
  assert.equal(second.idempotencyKey, first.idempotencyKey);
  assert.equal(createCount, 2);
});

test("after success a second checkout opens a new PI; canceled then new also works", async () => {
  const store = createMemoryPaymentAttemptStore();
  const intents = new Map();
  const stripeClient = fakeStripe({ intents });

  const first = await createOfferPaymentIntent({
    stripeClient,
    store,
    uid: "user_repeat",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
    newAttemptId: () => "attempt_first",
  });
  intents.get(first.intent.id).status = "succeeded";
  await markPaymentAttemptSucceeded({
    store,
    attemptId: first.attemptId,
    paymentIntentId: first.intent.id,
  });

  const second = await createOfferPaymentIntent({
    stripeClient,
    store,
    uid: "user_repeat",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
    // Client cleared sessionStorage after pay; no payment_attempt_id.
    newAttemptId: () => "attempt_second",
  });
  assert.notEqual(second.attemptId, first.attemptId);
  assert.notEqual(second.intent.id, first.intent.id);

  intents.get(second.intent.id).status = "canceled";
  const third = await createOfferPaymentIntent({
    stripeClient,
    store,
    uid: "user_repeat",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
    paymentAttemptId: second.attemptId,
    newAttemptId: () => "attempt_third",
  });
  assert.notEqual(third.attemptId, second.attemptId);
  assert.notEqual(third.intent.id, second.intent.id);
});

test("changed immutable purchase facts mint a distinct attempt", async () => {
  const store = createMemoryPaymentAttemptStore();
  const stripeClient = fakeStripe();
  const first = await createOfferPaymentIntent({
    stripeClient,
    store,
    uid: "user_facts",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
    newAttemptId: () => "attempt_facts_a",
  });
  const second = await createOfferPaymentIntent({
    stripeClient,
    store,
    uid: "user_facts",
    email: "buyer@example.com",
    offerSlug: "agent_workflow",
    newAttemptId: () => "attempt_facts_b",
  });
  assert.notEqual(first.attemptId, second.attemptId);
  assert.notEqual(first.intent.id, second.intent.id);
  assert.notEqual(
    hashPaymentAttemptFacts({
      uid: "user_facts",
      offer: "agent_mcp_server",
      amount: getOffer("agent_mcp_server").amount,
      currency: CURRENCY,
    }),
    hashPaymentAttemptFacts({
      uid: "user_facts",
      offer: "agent_workflow",
      amount: getOffer("agent_workflow").amount,
      currency: CURRENCY,
    }),
  );
});

test("fulfill uses payment identity; duplicate webhook is one order; second PI is another", async () => {
  const sb = memoryFulfillDb();
  const intentA = {
    id: "pi_paid_a",
    amount: 34900,
    currency: "usd",
    receipt_email: "buyer@example.com",
    metadata: {
      uid: "user_f",
      offer: "agent_mcp_server",
      amount: "34900",
      payment_attempt_id: "attempt_a",
    },
  };
  const first = await fulfillFromIntent(intentA, { sb });
  const retry = await fulfillFromIntent(intentA, { sb });
  assert.equal(first.orderId, orderIdForPaymentIntent(intentA));
  assert.equal(first.isNew, true);
  assert.equal(retry.isNew, false);
  assert.equal(retry.orderId, first.orderId);
  assert.equal(sb.orders.size, 1);

  const intentB = {
    ...intentA,
    id: "pi_paid_b",
    metadata: { ...intentA.metadata, payment_attempt_id: "attempt_b" },
  };
  const secondPurchase = await fulfillFromIntent(intentB, { sb });
  assert.equal(secondPurchase.isNew, true);
  assert.notEqual(secondPurchase.orderId, first.orderId);
  assert.equal(sb.orders.size, 2);

  // Legacy order id shape remains a distinct, preservable key.
  const legacyId = legacyOrderIdForUidOffer("user_f", "agent_mcp_server");
  assert.equal(legacyId, "order_user_f_agent_mcp_server");
  assert.notEqual(legacyId, first.orderId);
});

test("checkout route and client support attempt round-trip and human return navigation", () => {
  assert.match(CHECKOUT_SOURCE, /payment_attempt_id/);
  assert.match(CHECKOUT_SOURCE, /paymentAttemptId/);
  assert.match(FULFILL_SOURCE, /orderIdForPaymentIntent|order_\$\{intent\.id\}/);
  assert.doesNotMatch(FULFILL_SOURCE, /order_\$\{uid\}_\$\{meta\.offer/);
  assert.match(MIGRATION, /payment_attempts/);
  assert.match(MIGRATION, /orders_stripe_payment_intent_uidx/);

  assert.match(CLIENT_CHECKOUT, /sdd:payment-attempt:/);
  assert.match(CLIENT_CHECKOUT, /payment_attempt_id/);
  assert.match(CLIENT_CHECKOUT, /sessionStorage\.setItem/);
  assert.match(CLIENT_CHECKOUT, /sessionStorage\.removeItem/);
  assert.match(CLIENT_CHECKOUT, /navigate\("\/dashboard\?paid=1"/);
});
