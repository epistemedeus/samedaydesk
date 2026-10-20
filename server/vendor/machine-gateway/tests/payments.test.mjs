import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import { once } from "node:events";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { fixture, echoRoute, tenantConfig, unsignedPaymentAdapter, TOKEN_A, TOKEN_B, delay, until, requirements } from "./helpers.mjs";
import { GatewayError } from "../src/errors.mjs";
import { existingFacilitatorAdapter, paymentAuthorizationIdentity } from "../src/payments.mjs";
import { invokeFacilitator } from "../src/facilitator-io.mjs";

const payment = "unsigned-local-fixture-intent1";
function paidOptions(adapter, overrides = {}) {
  return { extraRoutes: [echoRoute({ id: "fixture.paid", price: { amount: 5, unit: "usd-micros" }, paymentRequirements: requirements, ...overrides })],
    gatewayOptions: { paymentAdapter: adapter, paymentsEnabled: true } };
}

test("disabled payment, missing payment and caller budget failure never enter verification or settlement", async t => {
  const adapter = unsignedPaymentAdapter();
  const f = await fixture(t, { ...paidOptions(adapter), gatewayOptions: { paymentAdapter: adapter, paymentsEnabled: false } });
  const body = await f.quote({ value: "x" }, "fixture.paid");
  assert.equal((await f.execute(body, "disabled-payment-0001", { payment })).status, 503);
  f.gateway.paymentsEnabled = true; // Only this local test fixture opts in.
  assert.equal((await f.execute(body)).status, 402);
  assert.equal((await f.execute({ ...body, maxUnits: 4 }, "small-budget-key-0001", { payment })).status, 409);
  assert.deepEqual(adapter.calls, { verify: 0, settle: 0 });
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM attempts").get().n, 0);
});

test("concurrent retry and same quote/new-key replay permit one possible payment only", async t => {
  let providerCalls = 0;
  const adapter = unsignedPaymentAdapter({ verify: () => delay(50) });
  const f = await fixture(t, paidOptions(adapter, { run: async input => { providerCalls++; return input; } }));
  const body = await f.quote({ value: "real-local-result" }, "fixture.paid");
  const replies = await Promise.all(Array.from({ length: 8 }, () => f.execute(body, "same-purchase-key-001", { payment })));
  assert.ok(replies.every(r => [200, 202].includes(r.status)));
  assert.equal(new Set(replies.map(r => r.body.id)).size, 1);
  const final = await f.execute(body, "same-purchase-key-001", { payment });
  assert.equal(final.body.status, "completed"); assert.equal(final.body.payment.evidence, "unsigned_fixture");
  assert.deepEqual(adapter.calls, { verify: 1, settle: 1 }); assert.equal(providerCalls, 1);
  assert.equal((await f.execute(body, "different-key-000001", { payment })).status, 409);
  assert.equal((await f.execute({ ...body, input: { value: "changed" } }, "same-purchase-key-001", { payment })).status, 409);
});

test("FULL-WAL possible-spend marker and budget reservation are visible before existing adapter entry", async t => {
  let f;
  const adapter = unsignedPaymentAdapter({ settle: () => {
    const independent = new DatabaseSync(f.file);
    try {
      const row = independent.prepare("SELECT * FROM attempts").get();
      assert.equal(row.possible, 1); assert.equal(JSON.parse(row.body).payment.state, "possible");
      assert.equal(independent.prepare("SELECT units FROM usage").get().units, 5);
    } finally { independent.close(); }
  } });
  f = await fixture(t, paidOptions(adapter));
  const body = await f.quote({ value: "x" }, "fixture.paid");
  assert.equal((await f.execute(body, "durable-marker-key-01", { payment })).body.status, "completed");
});

