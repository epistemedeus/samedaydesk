import test from "node:test";
import assert from "node:assert/strict";
import { fixture, sampleInput, TOKEN_A, TOKEN_B, tenantConfig, echoRoute } from "./helpers.mjs";
import { RouteRegistry, MachineGateway } from "../src/index.mjs";
import { validate } from "../src/schemas.mjs";

test("mounted discovery, strict schema links, free anonymous quote and test", async t => {
  const f = await fixture(t);
  const health = await f.request("/healthz", { token: null });
  assert.equal(health.status, 200); assert.equal(health.body.runtime, "mounted-node");
  const discovery = await f.request("/v1/discover", { token: null });
  validate("discovery", discovery.body, { response: true });
  assert.equal(discovery.body.paymentsEnabled, false);
  for (const route of discovery.body.routes) {
    const schema = await fetch(`${f.origin}${route.inputSchemaPath}`).then(r => r.json());
    assert.equal(schema.additionalProperties, false);
    const result = await f.request("/v1/test", { body: { routeId: route.id }, token: null });
    assert.equal(result.status, 200); assert.equal(result.body.fixture, true); assert.equal(result.body.paymentAttempts, 0);
  }
  const quote = await f.request("/v1/quote", { body: { routeId: "lockfile.delta", input: sampleInput }, token: null });
  assert.equal(quote.status, 200); assert.equal(quote.body.quoteId, null); assert.equal(quote.body.executable, false);
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM attempts").get().n, 0);
});

test("real accepted lockfile engine executes in worker and receipt reads back", async t => {
  const f = await fixture(t);
  const body = await f.quote(sampleInput, "lockfile.delta");
  const result = await f.execute(body);
  assert.equal(result.status, 200); assert.equal(result.body.status, "completed");
  assert.equal(result.body.output.counts.changed, 1);
  assert.deepEqual(result.body.output.changed[0].changeKinds, ["version", "integrity"]);
  assert.equal(result.body.payment.state, "not_required");
  const read = await fetch(`${f.origin}${result.body.readbackPath}`, { headers: { authorization: `Bearer ${TOKEN_A}` } }).then(r => r.json());
  assert.deepEqual(read, result.body);
});

test("request schemas reject unknown fields, complexity, limit escalation and malformed input before execution", async t => {
  const f = await fixture(t);
  for (const body of [
    { routeId: "fixture.echo", input: { value: "x", tenantId: "tenant-b" } },
    { routeId: "fixture.echo", input: { value: "x" }, tenant: "tenant-b" },
    { routeId: "fixture.echo", input: { value: 1 } },
    { routeId: "lockfile.delta", input: { before: "<html>bad</html>", after: sampleInput.after } },
    { routeId: "lockfile.delta", input: { ...sampleInput, timeoutMs: 99999 } },
  ]) assert.equal((await f.request("/v1/quote", { body })).status, 400);
  const body = await f.quote();
  assert.equal((await f.execute({ ...body, tenant: "tenant-b" })).status, 400);
  assert.equal((await f.execute(body, "short")).status, 400);
  assert.equal((await f.execute(body, "well-formed-key-0001", { payment: "unsigned-local-fixture-a" })).status, 400);
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM attempts").get().n, 0);
});

test("strict response schema and output limit reject provider results with retained receipt", async t => {
  const f = await fixture(t, { extraRoutes: [echoRoute({ id: "bad.output", run: () => ({ value: "x", privateKey: "must-not-leak" }) }),
    echoRoute({ id: "huge.output", run: () => ({ value: "x".repeat(5000) }) })] });
  for (const routeId of ["bad.output", "huge.output"]) {
    const body = await f.quote({ value: "x" }, routeId);
    const result = await f.execute(body, `bad-output-${routeId}`);
    assert.equal(result.body.status, "failed"); assert.equal(result.body.output, null);
    assert.equal(JSON.stringify(result.body).includes("must-not-leak"), false);
    assert.match(result.body.error.code, /^response_/);
  }
});

test("tenant identity comes only from credential; cross-tenant quote, receipt, scoped route and replay are denied", async t => {
  const tenants = tenantConfig(); tenants[1].routes = ["lockfile.delta"];
  const f = await fixture(t, { gatewayOptions: { tenants } });
  const body = await f.quote();
  assert.equal((await f.execute(body, "cross-tenant-key-0001", { token: TOKEN_B })).status, 404);
  const result = await f.execute(body);
  assert.equal((await f.request(`/v1/receipts/${result.body.id}`, { token: TOKEN_B })).status, 404);
  assert.equal((await f.request("/v1/quote", { body: { routeId: "fixture.echo", input: { value: "x" } }, token: TOKEN_B })).status, 403);
  for (const token of [null, "invalid_credential_0000000000000000"]) assert.equal((await f.execute(body, "invalid-tenant-key-001", { token })).status, 401);
});

test("registry rejects duplicate IDs, open schemas, wrong budget units and duplicated tenant authority", async t => {
  assert.throws(() => new RouteRegistry([echoRoute(), echoRoute()]));
  assert.throws(() => new RouteRegistry([echoRoute({ inputSchema: { type: "object" } })]));
  assert.throws(() => new RouteRegistry([echoRoute({ price: { amount: 1, unit: "other" } })]));
  const f = await fixture(t);
  const tenants = tenantConfig(); tenants[1].tokenSha256 = tenants[0].tokenSha256;
  assert.throws(() => new MachineGateway({ store: f.store, registry: f.gateway.registry, tenants }));
});

test("HTTP failures are bounded JSON without provider error reflection or Host-derived links", async t => {
  const f = await fixture(t, { extraRoutes: [echoRoute({ id: "throw.output", run: () => { throw new Error("private-key-secret"); } })] });
  for (const [path, method, status] of [["/v1/discover", "POST", 405], ["/v1/execute", "GET", 405], ["/unknown", "GET", 404], ["/v1/discover?tenant=x", "GET", 400]]) {
    const result = await f.request(path, { method }); assert.equal(result.status, status); validate("error", result.body);
  }
  const body = await f.quote({ value: "x" }, "throw.output");
  const result = await f.execute(body, "throw-provider-00001", { headers: { host: "attacker.invalid", "x-forwarded-host": "attacker.invalid" } });
  assert.equal(result.body.error.code, "provider_failed");
  assert.equal(JSON.stringify(result.body).includes("secret"), false);
  assert.match(result.body.readbackPath, /^\/api\/machine-gateway\/v1\/receipts\//);
});
