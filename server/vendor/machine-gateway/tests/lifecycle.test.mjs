import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { fixture, echoRoute, delay, until, tenantConfig, TOKEN_A, unsignedPaymentAdapter, requirements } from "./helpers.mjs";

test("lost HTTP response recovers identical durable result after server restart", async t => {
  let calls = 0;
  const f = await fixture(t, { extraRoutes: [echoRoute({ id: "count.echo", run: input => { calls++; return input; } })] });
  const body = await f.quote({ value: "retained" }, "count.echo");
  const proxy = http.createServer((req, res) => {
    const upstream = http.request(`${f.origin}${f.gateway.prefix}/v1/execute`, { method: "POST", headers: req.headers }, reply => {
      reply.resume(); reply.once("end", () => res.destroy());
    });
    req.pipe(upstream); upstream.on("error", () => res.destroy());
  });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  t.after(() => { proxy.closeAllConnections(); proxy.close(); });
  await assert.rejects(fetch(`http://127.0.0.1:${proxy.address().port}`, { method: "POST", headers: {
    authorization: `Bearer ${TOKEN_A}`, "content-type": "application/json", "idempotency-key": "lost-http-response-01",
  }, body: JSON.stringify(body) }));
  assert.equal(calls, 1);
  const retained = f.store.db.prepare("SELECT body FROM attempts").get().body;
  await f.restart();
  const recovered = await f.execute(body, "lost-http-response-01");
  assert.equal(recovered.headers.get("idempotency-replayed"), "true");
  assert.deepEqual(recovered.body, JSON.parse(retained)); assert.equal(calls, 1);
});

test("disconnect aborts provider and retains the attempt; replay cannot execute it again", async t => {
  let aborted = 0, calls = 0;
  const f = await fixture(t, { extraRoutes: [echoRoute({ id: "abort.echo", run: (_input, { signal }) => new Promise((_, reject) => {
    calls++; signal.addEventListener("abort", () => { aborted++; reject(signal.reason); }, { once: true });
  }) })] });
  const body = await f.quote({ value: "x" }, "abort.echo");
  const controller = new AbortController();
  const pending = f.execute(body, "abort-http-response1", { signal: controller.signal }).catch(() => null);
  await until(() => calls === 1); controller.abort(); await pending;
  await until(() => aborted === 1);
  const recovered = await f.execute(body, "abort-http-response1");
  assert.equal(recovered.body.status, "failed"); assert.equal(recovered.body.error.code, "execution_aborted");
  assert.equal(calls, 1);
});

test("disconnect during settlement retains possible spend without late provider execution", async t => {
  let providerCalls = 0;
  const adapter = unsignedPaymentAdapter({ settle: () => delay(80) });
  const f = await fixture(t, { extraRoutes: [echoRoute({ id: "abort.paid", price: { amount: 5, unit: "usd-micros" }, paymentRequirements: requirements,
    run: input => { providerCalls++; return input; } })], gatewayOptions: { paymentAdapter: adapter, paymentsEnabled: true } });
  const body = await f.quote({ value: "x" }, "abort.paid"), controller = new AbortController();
  const pending = f.execute(body, "abort-paid-response1", { payment: "unsigned-local-fixture-abort1", signal: controller.signal }).catch(() => null);
  await until(() => adapter.calls.settle === 1); controller.abort(); await pending;
  await until(() => f.store.db.prepare("SELECT active FROM attempts").get().active === 0);
  const recovered = await f.execute(body, "abort-paid-response1", { payment: "unsigned-local-fixture-abort1" });
  assert.equal(recovered.body.status, "uncertain"); assert.equal(recovered.body.payment.state, "possible");
  await delay(100); assert.equal(providerCalls, 0); assert.equal(adapter.calls.settle, 1);
});

test("deadline stops uncooperative provider observation; late output is never persisted", async t => {
  const f = await fixture(t, { extraRoutes: [echoRoute({ id: "late.echo", timeoutMs: 20, run: async input => { await delay(80); return input; } })] });
  const body = await f.quote({ value: "late" }, "late.echo");
  const result = await f.execute(body, "deadline-echo-key-01");
  assert.equal(result.body.status, "uncertain"); assert.equal(result.body.output, null);
  await delay(100);
  assert.deepEqual((await f.request(`/v1/receipts/${result.body.id}`)).body, result.body);
});

test("quote expires, changed schema invalidates binding, and completed replay survives later expiry", async t => {
  let now = Date.now();
  const f = await fixture(t, { storeOptions: { now: () => now } });
  const expired = await f.quote(); now += 60001;
  assert.equal((await f.execute(expired, "expired-quote-key-01")).body.error.code, "quote_expired");
  const body = await f.quote();
  const result = await f.execute(body, "valid-before-expiry1");
  now += 60001;
  assert.deepEqual((await f.execute(body, "valid-before-expiry1")).body, result.body);
  const next = await f.quote();
  f.store.db.prepare("UPDATE quotes SET route_digest=? WHERE id=?").run("0".repeat(64), next.quoteId);
  assert.equal((await f.execute(next, "changed-schema-key01")).body.error.code, "quote_changed");
});

test("tenant call and concurrency budgets survive repeated requests without an extra execution", async t => {
  let release;
  const tenants = tenantConfig(["lockfile.delta", "http.capture", "fixture.echo", "held.echo"]); tenants[0].maxCalls = 1; tenants[0].maxConcurrent = 1;
  const f = await fixture(t, { extraRoutes: [echoRoute({ id: "held.echo", run: input => new Promise(resolve => { release = () => resolve(input); }) })], gatewayOptions: { tenants } });
  const one = await f.quote({ value: "one" }, "held.echo"), two = await f.quote();
  const pending = f.execute(one, "held-echo-key-00001"); await until(() => !!release);
  assert.equal((await f.execute(two, "exhausted-call-key01")).status, 429);
  release(); const first = await pending;
  await f.restart();
  assert.equal((await f.execute(await f.quote(), "restart-call-key-001")).status, 429);
  assert.deepEqual((await f.execute(one, "held-echo-key-00001")).body, first.body);
});

test("receipt and quote capacity fail closed and retain existing recovery records", async t => {
  const f = await fixture(t, { storeOptions: { maxReceipts: 1, maxQuotes: 1 } });
  const one = await f.quote();
  assert.equal((await f.request("/v1/quote", { body: { routeId: "fixture.echo", input: { value: "two" } } })).status, 503);
  const result = await f.execute(one, "capacity-echo-key-01");
  const two = await f.quote();
  assert.equal((await f.execute(two, "capacity-echo-key-02")).body.error.code, "receipt_capacity");
  assert.deepEqual((await f.execute(one, "capacity-echo-key-01")).body, result.body);
});

test("tenant concurrency limit rejects a second intent while allowing recovery of the admitted intent", async t => {
  let release;
  const tenants = tenantConfig(["lockfile.delta", "http.capture", "fixture.echo", "held.concurrent"]); tenants[0].maxConcurrent = 1;
  const f = await fixture(t, { extraRoutes: [echoRoute({ id: "held.concurrent", run: input => new Promise(resolve => { release = () => resolve(input); }) })], gatewayOptions: { tenants } });
  const one = await f.quote({ value: "one" }, "held.concurrent"), two = await f.quote();
  const pending = f.execute(one, "tenant-concurrent-01"); await until(() => !!release);
  assert.equal((await f.execute(two, "tenant-concurrent-02")).body.error.code, "concurrency_limit");
  assert.equal((await f.execute(one, "tenant-concurrent-01")).status, 202);
  release(); await pending;
  assert.equal((await f.execute(two, "tenant-concurrent-02")).body.status, "completed");
});
