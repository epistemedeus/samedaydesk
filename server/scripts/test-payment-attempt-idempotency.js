import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPaymentAttemptIdempotencyKey,
  createOfferPaymentIntent,
} from "../lib/payment-attempt.js";
import { getOffer, CURRENCY } from "../pricing.js";
import { fulfillFromIntent } from "../lib/fulfill.js";

const CHECKOUT_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../routes/checkout.js"),
  "utf8",
);
const FULFILL_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../lib/fulfill.js"),
  "utf8",
);

test("identical immutable purchase facts reuse one idempotency key", () => {
  const a = buildPaymentAttemptIdempotencyKey({
    uid: "user_1",
    offer: "agent_mcp_server",
    amount: 34900,
    currency: "usd",
    uploadPath: "",
  });
  const b = buildPaymentAttemptIdempotencyKey({
    uid: "user_1",
    offer: "agent_mcp_server",
    amount: 34900,
    currency: "usd",
    uploadPath: "",
  });
  assert.equal(a, b);
  assert.match(a, /^sdd-pi-v1:[a-f0-9]{40}$/);
});

test("changed immutable purchase facts mint a distinct payment attempt key", () => {
  const base = {
    uid: "user_1",
    offer: "agent_mcp_server",
    amount: 34900,
    currency: "usd",
    uploadPath: "",
  };
  const keys = new Set([
    buildPaymentAttemptIdempotencyKey(base),
    buildPaymentAttemptIdempotencyKey({ ...base, offer: "agent_workflow" }),
    buildPaymentAttemptIdempotencyKey({ ...base, amount: 14900 }),
    buildPaymentAttemptIdempotencyKey({ ...base, currency: "eur" }),
    buildPaymentAttemptIdempotencyKey({ ...base, uploadPath: "intake/a.pdf" }),
    buildPaymentAttemptIdempotencyKey({ ...base, uid: "user_2" }),
  ]);
  assert.equal(keys.size, 6);
});

test("createOfferPaymentIntent (route export path) dedupes duplicate creates", async () => {
  const offer = getOffer("agent_mcp_server");
  assert.ok(offer);

  const creates = [];
  const intentsByKey = new Map();
  const fakeStripe = {
    paymentIntents: {
      create: async (params, options = {}) => {
        creates.push({ params, options });
        const key = options.idempotencyKey;
        assert.ok(key, "idempotencyKey required");
        if (intentsByKey.has(key)) return intentsByKey.get(key);
        const intent = {
          id: `pi_fixture_${creates.length}`,
          client_secret: `secret_${creates.length}`,
          amount: params.amount,
          currency: params.currency,
          metadata: params.metadata,
          status: "requires_payment_method",
        };
        intentsByKey.set(key, intent);
        return intent;
      },
    },
  };

  const expectedKey = buildPaymentAttemptIdempotencyKey({
    uid: "user_checkout_1",
    offer: "agent_mcp_server",
    amount: offer.amount,
    currency: CURRENCY,
    uploadPath: "",
  });

  const first = await createOfferPaymentIntent({
    stripeClient: fakeStripe,
    uid: "user_checkout_1",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
  });
  const second = await createOfferPaymentIntent({
    stripeClient: fakeStripe,
    uid: "user_checkout_1",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.intent.id, second.intent.id);
  assert.equal(first.idempotencyKey, expectedKey);
  assert.equal(second.idempotencyKey, expectedKey);
  assert.equal(creates.length, 2);
  assert.equal(intentsByKey.size, 1);

  const third = await createOfferPaymentIntent({
    stripeClient: fakeStripe,
    uid: "user_checkout_1",
    email: "buyer@example.com",
    offerSlug: "agent_mcp_server",
    uploadPath: "intake/brief.pdf",
  });
  assert.equal(third.ok, true);
  assert.notEqual(third.intent.id, first.intent.id);
  assert.notEqual(third.idempotencyKey, expectedKey);
  assert.equal(creates.length, 3);

  const unknown = await createOfferPaymentIntent({
    stripeClient: fakeStripe,
    uid: "user_checkout_1",
    email: "buyer@example.com",
    offerSlug: "not_a_real_offer",
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.status, 400);
});

test("checkout route wires createOfferPaymentIntent; fulfill stays retry-safe", () => {
  assert.match(CHECKOUT_SOURCE, /createOfferPaymentIntent/);
  assert.match(CHECKOUT_SOURCE, /\/create-payment-intent/);
  assert.equal(typeof fulfillFromIntent, "function");
  assert.match(FULFILL_SOURCE, /order_\$\{uid\}_\$\{meta\.offer \|\| intent\.id\}/);
  assert.match(FULFILL_SOURCE, /ignoreDuplicates:\s*true/);
});
