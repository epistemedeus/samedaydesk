import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import express from "express";
import { SignJWT } from "jose";
import { watchOffer } from "../lib/care-contract.js";
import { firstUseIntake } from "../lib/first-use-intake.js";
import { AGENT_FIRST_USE_REPORT as offer, firstUseCheckoutEnabled, getOffer } from "../pricing.js";

const details = "From a cold start, find a public example and complete one read-only tool call.";
const intake = { targetUrl: "https://example.com/mcp", details };
const buyer = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";

test("Q49 is distinct from the seller report and validates public scope without fetching", () => {
  assert.equal(getOffer(offer).amount, 4900);
  assert.equal(getOffer(offer).accountOnly, true);
  assert.equal(getOffer("seller_contract_repair").amount, 49000);
  assert.equal(getOffer("seller_contract_repair").accountOnly, undefined);
  assert.equal(firstUseCheckoutEnabled({}), false);
  assert.equal(firstUseCheckoutEnabled({ SDS_AGENT_FIRST_USE_REPORT: "true" }), false);
  assert.equal(firstUseCheckoutEnabled({ SDS_AGENT_FIRST_USE_REPORT: "1" }), true);
  const manifest = JSON.parse(readFileSync(new URL("../../release/offers.json", import.meta.url), "utf8"));
  const row = manifest.offers.find(item => item.offer === offer);
  const seller = manifest.offers.find(item => item.id === "seller_conformance_report");
  const watch = manifest.notInHarnessYet.find(item => item.id === "legacy_skill_watch");
  assert.equal(row.cents, 4900);
  assert.equal(row.kind, "account");
  assert.equal(row.switchedOn, false);
  assert.equal(row.status, "unavailable");
  assert.equal(row.entry, undefined);
  assert.equal(row.endpoint, undefined);
  assert.equal(seller.cents, 49000);
  assert.equal(watch.cents, 1200);
  assert.equal(watch.interval, "month");
  assert.equal(watchOffer.cents, 1200);
  assert.deepEqual(firstUseIntake(intake), { ...intake, uploadPath: "" });
  for (const targetUrl of ["http://example.com", "https://127.0.0.1/", "https://[::1]/", "https://localhost/",
    "https://host.internal/", "https://auth:password@example.com/", "https://example.com:8080/", "https://example.com/?secret=x",
    "https://example.com/#frag"]) assert.equal(firstUseIntake({ ...intake, targetUrl }), null);
  assert.equal(firstUseIntake({ ...intake, details: " " }), null);
  assert.equal(firstUseIntake({ ...intake, details: "é".repeat(2001) }), null);
  assert.equal(firstUseIntake({ ...intake, uploadPath: "fixture.pdf" }), null);
  assert.equal(firstUseIntake({ ...intake, amount: 1 }), null);
});

