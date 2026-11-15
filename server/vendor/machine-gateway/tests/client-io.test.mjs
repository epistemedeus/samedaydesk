// Dependency-free: node --test tests/client-io.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { request, receiptRecovery, GatewayRequestError, RECOVERY } from "../bin/client-io.mjs";

const TOKEN = "local_unsigned_tenant_a_credential_000001";
const KEY = "client-io-key-000000000001";

async function serve(t, handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => { seen.push({ method: req.method, url: req.url, body, headers: req.headers }); handler(req, res, seen); });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { base: `http://127.0.0.1:${server.address().port}/api/machine-gateway`, seen };
}
const json = (res, status, value, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(value)); };
const rejectsWith = async (promise, fields) => {
  const error = await promise.then(() => assert.fail("expected rejection"), e => e);
  assert.ok(error instanceof GatewayRequestError, String(error));
  for (const [k, v] of Object.entries(fields)) assert.deepEqual(error[k], v, k);
  return error;
};

test("a successful GET returns the parsed body unchanged", async t => {
  const { base } = await serve(t, (req, res) => json(res, 200, { ready: true }));
  assert.deepEqual(await request(base, "/healthz"), { ready: true });
});

test("a gateway error keeps the legacy message and passes the server code through", async t => {
  const { base } = await serve(t, (req, res) => json(res, 409, { error: { code: "idempotency_conflict" } }));
  const error = await rejectsWith(request(base, "/v1/execute", { token: TOKEN, body: { a: 1 }, key: KEY }),
    { message: "gateway_http_409", code: "idempotency_conflict", serverCode: "idempotency_conflict", status: 409, recovery: "remote_refused" });
  assert.equal(error.operation.idempotencyKey, KEY);
  assert.equal(error.operation.method, "POST");
});

test("unknown future server codes pass through; market envelopes are read too", async t => {
  const { base } = await serve(t, (req, res) => req.url.endsWith("/market")
    ? json(res, 400, { ok: false, code: "cursor_refused" })
    : json(res, 422, { error: { code: "future_code_not_in_this_client" } }));
  await rejectsWith(request(base, "/v1/x"), { code: "future_code_not_in_this_client", serverCode: "future_code_not_in_this_client", recovery: "remote_refused" });
  await rejectsWith(request(base, "/market"), { code: "cursor_refused", serverCode: "cursor_refused", status: 400 });
});

test("a server code outside the code grammar is not trusted", async t => {
  const { base } = await serve(t, (req, res) => json(res, 400, { error: { code: `Bearer ${TOKEN}` } }));
  const error = await rejectsWith(request(base, "/v1/x", { token: TOKEN }), { code: "gateway_http_400", serverCode: null });
  assert.equal(JSON.stringify(error).includes(TOKEN), false);
});

test("diagnostics never carry the credential, request body or response text", async t => {
  const secretInput = "caller-input-should-not-leak";
  const { base } = await serve(t, (req, res) => json(res, 400, { error: { code: "invalid_input" }, echo: secretInput }));
  const error = await rejectsWith(request(base, "/v1/quote", { token: TOKEN, body: { input: secretInput } }), { code: "invalid_input" });
  const text = JSON.stringify(error) + JSON.stringify(error.diagnostics) + error.stack;
  for (const secret of [TOKEN, secretInput]) assert.equal(text.includes(secret), false, secret);
  assert.match(error.diagnostics.bodySha256, /^[a-f0-9]{64}$/);
});

test("non-JSON and 5xx answers are sent_unconfirmed; 499 execution_aborted is a confirmed remote cancellation", async t => {
  const { base } = await serve(t, (req, res) => {
    if (req.url.endsWith("/html")) { res.writeHead(404, { "content-type": "text/html" }); return res.end("<pre>Cannot GET</pre>"); }
    if (req.url.endsWith("/busy")) return json(res, 503, { error: { code: "service_unavailable" } });
    return json(res, 499, { error: { code: "execution_aborted" } });
  });
  await rejectsWith(request(base, "/html"), { message: "gateway_http_404", code: "gateway_http_404", recovery: "sent_unconfirmed" });
  await rejectsWith(request(base, "/busy", { body: {}, key: KEY }), { code: "service_unavailable", recovery: "sent_unconfirmed" });
  await rejectsWith(request(base, "/cancel", { body: {}, key: KEY }), { code: "execution_aborted", recovery: "remote_cancelled" });
});