test("lost settlement reply, restart and new quote retain uncertainty and cannot send another payment", async t => {
  const adapter = unsignedPaymentAdapter({ settle: () => { throw new Error("lost response with sensitive-provider-key"); } });
  const f = await fixture(t, paidOptions(adapter));
  const body = await f.quote({ value: "x" }, "fixture.paid");
  const first = await f.execute(body, "lost-payment-reply-01", { payment });
  assert.equal(first.body.status, "uncertain"); assert.equal(first.body.payment.state, "possible");
  await f.restart();
  const replay = await f.execute(body, "lost-payment-reply-01", { payment });
  assert.deepEqual(replay.body, first.body);
  const nextQuote = await f.quote({ value: "x" }, "fixture.paid");
  assert.equal((await f.execute(nextQuote, "new-quote-key-000001", { payment })).body.error.code, "payment_reused");
  const otherQuote = await f.quote({ value: "x" }, "fixture.paid", TOKEN_B);
  assert.equal((await f.execute(otherQuote, "cross-tenant-key-0001", { payment, token: TOKEN_B })).body.error.code, "payment_reused");
  assert.deepEqual(adapter.calls, { verify: 1, settle: 1 });
  assert.equal(f.store.db.prepare("SELECT units FROM usage WHERE tenant='tenant-a'").get().units, 5);
  const bytes = readFileSync(f.file).toString("latin1") + readFileSync(`${f.file}-wal`).toString("latin1");
  for (const secret of [payment, TOKEN_A, "sensitive-provider-key"]) assert.equal(bytes.includes(secret), false);
});

