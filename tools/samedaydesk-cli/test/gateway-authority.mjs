// Inert authority port for the machine-gateway tenant contract. It follows
// server/vendor/machine-gateway/src/{http,gateway,store}.mjs at the release
// head for the parts a caller observes: tenant bearer, tenant-bound quote,
// one execution per quote, Idempotency-Key replay by key and request digest,
// receipts readable by the same tenant, and error codes. It runs no provider,
// holds no money and proves client behavior only, never live funded
// execution. commits counts admitted executions (store.admit).
import { randomUUID } from "node:crypto";
import { digest, sha256 } from "../../../server/vendor/machine-gateway/src/util.mjs";
import { sendJson, startServer } from "./server-fixture.mjs";

export const PREFIX = "/api/machine-gateway";
export const TOKEN_A = "local_unsigned_tenant_a_credential_000001";
export const TOKEN_B = "local_unsigned_tenant_b_credential_000002";

const ROUTES = {
  "fixture.echo": { version: "1", price: { amount: 0, unit: "usd-micros" }, timeoutMs: 1000, run: async input => ({ value: input.value }) },
  "fixture.fail": { version: "1", price: { amount: 0, unit: "usd-micros" }, timeoutMs: 1000, run: async () => { throw Object.assign(new Error("x"), { code: "provider_failed" }); } },
  "fixture.paid": { version: "1", price: { amount: 5, unit: "usd-micros" }, timeoutMs: 1000, run: async () => ({ value: "paid" }),
    requirements: { scheme: "exact", network: "fixture-network", asset: "fixture-asset", amount: "5", payTo: "fixture-recipient", maxTimeoutSeconds: 30 } },
};
for (const [id, route] of Object.entries(ROUTES)) route.routeDigest = digest({ id, version: route.version, price: route.price });

