import { DatabaseSync } from "node:sqlite";
import { chmodSync, lstatSync, mkdirSync, openSync, closeSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fail } from "./errors.mjs";
import { validate } from "./schemas.mjs";

// One database is the authority for budgets, quotes, credentials and receipts.
// Transactions contain no await/network calls. FULL WAL commits precede IO.
export class SqliteStore {
  constructor(file, { now = Date.now, maxReceipts = 10000, maxQuotes = 2000, maxConcurrent = 4 } = {}) {
    if (!file || !file.startsWith("/")) throw new Error("absolute state file required");
    const directory = dirname(file);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (realpathSync(directory) !== resolve(directory) || (lstatSync(directory).mode & 0o077)) throw new Error("state directory must be private and canonical");
    try { closeSync(openSync(file, "wx", 0o600)); } catch (error) { if (error.code !== "EEXIST") throw error; }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("invalid state file");
    chmodSync(file, 0o600);
    this.now = now;
    this.maxReceipts = maxReceipts;
    this.maxQuotes = maxQuotes;
    this.maxConcurrent = maxConcurrent;
    this.db = new DatabaseSync(file);
    try {
      this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;");
      const version = this.db.prepare("PRAGMA user_version").get().user_version;
      const application = this.db.prepare("PRAGMA application_id").get().application_id;
      if (application !== 0x4d475731 && (application !== 0 || version !== 0 ||
        this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length)) throw new Error("foreign state database");
      if (version !== 0 && version !== 1) throw new Error("unsupported store version");
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      this.db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS quotes (
          id TEXT PRIMARY KEY, tenant TEXT NOT NULL, route_id TEXT NOT NULL,
          route_digest TEXT NOT NULL, input_digest TEXT NOT NULL, expires INTEGER NOT NULL,
          amount INTEGER NOT NULL, unit TEXT NOT NULL, version TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usage (tenant TEXT PRIMARY KEY, calls INTEGER NOT NULL, units INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts (
          id TEXT PRIMARY KEY, tenant TEXT NOT NULL, idem TEXT NOT NULL, request_digest TEXT NOT NULL,
          quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id), deadline INTEGER NOT NULL,
          active INTEGER NOT NULL, reservation INTEGER NOT NULL, possible INTEGER NOT NULL DEFAULT 0,
          body TEXT NOT NULL, UNIQUE(tenant, idem)
        );
        CREATE TABLE IF NOT EXISTS credentials (identity TEXT PRIMARY KEY, attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(id));
        CREATE INDEX IF NOT EXISTS active_attempts ON attempts(active, deadline, tenant);
        PRAGMA application_id=1296521009;
        PRAGMA user_version=1;
        COMMIT;
      `);
    } catch (error) { this.db.close(); throw error; }
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  ready() { return this.db.prepare("SELECT 1 AS ok").get().ok === 1; }
  close() { this.db.close(); }
  quote({ tenant, route, inputDigest, ttlMs = 60000 }) {
    return this.transaction(() => {
      const now = this.now();
      this.db.prepare("DELETE FROM quotes WHERE expires < ? AND NOT EXISTS (SELECT 1 FROM attempts WHERE quote_id=quotes.id)").run(now);
      if (this.db.prepare("SELECT count(*) AS n FROM quotes WHERE NOT EXISTS (SELECT 1 FROM attempts WHERE quote_id=quotes.id)").get().n >= this.maxQuotes) fail("quote_capacity", 503);
      const quote = { id: randomUUID(), tenant, route_id: route.id, route_digest: route.routeDigest,
        input_digest: inputDigest, expires: now + ttlMs, amount: route.price.amount, unit: route.price.unit, version: route.version };
      this.db.prepare("INSERT INTO quotes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(...Object.values(quote));
      return quote;
    });
  }
  getQuote(tenant, id) {
    const quote = this.db.prepare("SELECT * FROM quotes WHERE id=? AND tenant=?").get(id, tenant);
    if (!quote) fail("quote_not_found", 404);
    return quote;
  }
  #body(row) { return validate("receipt", JSON.parse(row.body), { response: true }); }
  #save(row, body, { active = row.active, reservation = row.reservation } = {}) {
    validate("receipt", body, { response: true });
    this.db.prepare("UPDATE attempts SET body=?, active=?, reservation=? WHERE id=?").run(JSON.stringify(body), active, reservation, row.id);
  }
  #release(row) {
    if (row.reservation) this.db.prepare("UPDATE usage SET units=units-? WHERE tenant=?").run(row.reservation, row.tenant);
  }
  #expire() {
    for (const row of this.db.prepare("SELECT * FROM attempts WHERE active=1 AND deadline<=?").all(this.now())) {
      const body = this.#body(row);
      body.status = "uncertain";
      body.completedAt = this.now();
      body.error = { code: "execution_interrupted" };
      // No payment can start past deadline. Possible spend is never refunded.
      if (!row.possible) this.#release(row);
      this.#save(row, body, { active: 0, reservation: row.possible ? row.reservation : 0 });
    }
  }
  replay(tenant, idem, requestDigest) {
    return this.transaction(() => {
      this.#expire();
      const row = this.db.prepare("SELECT * FROM attempts WHERE tenant=? AND idem=?").get(tenant, idem);
      if (!row) return null;
      if (row.request_digest !== requestDigest) fail("idempotency_conflict", 409);
      return this.#body(row);
    });
  }
  admit({ tenant, idem, requestDigest, quoteId, inputDigest, route, maxUnits, paymentIdentity, prefix }) {
    return this.transaction(() => {
      this.#expire();
      const existing = this.db.prepare("SELECT * FROM attempts WHERE tenant=? AND idem=?").get(tenant.id, idem);
      if (existing) {
        if (existing.request_digest !== requestDigest) fail("idempotency_conflict", 409);
        return { owner: false, receipt: this.#body(existing) };
      }
      const quote = this.getQuote(tenant.id, quoteId);
      if (this.db.prepare("SELECT id FROM attempts WHERE quote_id=?").get(quoteId)) fail("quote_already_used", 409);
      if (quote.expires <= this.now()) fail("quote_expired", 409);
      if (quote.route_digest !== route.routeDigest || quote.input_digest !== inputDigest) fail("quote_changed", 409);
      if (quote.amount > maxUnits) fail("request_budget_exceeded", 409);
      this.db.prepare("INSERT OR IGNORE INTO usage VALUES (?, 0, 0)").run(tenant.id);
      const usage = this.db.prepare("SELECT * FROM usage WHERE tenant=?").get(tenant.id);
      if (usage.units + quote.amount > tenant.maxUnits || usage.calls >= tenant.maxCalls) fail("tenant_budget_exceeded", 429);
      const active = this.db.prepare("SELECT tenant FROM attempts WHERE active=1").all();
      if (active.length >= this.maxConcurrent || active.filter(a => a.tenant === tenant.id).length >= tenant.maxConcurrent) fail("concurrency_limit", 429);
      if (this.db.prepare("SELECT count(*) AS n FROM attempts").get().n >= this.maxReceipts) fail("receipt_capacity", 503);
      if (paymentIdentity && this.db.prepare("SELECT 1 FROM credentials WHERE identity=?").get(paymentIdentity)) fail("payment_reused", 409);
      const now = this.now(), id = randomUUID();
      const receipt = validate("receipt", {
        schema: "neomorphic.machine-gateway.receipt.v1", id, quoteId, routeId: route.id, routeVersion: route.version,
        requestDigest, inputDigest, createdAt: now, deadlineAt: now + route.timeoutMs, completedAt: null,
        status: "running", price: route.price,
        payment: { state: quote.amount ? "not_attempted" : "not_required", adapter: null, evidence: "none", reference: null, network: null },
        output: null, error: null, readbackPath: `${prefix}/v1/receipts/${id}`,
      }, { response: true });
      this.db.prepare("INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?)")
        .run(id, tenant.id, idem, requestDigest, quoteId, receipt.deadlineAt, quote.amount, JSON.stringify(receipt));
      this.db.prepare("UPDATE usage SET calls=calls+1, units=units+? WHERE tenant=?").run(quote.amount, tenant.id);
      return { owner: true, receipt };
    });
  }
  possiblePayment(id, adapter, evidence, identity) {
    return this.transaction(() => {
      this.#expire();
      const row = this.db.prepare("SELECT * FROM attempts WHERE id=?").get(id);
      if (!row?.active || row.possible) fail("payment_attempt_blocked", 409);
      if (!/^[a-f0-9]{64}$/.test(identity || "")) fail("invalid_payment");
      if (this.db.prepare("SELECT 1 FROM credentials WHERE identity=?").get(identity)) fail("payment_reused", 409);
      // Verification is read-only. Reserve a nonce globally only after it
      // succeeds, so an invalid signature cannot poison another tenant's nonce.
      this.db.prepare("INSERT INTO credentials VALUES (?, ?)").run(identity, id);
      const body = this.#body(row);
      body.payment = { ...body.payment, state: "possible", adapter, evidence };
      this.db.prepare("UPDATE attempts SET possible=1 WHERE id=?").run(id);
      this.#save(row, body);
    });
  }
  settled(id, payment) {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM attempts WHERE id=?").get(id);
      if (!row?.active || !row.possible || row.deadline <= this.now()) fail("execution_interrupted", 409);
      const body = this.#body(row);
      body.payment = payment;
      this.#save(row, body);
    });
  }
  finish(id, { output = null, error = null, declined = false } = {}) {
    return this.transaction(() => {
      this.#expire();
      const row = this.db.prepare("SELECT * FROM attempts WHERE id=?").get(id);
      if (!row) fail("receipt_not_found", 404);
      if (!row.active) return this.#body(row);
      const body = this.#body(row);
      body.output = output;
      body.error = error;
      body.status = error ? (body.payment.state === "possible" ? "uncertain" : "failed") : "completed";
      body.completedAt = this.now();
      if (declined && !row.possible) body.payment.state = "declined";
      if (!row.possible && error) this.#release(row);
      this.#save(row, body, { active: 0, reservation: !row.possible && error ? 0 : row.reservation });
      return body;
    });
  }
  receipt(tenant, id) {
    return this.transaction(() => {
      this.#expire();
      const row = this.db.prepare("SELECT * FROM attempts WHERE id=? AND tenant=?").get(id, tenant);
      if (!row) fail("receipt_not_found", 404);
      return this.#body(row);
    });
  }
}
