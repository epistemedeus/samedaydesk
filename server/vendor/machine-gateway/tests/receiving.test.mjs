import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { existingFacilitatorAdapter } from "../src/payments.mjs";
import { fixture, echoRoute } from "./helpers.mjs";
import { execFile } from "./process-helpers.mjs";

test("persisted deadline fences provider entry even before the event loop runs its timer", async t => {
  let now = Date.now(), calls = 0;
  const f = await fixture(t, { storeOptions: { now: () => now }, extraRoutes: [echoRoute({
    id: "deadline.entry", run: input => { calls++; return input; },
  })] });
  const admit = f.store.admit.bind(f.store);
  f.store.admit = input => {
    const admitted = admit(input);
    // The FULL-WAL commit may take longer than the route's deadline. The
    // persisted clock, rather than a pending JS timer, is the authority.
    now = admitted.receipt.deadlineAt;
    return admitted;
  };
  const body = await f.quote({ value: "must not dispatch" }, "deadline.entry");
  const reply = await f.execute(body, "receiving-deadline-entry");
  assert.equal(calls, 0);
  assert.equal(reply.body.status, "uncertain");
  assert.equal(reply.body.output, null);
  assert.deepEqual((await f.execute(body, "receiving-deadline-entry")).body, reply.body);
});

test("enrolled SDK response headers cannot print upstream payloads into the host output", async t => {
  const sentinel = "private_upstream_extension_reason_fixture";
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", "extension-responses":
      Buffer.from(JSON.stringify({ fixture: { reason: sentinel } })).toString("base64") });
    res.end(JSON.stringify({ isValid: true }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const child = await execFile(process.execPath, [fileURLToPath(new URL("./sdk-output-fixture.mjs", import.meta.url)),
    `http://127.0.0.1:${server.address().port}`]);
  assert.equal(child.stdout.includes(sentinel), false);
  assert.equal(child.stderr.includes(sentinel), false);
  assert.deepEqual(JSON.parse(child.stdout), { isValid: true });
});

test("a compressed SDK settlement reply is bounded after decoding and cannot authorize another payment", async t => {
  const network = "eip155:999999", asset = `0x${"1".repeat(40)}`, payTo = `0x${"2".repeat(40)}`;
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(req.url); req.resume();
    if (req.url === "/verify") { res.setHeader("content-type", "application/json"); return res.end('{"isValid":true}'); }
    res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
    res.end(gzipSync(JSON.stringify({ success: true, transaction: `0x${"0".repeat(64)}`, network,
      extra: { unsignedFixture: "x".repeat(1048576) } })));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const adapter = existingFacilitatorAdapter({ client: new HTTPFacilitatorClient({ url: `http://127.0.0.1:${server.address().port}` }),
    budgetUnit: "usd-micros", network, asset, payTo, allowLoopback: true });
  const requirements = { scheme: "exact", network, asset, amount: "5", payTo, maxTimeoutSeconds: 30 };
  const f = await fixture(t, { extraRoutes: [echoRoute({ id: "sdk.bounded", price: { amount: 5, unit: "usd-micros" },
    paymentRequirements: requirements, timeoutMs: 3000 })], gatewayOptions: { paymentAdapter: adapter, paymentsEnabled: true } });
  // Structurally valid, explicitly unsigned local fixture. No signer or funded rail.
  const payment = Buffer.from(JSON.stringify({ x402Version: 2, accepted: requirements, payload: {
    signature: `0x${"0".repeat(130)}`, authorization: { from: `0x${"3".repeat(40)}`, to: payTo,
      value: "5", validAfter: "0", validBefore: "9999999999", nonce: `0x${"4".repeat(64)}` },
  } })).toString("base64");
  const body = await f.quote({ value: "never reached" }, "sdk.bounded");
  const result = await f.execute(body, "compressed-settlement-key", { payment });
  assert.equal(result.body.status, "uncertain");
  assert.equal(result.body.payment.state, "possible");
  assert.equal(result.body.output, null);
  await f.restart();
  assert.deepEqual((await f.execute(body, "compressed-settlement-key", { payment })).body, result.body);
  assert.equal((await f.execute(await f.quote({ value: "never reached" }, "sdk.bounded"), "compressed-new-intent", { payment })).body.error.code, "payment_reused");
  assert.deepEqual(calls, ["/verify", "/settle"]);
  assert.equal(f.store.db.prepare("SELECT units FROM usage").get().units, 5);
});
