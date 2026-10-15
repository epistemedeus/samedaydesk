// Postgres port of the pinned SqliteStore admission and receipt protocol.
// The service lock serializes finite DB transitions across replicas; no IO runs in a transaction.
import { randomUUID } from "node:crypto";
import { fail } from "./errors.mjs";
import { validate } from "./schemas.mjs";

export class PostgresGatewayStore {
  constructor(port, { now = Date.now, maxReceipts = 10000, maxQuotes = 2000, maxConcurrent = 4 } = {}) {
    this.port = port; this.kind = "postgres"; this.now = now;
    Object.assign(this, { maxReceipts, maxQuotes, maxConcurrent });
  }
  transaction(fn) { return this.port.tx(fn); }
  one(sql, ...args) { return this.port.one(sql, ...args); }
  all(sql, ...args) { return this.port.all(sql, ...args); }
  write(sql, ...args) { return this.port.write(sql, ...args); }
  async ready() { await this.port.checkReady(); return true; }
  close() { return this.port.close(); }
  async quote({ tenant, route, inputDigest, ttlMs = 60000 }) {
    return this.transaction(async () => {
      const now = this.now();
      (await this.write("DELETE FROM quotes WHERE expires < ? AND NOT EXISTS (SELECT 1 FROM attempts WHERE quote_id=quotes.id)", now));
      if ((await this.one("SELECT count(*) AS n FROM quotes WHERE NOT EXISTS (SELECT 1 FROM attempts WHERE quote_id=quotes.id)")).n >= this.maxQuotes) fail("quote_capacity", 503);
      const quote = { id: randomUUID(), tenant, route_id: route.id, route_digest: route.routeDigest,
        input_digest: inputDigest, expires: now + ttlMs, amount: route.price.amount, unit: route.price.unit, version: route.version };
      (await this.write("INSERT INTO quotes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", ...Object.values(quote)));
      return quote;
    });
  }
  async getQuote(tenant, id) {
    const quote = (await this.one("SELECT * FROM quotes WHERE id=? AND tenant=?", id, tenant));
    if (!quote) fail("quote_not_found", 404);
    return quote;
  }
  #body(row) { return validate("receipt", JSON.parse(row.body), { response: true }); }
  async #save(row, body, { active = row.active, reservation = row.reservation } = {}) {
    validate("receipt", body, { response: true });
    (await this.write("UPDATE attempts SET body=?, active=?, reservation=? WHERE id=?", JSON.stringify(body), active, reservation, row.id));
  }
  async #release(row) {
    if (row.reservation) (await this.write("UPDATE usage SET units=units-? WHERE tenant=?", row.reservation, row.tenant));
  }
  async #expire() {
    for (const row of (await this.all("SELECT * FROM attempts WHERE active=1 AND deadline<=?", this.now()))) {
      const body = this.#body(row);
      body.status = "uncertain";
      body.completedAt = this.now();
      body.error = { code: "execution_interrupted" };
      // No payment can start past deadline. Possible spend is never refunded.
      if (!row.possible) await this.#release(row);
      await this.#save(row, body, { active: 0, reservation: row.possible ? row.reservation : 0 });
    }
  }
  async replay(tenant, idem, requestDigest) {
    return this.transaction(async () => {
      await this.#expire();
      const row = (await this.one("SELECT * FROM attempts WHERE tenant=? AND idem=?", tenant, idem));
      if (!row) return null;
      if (row.request_digest !== requestDigest) fail("idempotency_conflict", 409);
      return this.#body(row);
    });
  }
  async admit({ tenant, idem, requestDigest, quoteId, inputDigest, route, maxUnits, paymentIdentity, prefix }) {
    return this.transaction(async () => {
      await this.#expire();
      const existing = (await this.one("SELECT * FROM attempts WHERE tenant=? AND idem=?", tenant.id, idem));
      if (existing) {
        if (existing.request_digest !== requestDigest) fail("idempotency_conflict", 409);
        return { owner: false, receipt: this.#body(existing) };
      }
      const quote = await this.getQuote(tenant.id, quoteId);
      if ((await this.one("SELECT id FROM attempts WHERE quote_id=?", quoteId))) fail("quote_already_used", 409);
      if (quote.expires <= this.now()) fail("quote_expired", 409);
      if (quote.route_digest !== route.routeDigest || quote.input_digest !== inputDigest) fail("quote_changed", 409);
      if (quote.amount > maxUnits) fail("request_budget_exceeded", 409);
      (await this.write("INSERT OR IGNORE INTO usage VALUES (?, 0, 0)", tenant.id));
      const usage = (await this.one("SELECT * FROM usage WHERE tenant=?", tenant.id));
      if (usage.units + quote.amount > tenant.maxUnits || usage.calls >= tenant.maxCalls) fail("tenant_budget_exceeded", 429);
      const active = (await this.all("SELECT tenant FROM attempts WHERE active=1"));
      if (active.length >= this.maxConcurrent || active.filter(a => a.tenant === tenant.id).length >= tenant.maxConcurrent) fail("concurrency_limit", 429);
      if ((await this.one("SELECT count(*) AS n FROM attempts")).n >= this.maxReceipts) fail("receipt_capacity", 503);
      if (paymentIdentity && (await this.one("SELECT 1 FROM credentials WHERE identity=?", paymentIdentity))) fail("payment_reused", 409);
      const now = this.now(), id = randomUUID();
      const receipt = validate("receipt", {
        schema: "neomorphic.machine-gateway.receipt.v1", id, quoteId, routeId: route.id, routeVersion: route.version,
        requestDigest, inputDigest, createdAt: now, deadlineAt: now + route.timeoutMs, completedAt: null,
        status: "running", price: route.price,
        payment: { state: quote.amount ? "not_attempted" : "not_required", adapter: null, evidence: "none", reference: null, network: null },
        output: null, error: null, readbackPath: `${prefix}/v1/receipts/${id}`,
      }, { response: true });
      (await this.write("INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?)", id, tenant.id, idem, requestDigest, quoteId, receipt.deadlineAt, quote.amount, JSON.stringify(receipt)));
      (await this.write("UPDATE usage SET calls=calls+1, units=units+? WHERE tenant=?", quote.amount, tenant.id));
      return { owner: true, receipt };
    });
  }
  async possiblePayment(id, adapter, evidence, identity) {
    return this.transaction(async () => {
      await this.#expire();
      const row = (await this.one("SELECT * FROM attempts WHERE id=?", id));
      if (!row?.active || row.possible) fail("payment_attempt_blocked", 409);
      if (!/^[a-f0-9]{64}$/.test(identity || "")) fail("invalid_payment");
      if ((await this.one("SELECT 1 FROM credentials WHERE identity=?", identity))) fail("payment_reused", 409);
      // Verification is read-only. Reserve a nonce globally only after it
      // succeeds, so an invalid signature cannot poison another tenant's nonce.
      (await this.write("INSERT INTO credentials VALUES (?, ?)", identity, id));
      const body = this.#body(row);
      body.payment = { ...body.payment, state: "possible", adapter, evidence };
      (await this.write("UPDATE attempts SET possible=1 WHERE id=?", id));
      await this.#save(row, body);
    });
  }
  async settled(id, payment) {
    return this.transaction(async () => {
      const row = (await this.one("SELECT * FROM attempts WHERE id=?", id));
      if (!row?.active || !row.possible || row.deadline <= this.now()) fail("execution_interrupted", 409);
      const body = this.#body(row);
      body.payment = payment;
      await this.#save(row, body);
    });
  }
  async finish(id, { output = null, error = null, declined = false } = {}) {
    return this.transaction(async () => {
      await this.#expire();
      const row = (await this.one("SELECT * FROM attempts WHERE id=?", id));
      if (!row) fail("receipt_not_found", 404);
      if (!row.active) return this.#body(row);
      const body = this.#body(row);
      body.output = output;
      body.error = error;
      body.status = error ? (body.payment.state === "possible" ? "uncertain" : "failed") : "completed";
      body.completedAt = this.now();
      if (declined && !row.possible) body.payment.state = "declined";
      if (!row.possible && error) await this.#release(row);
      await this.#save(row, body, { active: 0, reservation: !row.possible && error ? 0 : row.reservation });
      return body;
    });
  }
  async receipt(tenant, id) {
    return this.transaction(async () => {
      await this.#expire();
      const row = (await this.one("SELECT * FROM attempts WHERE id=? AND tenant=?", id, tenant));
      if (!row) fail("receipt_not_found", 404);
      return this.#body(row);
    });
  }
}