test("Q49 through signed fixture webhook, account checkout, operating queue and private delivery", async t => {
  const dir = mkdtempSync(join(tmpdir(), "sds-q49-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.SDS_AGENT_FIRST_USE_REPORT;
  });
  const orders = new Map(), objects = new Map();
  let loseOrderReply = false, loseUploadReply = false, loseDeliveryReply = false, signedLinks = 0;
  const api = express();
  api.use(express.raw({ limit: "10mb", type: "application/pdf" }));
  api.use(express.json());
  api.get("/auth/v1/.well-known/jwks.json", (_req, res) => res.json({ keys: [] }));
  api.all("/rest/v1/:table", (req, res) => {
    if (req.params.table === "profiles") return res.json([]);
    if (req.params.table === "payment_attempts" && req.method === "GET") {
      return store.getById(req.query.id?.replace(/^eq\./, "")).then(row => res.json(row ? [row] : []));
    }
    assert.equal(req.params.table, "orders");
    const filters = ["id", "offer", "status", "user_id", "currency", "amount", "stripe_payment_intent"];
    const found = [...orders.values()].filter(row => filters.every(k => !req.query[k] || req.query[k] === `eq.${row[k]}`));
    if (req.method === "POST") {
      assert.equal(req.query.on_conflict, "stripe_payment_intent");
      if (orders.has(req.body.id)) return res.status(201).json([]);
      orders.set(req.body.id, { ...req.body, created_at: new Date().toISOString() });
      if (loseOrderReply) { loseOrderReply = false; return res.status(500).json({ message: "fixture lost order reply" }); }
      return res.status(201).json([{ id: req.body.id }]);
    }
    if (req.method === "PATCH") {
      for (const row of found) orders.set(row.id, { ...row, ...req.body });
      if (loseDeliveryReply) { loseDeliveryReply = false; return res.status(500).json({ message: "fixture lost delivery reply" }); }
      return res.json(found.map(row => ({ id: row.id })));
    }
    return res.json(req.headers.accept?.includes("vnd.pgrst.object") ? found[0] ?? null : found);
  });
  api.use("/storage/v1/object", (req, res) => {
    const path = req.path.replace(/^\/(?:authenticated\/|sign\/)?intake-uploads\//, "");
    assert.match(path, /^agent-first-use-reports\/order_pi_\w+\/report\.pdf$/);
    if (req.path.startsWith("/sign/")) {
      signedLinks++;
      assert.equal(req.body.expiresIn, 300);
      if (!objects.has(path)) return res.status(404).json({ message: "missing artifact" });
      return res.json({ signedURL: "/object/sign/intake-uploads/" + path + "?token=fixture-only" });
    }
    if (req.method === "POST") {
      if (objects.has(path)) return res.status(409).json({ message: "object exists" });
      objects.set(path, req.body);
      if (loseUploadReply) { loseUploadReply = false; return res.status(500).json({ message: "fixture lost upload reply" }); }
      return res.json({ Key: "intake-uploads/" + path });
    }
    if (!objects.has(path)) return res.status(404).json({ message: "missing artifact" });
    return res.type("application/pdf").send(objects.get(path));
  });
  const listen = async app => {
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    return `http://127.0.0.1:${server.address().port}`;
  };
  Object.assign(process.env, {
    SUPABASE_URL: await listen(api), SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role",
    SUPABASE_JWT_SECRET: "fixture-only-local-jwt-secret-32bytes",
    STRIPE_SECRET_KEY: "sk_test_fixture_not_a_real_key", STRIPE_WEBHOOK_SECRET: "whsec_fixture_not_a_real_secret",
    SDS_PRIVATE_PREVIEW: "1", SDS_ORDER_USDC: "1", ORDER_PAYMENTS_SDS_TOKEN: "fixture-only".repeat(4),
  });
  delete process.env.RESEND_API_KEY;
  delete process.env.SDS_AGENT_FIRST_USE_REPORT;
  const { stripe } = await import("../lib/stripe.js");
  const { createMemoryPaymentAttemptStore, paymentAttemptStoreDeps } = await import("../lib/payment-attempt-store.js");
  const store = createMemoryPaymentAttemptStore();
  paymentAttemptStoreDeps.getStore = () => store;
  const intents = new Map(), intentKeys = new Map();
  let creates = 0, loseStripeReply = false;
  stripe.paymentIntents.create = async (params, { idempotencyKey }) => {
    creates++;
    if (intentKeys.has(idempotencyKey)) return intents.get(intentKeys.get(idempotencyKey));
    const saved = await store.getById(params.metadata.payment_attempt_id);
    assert.deepEqual(saved.intake_snapshot, { ...intake, uploadPath: "" });
    assert.equal(saved.amount, 4900);
    const id = `pi_q49_${intents.size + 1}`;
    const object = { id, ...params, client_secret: "fixture-client-secret", status: "requires_payment_method", livemode: false };
    intents.set(id, object);
    intentKeys.set(idempotencyKey, id);
    if (loseStripeReply) { loseStripeReply = false; throw new Error("fixture lost create reply"); }
    return object;
  };
  stripe.paymentIntents.retrieve = async id => intents.get(id);
  const { default: checkout } = await import("../routes/checkout.js");
  const { default: webhook } = await import("../routes/stripe-webhook.js");
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use("/api/checkout", checkout);
  app.use("/api/stripe", webhook);
  const base = await listen(app);
  const sign = async (uid, verified) => new SignJWT({ email: "fixture@example.test", email_verified: verified })
    .setSubject(uid).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m")
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
  const token = await sign(buyer, true), otherToken = await sign(other, true), unverified = await sign(buyer, false);
  async function call(path, { body, auth = token, headers = {} } = {}) {
    const r = await fetch(base + path, { method: body === undefined ? "GET" : "POST",
      headers: { ...(body !== undefined && { "Content-Type": "application/json" }), ...(auth && { Authorization: `Bearer ${auth}` }), ...headers },
      body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
    return { status: r.status, body: await r.json().catch(() => null), cache: r.headers.get("cache-control") };
  }
  const root = "/api/checkout";
  const create = (patch = {}, auth = token) => call(root + "/create-payment-intent", { body: { offer, intake, ...patch }, auth });
  const verify = (id, auth = token) => call(root + "/verify", { body: { paymentIntentId: id }, auth });
  const summary = await call(root + "/offers/" + offer, { auth: "" });
  assert.deepEqual(summary.body, { offer, cents: 4900, currency: "usd", status: "unavailable", methods: [] });
  assert.equal((await create()).status, 404);
  assert.equal((await call(root + "/hosted/" + offer)).status, 404);
  assert.equal((await call(root + "/hosted/" + offer, { body: { method: "card" } })).status, 404);
  assert.equal((await call(root + "/hosted/" + offer, { body: { method: "base_usdc" } })).status, 404);
  assert.equal(creates, 0);
  for (const value of ["0", "true", "yes"]) {
    process.env.SDS_AGENT_FIRST_USE_REPORT = value;
    assert.equal((await create()).status, 404, value);
    assert.deepEqual((await call(root + "/offers/" + offer, { auth: "" })).body.methods, [], value);
    assert.equal((await call(root + "/hosted/" + offer, { body: { method: "base_usdc" } })).status, 404, value);
  }
  process.env.SDS_AGENT_FIRST_USE_REPORT = "1";
  assert.equal((await call(root + "/hosted/" + offer)).status, 404);
  assert.equal((await call(root + "/hosted/" + offer, { body: { method: "card" } })).status, 404);
  assert.equal((await call(root + "/hosted/" + offer, { body: { method: "base_usdc" } })).status, 404);
  assert.deepEqual((await call(root + "/offers/" + offer, { auth: "" })).body,
    { offer, cents: 4900, currency: "usd", status: "available", methods: ["card"] });
  assert.equal((await create({}, unverified)).status, 403);
  assert.equal((await create({ intake: null })).status, 400);
  assert.equal(creates, 0);
  loseStripeReply = true;
  assert.equal((await create()).status, 502);
  const created = await create({ amount: 1, currency: "eur" });
  assert.equal(created.status, 200);
  assert.equal(created.body.amount, 4900);
  assert.equal(created.body.usdcAvailable, false);
  assert.equal(created.body.paymentUrl, undefined);
  assert.equal(created.body.rail, undefined);
  assert.equal(intentKeys.size, 1);
  const { paymentAttemptId: attempt, paymentIntentId: id } = created.body;
  const prepare = (scope, auth = token) => call(root + "/prepare-payment", { body: { payment_attempt_id: attempt, intake: scope }, auth });
  assert.equal((await create({ payment_attempt_id: attempt }, otherToken)).status, 404);
  assert.equal((await prepare(intake, otherToken)).status, 404);
  assert.equal((await create({ payment_attempt_id: attempt, intake: { ...intake, details: "Different task" } })).status, 409);
  assert.equal((await prepare({ ...intake, details: "Different task" })).status, 409);
  assert.equal((await prepare(intake)).status, 200);
  assert.equal((await call(root + "/usdc", { body: { payment_attempt_id: attempt, intake } })).status, 409);
  const intent = intents.get(id);
  Object.assign(intent, { status: "succeeded", amount_received: 4900 });
  assert.equal((await create({ payment_attempt_id: attempt })).status, 409);
  assert.equal(intentKeys.size, 1);
  assert.equal((await verify(id, otherToken)).status, 403);
  const signed = async (value, event = "evt_q49_a") => {
    const payload = JSON.stringify({ id: event, type: "payment_intent.succeeded", livemode: false, data: { object: value } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    return call("/api/stripe/webhook", { body: payload, auth: "", headers: { "stripe-signature": signature } });
  };
  for (const patch of [{ amount: 49000 }, { amount_received: 1 }, { currency: "eur" }, { livemode: true },
    { metadata: { ...intent.metadata, uid: other } },
    { metadata: { ...intent.metadata, offer: "seller_contract_repair" } }, { metadata: { ...intent.metadata, payment_attempt_id: "" } }]) {
    assert.equal((await signed({ ...intent, ...patch })).status, 500);
    assert.equal(orders.size, 0);
  }
  delete process.env.SDS_AGENT_FIRST_USE_REPORT;
  assert.equal((await prepare(intake)).status, 404);
  loseOrderReply = true;
  assert.equal((await signed(intent)).status, 500);
  assert.equal(orders.size, 1);
  const order = "order_" + id;
  assert.equal((await verify(id)).body.orderId, order);
  assert.equal((await verify(id)).body.orderId, order);
  assert.equal(orders.size, 1);
  assert.equal((await signed(intent)).status, 200);
  assert.equal((await signed(intent, "evt_q49_replay")).status, 200);
  assert.equal(orders.size, 1);
  assert.deepEqual(orders.get(order).meta.intake, intake);
  const buyerDelivery = auth => call(root + "/orders/" + order + "/delivery", { auth });
  assert.equal((await buyerDelivery(otherToken)).status, 404);
  assert.deepEqual((await buyerDelivery(token)).body, { orderId: order, status: "received", delivery: null });

  const run = (...args) => promisify(execFile)(process.execPath, ["server/scripts/agent-first-use-report.mjs", ...args]);
  const queue = join(dir, "queue.json");
  assert.deepEqual(JSON.parse((await run("queue", "--output", queue)).stdout), { received: 1 });
  assert.equal(statSync(queue).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(queue))[0].id, order);
  const pdf = join(dir, "fixture.pdf"), links = join(dir, "links.json");
  writeFileSync(pdf, "%PDF-1.7 fixture report, never a customer artifact", { mode: 0o600 });
  const refs = { recordingUrl: "https://recording.example.com/view/fixture", recordingAccessConfirmed: true,
    fixPrUrl: "https://github.com/example/fixture/pull/1" };
  writeFileSync(links, JSON.stringify({ recordingAccessConfirmed: true }), { mode: 0o600 });
  const deliver = () => run("deliver", "--order", order, "--report", pdf, "--links", links);
  await assert.rejects(deliver());
  assert.equal(objects.size, 0);
  assert.equal(orders.get(order).status, "received");
  writeFileSync(links, JSON.stringify(refs), { mode: 0o600 });
  loseUploadReply = loseDeliveryReply = true;
  assert.deepEqual(JSON.parse((await deliver()).stdout), { status: "delivered", reused: true });
  assert.deepEqual(JSON.parse((await deliver()).stdout), { status: "delivered", reused: true });
  assert.equal(objects.size, 1);
  assert.equal((await buyerDelivery(otherToken)).status, 404);
  assert.equal(signedLinks, 0);
  const result = await buyerDelivery(token);
  assert.equal(result.status, 200);
  assert.equal(result.cache, "no-store");
  assert.equal(result.body.delivery.recordingUrl, refs.recordingUrl);
  assert.equal(result.body.delivery.fixPrUrl, refs.fixPrUrl);
  assert.equal(result.body.delivery.reportUrlExpiresIn, 300);
  assert.match(result.body.delivery.reportSha256, /^[a-f0-9]{64}$/);
  assert.equal(signedLinks, 1);
  writeFileSync(links, JSON.stringify({ ...refs, recordingUrl: "https://recording.example.com/view/changed" }));
  await assert.rejects(deliver());
  process.env.SDS_AGENT_FIRST_USE_REPORT = "1";
  const quiet = "00000000-0000-0000-0000-000000000004";
  const quietToken = await sign(quiet, true);
  const quietCreated = (await create({}, quietToken)).body;
  const quietIntent = intents.get(quietCreated.paymentIntentId);
  Object.assign(quietIntent, { status: "succeeded", amount_received: 4900 });
  const quietOrder = "order_" + quietIntent.id;
  assert.equal((await verify(quietIntent.id, quietToken)).body.orderId, quietOrder);
  const quietLinks = join(dir, "links-no-pr.json");
  writeFileSync(quietLinks, JSON.stringify({ recordingUrl: refs.recordingUrl, recordingAccessConfirmed: true }), { mode: 0o600 });
  assert.deepEqual(JSON.parse((await run("deliver", "--order", quietOrder, "--report", pdf, "--links", quietLinks)).stdout),
    { status: "delivered", reused: false });
  const quietRead = await call(root + "/orders/" + quietOrder + "/delivery", { auth: quietToken });
  assert.equal(quietRead.status, 200);
  assert.equal(quietRead.body.delivery.recordingUrl, refs.recordingUrl);
  assert.equal(quietRead.body.delivery.fixPrUrl, null);
  assert.equal((await call(root + "/orders/" + quietOrder + "/delivery", { auth: token })).status, 404);
  assert.equal((await call(root + "/orders/" + quietOrder + "/delivery", { auth: otherToken })).status, 404);
  for (const [uid, kind] of [[other, "missing"], ["00000000-0000-0000-0000-000000000003", "altered"]]) {
    const buyerToken = await sign(uid, true);
    const next = (await create({}, buyerToken)).body;
    const object = intents.get(next.paymentIntentId);
    Object.assign(object, { status: "succeeded", amount_received: 4900 });
    await store.update(next.paymentAttemptId, { intake_snapshot: kind === "missing" ? null : { ...intake, details: "altered" } });
    assert.equal((await verify(object.id, buyerToken)).body.fulfillmentPending, true);
    assert.equal(orders.get("order_" + object.id).status, "intake_required");
  }
  assert.deepEqual(JSON.parse((await run("queue", "--output", join(dir, "after.json"))).stdout), { received: 0 });
});

test("Q49 stays off care card and agent USDC entrances and cannot settle there", async () => {
  const { createCareService } = await import("../lib/care-service.js");
  const { CareError } = await import("../lib/care-contract.js");
  let reserved = 0;
  const care = createCareService({
    store: { quotes: {}, reserve: async () => { reserved += 1; throw new Error("must not reserve"); } },
    stripe: { charges: { retrieve: async () => { throw new Error("must not retrieve a charge"); } } },
    secret: "fixture-only-care-secret-32bytes!!",
    origin: "https://samedaydesk.com",
    live: false,
    orderPayments: true,
  });
  const id = "00000000-0000-4000-8000-000000000099";
  await assert.rejects(() => care.start(offer, id), error => error instanceof CareError && error.status === 400);
  await assert.rejects(() => care.startUsdc(offer, id, "buyer@example.test"), error => error instanceof CareError && error.status === 400);
  await assert.rejects(() => care.recordHosted({
    id: "cs_test_q49", livemode: false, mode: "payment", status: "complete", payment_status: "paid",
    payment_intent: "pi_q49_hosted", amount_total: 4900, currency: "usd", metadata: { offer },
  }, {
    id: "pi_q49_hosted", livemode: false, status: "succeeded", amount: 4900, currency: "usd", metadata: { offer },
  }), error => error instanceof CareError && error.status === 409);
  assert.equal(reserved, 0);
});
