import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { SignJWT } from "jose";

// Real Express auth/checkout/verify/webhook paths; all provider I/O is local.
test("authenticated HTTP checkout races, repeat purchases, uncertain retrieval and legacy webhook replay", async (t) => {
  const orders = new Map();
  let draftReads = 0;
  let currentDraft = { data: { details: "Later task B" }, upload_path: "later-task.pdf" };
  const provider = express();
  provider.use(express.json());
  provider.get("/auth/v1/.well-known/jwks.json", (_req, res) => res.json({ keys: [] }));
  provider.all("/rest/v1/:table", (req, res) => {
    if (req.params.table === "drafts") { draftReads++; return res.json(currentDraft); }
    if (req.params.table === "profiles") return res.json([]);
    assert.equal(req.params.table, "orders");
    if (req.method === "POST") {
      assert.equal(req.query.on_conflict, "stripe_payment_intent");
      const row = req.body;
      if (orders.has(row.stripe_payment_intent)) return res.status(201).json([]);
      orders.set(row.stripe_payment_intent, row);
      return res.status(201).json([{ id: row.id }]);
    }
    const pi = req.query.stripe_payment_intent.replace(/^eq\./, "");
    return res.json({ id: orders.get(pi)?.id });
  });
  const providerServer = provider.listen(0, "127.0.0.1");
  await new Promise(resolve => providerServer.once("listening", resolve));
  t.after(() => { providerServer.closeAllConnections(); providerServer.close(); });
  process.env.SUPABASE_URL = `http://127.0.0.1:${providerServer.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  process.env.SUPABASE_JWT_SECRET = "fixture-only-local-jwt-secret-32bytes";
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture_not_a_real_key";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture_not_a_real_secret";
  delete process.env.RESEND_API_KEY;

  const { stripe } = await import("../lib/stripe.js");
  const { paymentAttemptStoreDeps, createMemoryPaymentAttemptStore } = await import("../lib/payment-attempt-store.js");
  const store = createMemoryPaymentAttemptStore();
  paymentAttemptStoreDeps.getStore = () => store;
  const intents = new Map();
  const keys = new Map();
  let retrieveFails = false;
  let calls = 0;
  stripe.paymentIntents.create = async (params, { idempotencyKey }) => {
    calls++;
    if (keys.has(idempotencyKey)) return intents.get(keys.get(idempotencyKey));
    const intent = {
      id: `pi_http_${keys.size + 1}`, client_secret: `fixture_secret_${keys.size + 1}`,
      ...params, status: "requires_payment_method",
    };
    keys.set(idempotencyKey, intent.id);
    intents.set(intent.id, intent);
    return intent;
  };
  stripe.paymentIntents.retrieve = async id => {
    if (retrieveFails) throw new Error("fixture retrieve timeout");
    return intents.get(id);
  };
  const { default: checkout } = await import("../routes/checkout.js");
  const { default: webhook } = await import("../routes/stripe-webhook.js");
  const app = express();
  app.use(express.json({ verify: (req, _res, body) => { req.rawBody = body; } }));
  app.use("/api/checkout", checkout);
  app.use("/api/stripe", webhook);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = await new SignJWT({ email: "buyer@example.test", email_verified: true })
    .setSubject("00000000-0000-0000-0000-000000000001")
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
  const post = async (path, body, auth = token) => {
    const response = await fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const create = body => post("/api/checkout/create-payment-intent", { offer: "agent_mcp_server", ...body });
  assert.equal((await post("/api/checkout/create-payment-intent", { offer: "agent_mcp_server" }, "invalid")).status, 401);
  const initial = await Promise.all(Array.from({ length: 5 }, () => create({})));
  assert.ok(initial.every(result => result.status === 200));
  assert.equal(new Set(initial.map(result => result.body.paymentIntentId)).size, 1);
  const first = initial[0].body;
  retrieveFails = true;
  const callsBefore = calls;
  assert.equal((await create({ payment_attempt_id: first.paymentAttemptId })).status, 503);
  assert.equal(calls, callsBefore);
  retrieveFails = false;
  const freeze = intake => post("/api/checkout/prepare-payment", { payment_attempt_id: first.paymentAttemptId, intake });
  const taskA = { details: "Original task A", uploadPath: "00000000-0000-0000-0000-000000000001/task-a.pdf" };
  assert.equal((await freeze({ ...taskA, uploadPath: "another-user/private.pdf" })).status, 400);
  assert.equal((await freeze(taskA)).status, 200);
  assert.equal((await freeze({ ...taskA, details: "Changed task cannot silently pay task A" })).status, 409);
  assert.equal((await freeze(taskA)).status, 200);
  const resumed = await create({ payment_attempt_id: first.paymentAttemptId });
  assert.deepEqual(resumed.body.intakeSnapshot, taskA);
  intents.get(first.paymentIntentId).status = "succeeded";
  const verified = await post("/api/checkout/verify", { paymentIntentId: first.paymentIntentId });
  assert.equal(verified.status, 200);
  assert.equal(orders.size, 1);
  assert.deepEqual(orders.get(first.paymentIntentId).meta.intake, { details: taskA.details });
  assert.equal(orders.get(first.paymentIntentId).upload_path, taskA.uploadPath);
  assert.equal(draftReads, 0, "attempt purchases must never load mutable same-offer drafts");
  const second = await create({});
  assert.equal(second.status, 200);
  assert.notEqual(second.body.paymentIntentId, first.paymentIntentId);
  intents.get(second.body.paymentIntentId).status = "succeeded";
  // Simulate a client bypassing prepare. Its paid outcome is visible, not dropped.
  const unprepared = await post("/api/checkout/verify", { paymentIntentId: second.body.paymentIntentId });
  assert.equal(unprepared.status, 200);
  assert.equal(unprepared.body.fulfillmentPending, true);
  assert.equal(orders.get(second.body.paymentIntentId).status, "intake_required");
  assert.equal(orders.get(second.body.paymentIntentId).meta.intake, null);
  assert.equal(orders.get(second.body.paymentIntentId).upload_path, null);
  assert.equal(orders.size, 2);

  // Actual Stripe signature verification and HTTP webhook reach real fulfillment.
  const deliver = async intent => {
    const payload = JSON.stringify({ id: `evt_${intent.id}`, type: "payment_intent.succeeded", data: { object: intent } });
    return fetch(`${base}/api/stripe/webhook`, {
      method: "POST", body: payload,
      headers: { "Content-Type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET }) },
    });
  };
  assert.equal((await deliver(intents.get(first.paymentIntentId))).status, 200);
  assert.equal(orders.size, 2);
  const legacy = { ...intents.get(first.paymentIntentId), id: "pi_legacy", metadata: { uid: "legacy-user", offer: "agent_mcp_server", amount: "34900" } };
  orders.set(legacy.id, { id: "order_legacy-user_agent_mcp_server", stripe_payment_intent: legacy.id, status: "delivered" });
  assert.equal((await deliver(legacy)).status, 200);
  assert.equal(orders.size, 3);
  assert.equal(orders.get(legacy.id).status, "delivered");
  assert.ok(draftReads > 0, "only untagged pre-migration payments retain legacy draft behavior");
});