test("tenant lifetime budget reservations are atomic across concurrent distinct intents", async t => {
  const adapter = unsignedPaymentAdapter({ settle: () => delay(40) });
  const tenants = tenantConfig(["lockfile.delta", "http.capture", "fixture.echo", "fixture.paid"]); tenants[0].maxUnits = 7;
  const options = paidOptions(adapter); options.gatewayOptions.tenants = tenants;
  const f = await fixture(t, options);
  const one = await f.quote({ value: "one" }, "fixture.paid"), two = await f.quote({ value: "two" }, "fixture.paid");
  const results = await Promise.all([f.execute(one, "budget-atomic-key-01", { payment }), f.execute(two, "budget-atomic-key-02", { payment: "unsigned-local-fixture-intent2" })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
  assert.equal(adapter.calls.settle, 1);
  await f.restart();
  assert.equal((await f.execute(two, "budget-after-restart1", { payment: "unsigned-local-fixture-intent3" })).status, 429);
});

test("verification decline releases spend reservation; no settlement occurs", async t => {
  const adapter = unsignedPaymentAdapter({ verify: () => { throw new GatewayError("payment_declined", 402); } });
  const f = await fixture(t, paidOptions(adapter));
  const body = await f.quote({ value: "x" }, "fixture.paid");
  const result = await f.execute(body, "declined-payment-0001", { payment });
  assert.equal(result.body.status, "failed"); assert.equal(result.body.payment.state, "declined");
  assert.equal(f.store.db.prepare("SELECT units FROM usage").get().units, 0);
  assert.deepEqual(adapter.calls, { verify: 1, settle: 0 });
  assert.equal((await f.execute(body, "declined-payment-0001", { payment })).body.id, result.body.id);
});

test("invalid verification cannot poison an authorization before its first possible payment", async t => {
  let verifications = 0;
  const adapter = unsignedPaymentAdapter({ verify: () => { if (++verifications === 1) throw new GatewayError("payment_declined", 402); } });
  const f = await fixture(t, paidOptions(adapter));
  const first = await f.execute(await f.quote({ value: "x" }, "fixture.paid"), "invalid-verify-key01", { payment });
  assert.equal(first.body.payment.state, "declined");
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM credentials").get().n, 0);
  const second = await f.execute(await f.quote({ value: "x" }, "fixture.paid", TOKEN_B), "valid-verify-key-001", { payment, token: TOKEN_B });
  assert.equal(second.body.status, "completed"); assert.equal(adapter.calls.settle, 1);
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM credentials").get().n, 1);
});

test("distinct concurrent intents with the same authorization can verify but only one may possibly settle", async t => {
  const adapter = unsignedPaymentAdapter({ verify: () => delay(40) });
  const f = await fixture(t, paidOptions(adapter));
  const one = await f.quote({ value: "one" }, "fixture.paid"), two = await f.quote({ value: "two" }, "fixture.paid", TOKEN_B);
  const replies = await Promise.all([
    f.execute(one, "same-auth-intent-001", { payment }),
    f.execute(two, "same-auth-intent-002", { payment, token: TOKEN_B }),
  ]);
  assert.equal(replies.filter(r => r.body.status === "completed").length, 1);
  assert.equal(replies.filter(r => r.body.error?.code === "payment_reused").length, 1);
  assert.deepEqual(adapter.calls, { verify: 2, settle: 1 });
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM credentials").get().n, 1);
  assert.equal(f.store.db.prepare("SELECT sum(units) AS n FROM usage").get().n, 5);
});

test("timeout during verification cannot start a late settlement", async t => {
  const adapter = unsignedPaymentAdapter({ verify: () => delay(80) });
  const f = await fixture(t, paidOptions(adapter, { timeoutMs: 20 }));
  const body = await f.quote({ value: "x" }, "fixture.paid");
  const result = await f.execute(body, "verification-timeout1", { payment });
  assert.equal(result.body.status, "uncertain"); assert.equal(result.body.payment.state, "not_attempted");
  await delay(100);
  assert.deepEqual(adapter.calls, { verify: 1, settle: 0 });
  assert.equal(f.store.db.prepare("SELECT units FROM usage").get().units, 0);
  assert.equal((await f.execute(body, "verification-timeout1", { payment })).body.id, result.body.id);
});

test("timeout during possible settlement retains full budget and does not invoke provider on late reply", async t => {
  let providerCalls = 0;
  const adapter = unsignedPaymentAdapter({ settle: () => delay(80) });
  const f = await fixture(t, paidOptions(adapter, { timeoutMs: 20, run: input => { providerCalls++; return input; } }));
  const body = await f.quote({ value: "x" }, "fixture.paid");
  const result = await f.execute(body, "settlement-timeout-01", { payment });
  assert.equal(result.body.status, "uncertain"); assert.equal(result.body.payment.state, "possible");
  await delay(100);
  assert.equal(providerCalls, 0); assert.equal(adapter.calls.settle, 1);
  assert.equal(f.store.db.prepare("SELECT units FROM usage").get().units, 5);
  assert.equal((await f.execute(body, "settlement-timeout-01", { payment })).body.id, result.body.id);
});

test("post-settlement provider failure preserves payment evidence and rejects another possible payment", async t => {
  const adapter = unsignedPaymentAdapter();
  const f = await fixture(t, paidOptions(adapter, { run: () => { throw new Error("provider failure"); } }));
  const body = await f.quote({ value: "x" }, "fixture.paid");
  const result = await f.execute(body, "paid-provider-failed1", { payment });
  assert.equal(result.body.status, "failed"); assert.equal(result.body.payment.state, "settled");
  await f.restart();
  assert.equal((await f.execute(body, "paid-provider-failed1", { payment })).body.id, result.body.id);
  assert.equal(adapter.calls.settle, 1);
  assert.equal(f.store.db.prepare("SELECT units FROM usage").get().units, 5);
});

test("persistence failure before possible-spend marker prevents adapter entry", async t => {
  const adapter = unsignedPaymentAdapter();
  const f = await fixture(t, paidOptions(adapter));
  f.store.possiblePayment = () => { throw new Error("disk full: sensitive-key"); };
  const result = await f.execute(await f.quote({ value: "x" }, "fixture.paid"), "disk-failure-key-0001", { payment });
  assert.equal(result.body.status, "failed"); assert.equal(adapter.calls.settle, 0);
  assert.equal(JSON.stringify(result.body).includes("sensitive"), false);
});

test("existing facilitator seam uses pinned real SDK against unsigned local HTTP fixture only", async t => {
  const calls = [];
  const network = "eip155:999999", asset = `0x${"1".repeat(40)}`, payTo = `0x${"2".repeat(40)}`;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()); calls.push({ path: req.url, body, headers: req.headers });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(req.url === "/verify" ? { isValid: true } : { success: true, transaction: `0x${"0".repeat(64)}`, network }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const client = new HTTPFacilitatorClient({ url: `http://127.0.0.1:${server.address().port}`,
    createAuthHeaders: async () => ({ verify: { "x-local-enrollment": "unsigned-verify" }, settle: { "x-local-enrollment": "unsigned-settle" } }) });
  const adapter = existingFacilitatorAdapter({ client, budgetUnit: "usd-micros", network, asset, payTo, allowLoopback: true });
  const route = echoRoute({ price: { amount: 5, unit: "usd-micros" }, paymentRequirements: { ...requirements, network, asset, payTo } });
  assert.deepEqual(adapter.requirements(route), route.paymentRequirements);
  for (const header of ["", "not-base64!", Buffer.from(JSON.stringify({ unsignedFixture: true })).toString("base64")]) assert.throws(() => adapter.prepare(header, route));
  const prepared = { payload: { x402Version: 2, unsignedFixture: true }, requirements: adapter.requirements(route) };
  const context = { signal: new AbortController().signal };
  await adapter.verify(prepared, context); await adapter.settle(prepared, context);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(c => c.path), ["/verify", "/settle"]);
  assert.equal(calls[0].headers["x-local-enrollment"], "unsigned-verify");
  assert.equal(calls[1].headers["x-local-enrollment"], "unsigned-settle");
  for (const call of calls) {
    assert.deepEqual(call.body.paymentPayload, prepared.payload);
    assert.deepEqual(call.body.paymentRequirements, prepared.requirements);
    assert.equal(JSON.stringify(call.body).includes("signature"), false);
  }
  assert.throws(() => adapter.requirements({ ...route, price: { amount: 6, unit: "usd-micros" } }));
});

test("SDK settlement redirects are blocked before a second possible request", async t => {
  let calls = 0;
  const server = http.createServer((_req, res) => { calls++; res.writeHead(307, { location: "/second-possible-settlement" }); res.end(); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const client = new HTTPFacilitatorClient({ url: `http://127.0.0.1:${server.address().port}` });
  await assert.rejects(invokeFacilitator(client, "settle", { payload: { x402Version: 2, unsignedFixture: true }, requirements },
    AbortSignal.timeout(2000), { allowLoopback: true }));
  assert.equal(calls, 1);
});

test("SDK timeout terminates its isolated transport and closes the upstream socket", async t => {
  let entered = false, closed = false;
  const server = http.createServer((_req, res) => { entered = true; res.on("close", () => { closed = true; }); res.writeHead(200); res.write("{"); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const client = new HTTPFacilitatorClient({ url: `http://127.0.0.1:${server.address().port}` });
  const controller = new AbortController();
  const pending = invokeFacilitator(client, "settle", { payload: { x402Version: 2, unsignedFixture: true }, requirements }, controller.signal, { allowLoopback: true });
  const rejected = assert.rejects(pending);
  await until(() => entered); controller.abort(new Error("local timeout")); await rejected;
  await until(() => closed); assert.equal(closed, true);
});

test("SDK response cap prevents oversized facilitator data from entering receipts", async t => {
  const server = http.createServer((_req, res) => { res.writeHead(200); res.end("x".repeat(20000)); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const client = new HTTPFacilitatorClient({ url: `http://127.0.0.1:${server.address().port}` });
  await assert.rejects(invokeFacilitator(client, "verify", { payload: { x402Version: 2, unsignedFixture: true }, requirements }, AbortSignal.timeout(2000), { allowLoopback: true }));
});

test("authorization replay identity ignores header spelling, extensions and nonce/address case", () => {
  const unsigned = { network: "eip155:999999", asset: `0x${"ab".repeat(20)}`,
    authorization: { from: `0x${"cd".repeat(20)}`, nonce: `0x${"ef".repeat(32)}` } };
  const original = paymentAuthorizationIdentity(unsigned);
  const altered = { ...unsigned, asset: unsigned.asset.toUpperCase(), authorization: { ...unsigned.authorization,
    from: unsigned.authorization.from.toUpperCase(), nonce: unsigned.authorization.nonce.toUpperCase() }, unrelatedHeader: "changed" };
  assert.equal(paymentAuthorizationIdentity(altered), original);
  assert.notEqual(paymentAuthorizationIdentity({ ...unsigned, authorization: { ...unsigned.authorization, nonce: `0x${"ab".repeat(32)}` } }), original);
});

test("production constructor rejects unsigned fixture payment adapter", async t => {
  const f = await fixture(t);
  const { MachineGateway } = await import("../src/gateway.mjs");
  assert.throws(() => new MachineGateway({ store: f.store, registry: f.gateway.registry, tenants: tenantConfig(),
    environment: "production", paymentsEnabled: true, paymentAdapter: unsignedPaymentAdapter() }));
});