export async function startAuthority({ now = () => Date.now() } = {}) {
  const tenants = new Map([[sha256(TOKEN_A), { id: "tenant-a", routes: Object.keys(ROUTES) }], [sha256(TOKEN_B), { id: "tenant-b", routes: Object.keys(ROUTES) }]]);
  const quotes = new Map();
  const attempts = new Map(); // `${tenant}:${idem}` -> { receipt, requestDigest }
  const receipts = new Map(); // id -> { tenant, receipt }
  const control = { commits: 0, loseNextExecuteResponse: false, holdExecute: null, executeRequests: 0, redirectTo: null };
  const fail = (res, status, code) => sendJson(res, status, { error: { code } });
  const auth = (req, optional = false) => {
    const header = req.headers.authorization;
    if (!header && optional) return null;
    if (typeof header !== "string" || !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(header)) return undefined;
    return tenants.get(sha256(header.slice(7)));
  };
  const server = await startServer(async (req, res, entry) => {
    if (control.redirectTo) { res.writeHead(307, { location: `${control.redirectTo}${req.url}` }); return res.end(); }
    if (!req.url.startsWith(`${PREFIX}/`)) return fail(res, 404, "route_not_found");
    const path = req.url.slice(PREFIX.length);
    let body = null;
    if (req.method === "POST") {
      if (!/^application\/json/.test(req.headers["content-type"] || "")) return fail(res, 415, "json_content_type_required");
      try { body = JSON.parse(entry.body); } catch { return fail(res, 400, "invalid_json"); }
    }
    if (path === "/v1/quote" && req.method === "POST") {
      const tenant = auth(req, true);
      if (tenant === undefined) return fail(res, 401, "unauthorized");
      const route = ROUTES[body?.routeId];
      if (!route) return fail(res, 404, "route_not_found");
      if (tenant && !tenant.routes.includes(body.routeId)) return fail(res, 403, "route_forbidden");
      if (typeof body.input !== "object" || body.input === null) return fail(res, 400, "request_schema_invalid");
      const inputDigest = digest(body.input);
      let quote = null;
      if (tenant) { quote = { id: randomUUID(), tenant: tenant.id, routeId: body.routeId, routeDigest: route.routeDigest, inputDigest, expires: now() + 60000, amount: route.price.amount }; quotes.set(quote.id, quote); }
      return sendJson(res, 200, { schema: "neomorphic.machine-gateway.quote.v1", quoteId: quote?.id ?? null, routeId: body.routeId, routeDigest: route.routeDigest, inputDigest,
        expiresAt: quote?.expires ?? now() + 60000, tenantBound: !!tenant, executable: !!tenant && route.price.amount === 0, price: route.price,
        requirements: route.price.amount ? null : null });
    }
    if (path === "/v1/execute" && req.method === "POST") {
      control.executeRequests += 1;
      const tenant = auth(req);
      if (!tenant) return fail(res, 401, "unauthorized");
      if (!body || Object.keys(body).some(key => !["quoteId", "input", "maxUnits"].includes(key)) || typeof body.quoteId !== "string" || typeof body.input !== "object" || !Number.isInteger(body.maxUnits)) return fail(res, 400, "request_schema_invalid");
      const key = req.headers["idempotency-key"];
      if (typeof key !== "string" || !/^[A-Za-z0-9_.-]{16,128}$/.test(key)) return fail(res, 400, "idempotency_key_required");
      const paymentHeader = req.headers["payment-signature"] || "";
      const requestDigest = digest({ ...body, paymentHeaderDigest: sha256(paymentHeader) });
      const slot = `${tenant.id}:${sha256(key)}`;
      const existing = attempts.get(slot);
      if (existing) {
        if (existing.requestDigest !== requestDigest) return fail(res, 409, "idempotency_conflict");
        return sendJson(res, existing.receipt.status === "running" ? 202 : 200, existing.receipt, { "idempotency-replayed": "true", location: existing.receipt.readbackPath });
      }
      const quote = quotes.get(body.quoteId);
      if (!quote || quote.tenant !== tenant.id) return fail(res, 404, "quote_not_found");
      const route = ROUTES[quote.routeId];
      if (route.price.amount) return fail(res, 503, "payments_disabled");
      if (paymentHeader) return fail(res, 400, "payment_on_free_route");
      if ([...attempts.values()].some(attempt => attempt.receipt.quoteId === quote.id)) return fail(res, 409, "quote_already_used");
      if (quote.expires <= now()) return fail(res, 409, "quote_expired");
      if (quote.inputDigest !== digest(body.input)) return fail(res, 409, "quote_changed");
      if (quote.amount > body.maxUnits) return fail(res, 409, "request_budget_exceeded");
      const id = randomUUID();
      const receipt = { schema: "neomorphic.machine-gateway.receipt.v1", id, quoteId: quote.id, routeId: quote.routeId, routeVersion: route.version, requestDigest,
        inputDigest: quote.inputDigest, createdAt: now(), deadlineAt: now() + route.timeoutMs, completedAt: null, status: "running", price: route.price,
        payment: { state: "not_required", adapter: null, evidence: "none", reference: null, network: null }, output: null, error: null, readbackPath: `${PREFIX}/v1/receipts/${id}` };
      attempts.set(slot, { receipt, requestDigest });
      receipts.set(id, { tenant: tenant.id, receipt });
      control.commits += 1;
      control.onAdmit?.();
      if (control.holdExecute) await control.holdExecute;
      try { receipt.output = await route.run(body.input); receipt.status = "completed"; }
      catch (error) { receipt.error = { code: error.code ?? "provider_failed" }; receipt.status = "failed"; }
      receipt.completedAt = now();
      if (control.loseNextExecuteResponse) { control.loseNextExecuteResponse = false; req.socket.destroy(); return; }
      return sendJson(res, 200, receipt, { "idempotency-replayed": "false", location: receipt.readbackPath });
    }
    const match = /^\/v1\/receipts\/([a-f0-9-]{36})$/.exec(path);
    if (match && req.method === "GET") {
      const tenant = auth(req);
      if (!tenant) return fail(res, 401, "unauthorized");
      const found = receipts.get(match[1]);
      if (!found || found.tenant !== tenant.id) return fail(res, 404, "receipt_not_found");
      return sendJson(res, 200, found.receipt);
    }
    return fail(res, 404, "route_not_found");
  });
  return { ...server, control, attempts, receipts, quotes, close: server.close };
}