test("an already aborted signal sends nothing", async t => {
  const { base, seen } = await serve(t, (req, res) => json(res, 200, {}));
  const controller = new AbortController(); controller.abort();
  await rejectsWith(request(base, "/v1/execute", { body: {}, key: KEY, signal: controller.signal }), { code: "request_aborted", recovery: "not_sent" });
  assert.equal(seen.length, 0);
});

test("the recovery record is persisted before dispatch; a failed save sends nothing", async t => {
  const { base, seen } = await serve(t, (req, res) => json(res, 200, { id: "r1" }));
  const order = [];
  await request(base, "/v1/execute", { body: { a: 1 }, key: KEY, beforeDispatch: record => {
    order.push(["saved", seen.length, record.recovery, record.idempotencyKeySha256.length]);
  } });
  assert.deepEqual(order, [["saved", 0, "sent_unconfirmed", 64]]);
  assert.equal(seen.length, 1);
  await rejectsWith(request(base, "/v1/execute", { body: { a: 1 }, key: KEY, beforeDispatch: () => { throw new Error("ENOSPC"); } }),
    { code: "recovery_record_unsaved", recovery: "not_sent" });
  assert.equal(seen.length, 1);
});

test("a local abort after dispatch is sent_unconfirmed, keeps the operation identity, and is not retried", async t => {
  const { base, seen } = await serve(t, () => { /* hold the request open */ });
  const controller = new AbortController();
  const pending = request(base, "/v1/execute", { body: { a: 1 }, key: KEY, signal: controller.signal });
  while (seen.length === 0) await new Promise(resolve => setTimeout(resolve, 5));
  controller.abort();
  const error = await rejectsWith(pending, { code: "request_aborted", recovery: "sent_unconfirmed" });
  assert.equal(error.operation.idempotencyKey, KEY);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(seen.length, 1);
});

test("a timeout is request_timeout and distinct from a caller abort", async t => {
  const { base } = await serve(t, () => {});
  await rejectsWith(request(base, "/healthz", { timeoutMs: 50 }), { code: "request_timeout", recovery: "sent_unconfirmed" });
});

test("a refused connection is not_sent", async () => {
  const probe = http.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port; probe.close(); await once(probe, "close");
  const closed = `http://127.0.0.1:${port}/api/machine-gateway`;
  await rejectsWith(request(closed, "/v1/execute", { body: {}, key: KEY, timeoutMs: 2000 }), { code: "transport_failed", recovery: "not_sent" });
});

test("a 2xx whose body is lost is remote_committed: the server holds the operation", async t => {
  const { base } = await serve(t, (req, res) => {
    res.writeHead(200, { "content-type": "application/json", "content-length": "500" });
    res.write('{"id":"'); setTimeout(() => res.socket.destroy(), 20);
  });
  await rejectsWith(request(base, "/v1/execute", { body: {}, key: KEY }), { code: "response_interrupted", status: 200, recovery: "remote_committed" });
});

test("an oversized response keeps the legacy message", async t => {
  const { base } = await serve(t, (req, res) => json(res, 200, { pad: "x".repeat(2048) }));
  await rejectsWith(request(base, "/healthz", { maxBytes: 1024 }), { message: "gateway_response_too_large", recovery: "remote_committed" });
});

test("receipt recovery classes", () => {
  assert.deepEqual(RECOVERY, ["not_sent", "sent_unconfirmed", "remote_refused", "remote_committed", "remote_cancelled"]);
  assert.equal(receiptRecovery({ status: "completed" }), "remote_committed");
  assert.equal(receiptRecovery({ status: "running" }), "remote_committed");
  assert.equal(receiptRecovery({ status: "failed", error: { code: "provider_failed" } }), "remote_committed");
  assert.equal(receiptRecovery({ status: "failed", error: { code: "execution_aborted" } }), "remote_cancelled");
});
