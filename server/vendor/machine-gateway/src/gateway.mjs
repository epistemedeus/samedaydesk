import { validate } from "./schemas.mjs";
import { abortable, digest, sha256 } from "./util.mjs";
import { GatewayError, fail } from "./errors.mjs";

export class MachineGateway {
  constructor({ store, registry, tenants, prefix = "/api/machine-gateway", paymentAdapter = null, paymentsEnabled = false, environment = "production" }) {
    validate("tenantConfig", { tenants });
    if (!store || !registry || !/^\/(?:[a-z0-9-]+\/?)+$/.test(prefix) || prefix.endsWith("/") || prefix.length > 100) throw new Error("invalid gateway configuration");
    if (paymentsEnabled && (!paymentAdapter || (environment !== "test" && paymentAdapter.kind !== "existing-facilitator"))) throw new Error("existing payment adapter required");
    const ids = new Set(), tokens = new Set();
    for (const t of tenants) {
      if (ids.has(t.id) || tokens.has(t.tokenSha256)) throw new Error("duplicate tenant authority");
      ids.add(t.id); tokens.add(t.tokenSha256);
      for (const route of t.routes) registry.get(route);
    }
    this.store = store;
    this.registry = registry;
    this.tenants = new Map(structuredClone(tenants).map(t => [t.tokenSha256, Object.freeze(t)]));
    this.prefix = prefix;
    this.adapter = paymentAdapter;
    this.paymentsEnabled = paymentsEnabled;
    for (const route of registry.list()) if (paymentsEnabled && route.price.amount) paymentAdapter.requirements(route);
  }
  authenticate(header, optional = false) {
    if (!header && optional) return null;
    if (typeof header !== "string" || !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(header)) fail("unauthorized", 401);
    const tenant = this.tenants.get(sha256(header.slice(7)));
    if (!tenant) fail("unauthorized", 401);
    return tenant;
  }
  allow(tenant, routeId) { if (!tenant.routes.includes(routeId)) fail("route_forbidden", 403); }
  health() {
    if (!this.store.ready()) fail("store_unavailable", 503);
    return validate("health", { schema: "neomorphic.machine-gateway.health.v1", ready: true,
      runtime: "mounted-node", persistence: "sqlite-wal", paymentsEnabled: this.paymentsEnabled, routeCount: this.registry.list().length }, { response: true });
  }
  quote(body, tenant = null) {
    validate("quoteRequest", body);
    const route = this.registry.get(body.routeId);
    if (tenant) this.allow(tenant, route.id);
    this.registry.input(route, body.input);
    const inputDigest = digest(body.input);
    const quote = tenant ? this.store.quote({ tenant: tenant.id, route, inputDigest }) : null;
    return validate("quote", {
      schema: "neomorphic.machine-gateway.quote.v1", quoteId: quote?.id ?? null, routeId: route.id,
      routeDigest: route.routeDigest, inputDigest, expiresAt: quote?.expires ?? this.store.now() + 60000,
      tenantBound: !!tenant, executable: !!tenant && (route.price.amount === 0 || this.paymentsEnabled),
      price: route.price, requirements: route.price.amount && this.paymentsEnabled ? this.adapter.requirements(route) : null,
    }, { response: true });
  }
  async test(body, signal = AbortSignal.timeout(5000)) {
    validate("testRequest", body);
    const route = this.registry.get(body.routeId);
    const output = this.registry.output(route, await abortable(() => route.test(), signal));
    return validate("test", { schema: "neomorphic.machine-gateway.test.v1", routeId: route.id,
      fixture: true, paymentAttempts: 0, output }, { response: true });
  }
  async execute(body, { tenant, idempotencyKey, paymentHeader = "", signal: callerSignal } = {}) {
    if (!tenant) fail("unauthorized", 401);
    validate("executeRequest", body);
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_.-]{16,128}$/.test(idempotencyKey)) fail("idempotency_key_required");
    if (typeof paymentHeader !== "string" || paymentHeader.length > 16384) fail("invalid_payment");
    const idem = sha256(idempotencyKey);
    const requestDigest = digest({ ...body, paymentHeaderDigest: sha256(paymentHeader) });
    // Recovery remains available after quote expiry and provider redeployment.
    const replay = this.store.replay(tenant.id, idem, requestDigest);
    if (replay) { this.allow(tenant, replay.routeId); return { receipt: replay, replay: true }; }
    const quote = this.store.getQuote(tenant.id, body.quoteId);
    this.allow(tenant, quote.route_id);
    const route = this.registry.get(quote.route_id);
    this.registry.input(route, body.input);
    let prepared;
    if (route.price.amount) {
      if (!this.paymentsEnabled) fail("payments_disabled", 503);
      prepared = this.adapter.prepare(paymentHeader, route);
      if (!prepared || !/^[a-f0-9]{64}$/.test(prepared.identity)) fail("invalid_payment");
    } else if (paymentHeader) fail("payment_on_free_route");
    callerSignal?.throwIfAborted();
    const admission = this.store.admit({ tenant, idem, requestDigest, quoteId: body.quoteId,
      inputDigest: digest(body.input), route, maxUnits: body.maxUnits, paymentIdentity: prepared?.identity, prefix: this.prefix });
    if (!admission.owner) return { receipt: admission.receipt, replay: true };
    const receiptId = admission.receipt.id;
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new GatewayError("deadline_exceeded", 504)), Math.max(1, admission.receipt.deadlineAt - this.store.now()));
    const signal = callerSignal ? AbortSignal.any([callerSignal, deadline.signal]) : deadline.signal;
    try {
      if (prepared) {
        await abortable(() => this.adapter.verify(prepared, { signal }), signal);
        signal.throwIfAborted();
        // No adapter can be entered twice for this quote/credential, including
        // when the reply is lost or the process dies immediately after commit.
        this.store.possiblePayment(receiptId, this.adapter.kind, this.adapter.evidence, prepared.identity);
        const payment = await abortable(() => this.adapter.settle(prepared, { signal }), signal);
        signal.throwIfAborted();
        this.store.settled(receiptId, payment);
      }
      const output = this.registry.output(route, await abortable(() => route.run(body.input, { signal, receiptId }), signal));
      signal.throwIfAborted();
      return { receipt: this.store.finish(receiptId, { output }), replay: false };
    } catch (error) {
      const code = signal.aborted ? (deadline.signal.aborted ? "deadline_exceeded" : "execution_aborted")
        : error instanceof GatewayError ? error.code : "provider_failed";
      return { receipt: this.store.finish(receiptId, { error: { code }, declined: code === "payment_declined" }), replay: false };
    } finally { clearTimeout(timer); }
  }
}
