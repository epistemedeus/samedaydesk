import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { SqliteStore, RouteRegistry, MachineGateway, builtinRoutes, createGatewayServer } from "../src/index.mjs";
import { sha256 } from "../src/util.mjs";
import { object, text } from "../src/schemas.mjs";
import { sampleInput } from "../src/providers.mjs";
import { GatewayError } from "../src/errors.mjs";

export { sampleInput };
export const TOKEN_A = "local_unsigned_tenant_a_credential_000001";
export const TOKEN_B = "local_unsigned_tenant_b_credential_000002";
export const tokenHeaders = (token = TOKEN_A) => ({ authorization: `Bearer ${token}` });
export const tenantConfig = (routes = ["lockfile.delta", "http.capture", "fixture.echo"]) => [
  { id: "tenant-a", tokenSha256: sha256(TOKEN_A), routes, maxUnits: 100, maxCalls: 1000, maxConcurrent: 4 },
  { id: "tenant-b", tokenSha256: sha256(TOKEN_B), routes, maxUnits: 100, maxCalls: 1000, maxConcurrent: 4 },
];
export const requirements = { scheme: "exact", network: "fixture-network", asset: "fixture-asset", amount: "5", payTo: "fixture-recipient", maxTimeoutSeconds: 30 };
export function echoRoute(overrides = {}) {
  return { id: "fixture.echo", version: "1", provider: "unsigned-local-fixture", description: "Local test handler",
    price: { amount: 0, unit: "usd-micros" }, timeoutMs: 1000, maxOutputBytes: 4096,
    inputSchema: object({ value: text(128) }), outputSchema: object({ value: text(128) }),
    run: async input => ({ value: input.value }), test: () => ({ value: "fixture" }), ...overrides };
}
export function unsignedPaymentAdapter({ verify, settle } = {}) {
  const calls = { verify: 0, settle: 0 };
  return {
    kind: "unsigned-fixture", evidence: "unsigned_fixture", calls,
    requirements: () => requirements,
    prepare(header) {
      if (!/^unsigned-local-fixture-[a-z0-9]+$/.test(header)) throw new GatewayError("payment_required", 402);
      return { identity: sha256(header) };
    },
    async verify(prepared, context) { calls.verify++; await verify?.(prepared, context); },
    async settle(prepared, context) {
      calls.settle++;
      return await settle?.(prepared, context) || { state: "settled", adapter: "unsigned-fixture", evidence: "unsigned_fixture", reference: "not-a-transaction", network: "fixture-network" };
    },
  };
}
export async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "machine-gateway-test-"));
  const file = join(dir, "machine-gateway.sqlite");
  const registry = options.registry || new RouteRegistry([...builtinRoutes(), echoRoute(), ...(options.extraRoutes || [])]);
  let store = new SqliteStore(file, options.storeOptions);
  let gateway, server, origin;
  const start = async () => {
    gateway = new MachineGateway({ store, registry, tenants: tenantConfig(registry.list().map(r => r.id)), environment: "test", ...options.gatewayOptions });
    server = createGatewayServer(gateway, options.httpOptions);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  await start();
  const f = {
    dir, file, get store() { return store; }, get gateway() { return gateway; }, get server() { return server; }, get origin() { return origin; },
    async request(path, { body, token = TOKEN_A, headers = {}, method, ...init } = {}) {
      const response = await fetch(`${origin}${gateway.prefix}${path}`, {
        ...init, method: method || (body !== undefined ? "POST" : "GET"),
        headers: { ...(token ? tokenHeaders(token) : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, headers: response.headers, body: await response.json() };
    },
    async quote(input = { value: "actual" }, routeId = "fixture.echo", token = TOKEN_A) {
      const result = await f.request("/v1/quote", { body: { routeId, input }, token });
      if (result.status !== 200) throw new Error(`quote failed: ${JSON.stringify(result.body)}`);
      return { quoteId: result.body.quoteId, input, maxUnits: 100 };
    },
    execute(body, key = "local-idempotency-00001", opts = {}) {
      return f.request("/v1/execute", { body, headers: { "idempotency-key": key, ...(opts.payment ? { "payment-signature": opts.payment } : {}), ...opts.headers }, ...Object.fromEntries(Object.entries(opts).filter(([key]) => !["payment", "headers"].includes(key))) });
    },
    async stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); },
    async restart() { await f.stop(); store = new SqliteStore(file, options.storeOptions); await start(); },
  };
  t.after(async () => { await f.stop(); await rm(dir, { recursive: true, force: true }); });
  return f;
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function until(check, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (!await check()) { if (Date.now() > deadline) throw new Error("condition timed out"); await delay(10); }
}
