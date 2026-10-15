import { DatabaseSync } from 'node:sqlite';
import { constants, mkdirSync, readFileSync, openSync, closeSync, fstatSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyState, emptyUsage, applyObservation } from '../vendor/change-monitor/src/transition.mjs';
import { digestJson, sha256, iso, normalize, materialDiff } from './observation.mjs';
import { ServiceError, requireThat, integer, object } from './errors.mjs';
import { LIMITS, monitorConfig, runtimeOptions } from './config.mjs';

const parse = JSON.parse;
const encode = JSON.stringify;
const migration = readFileSync(new URL('../migrations/001.sql', import.meta.url), 'utf8');
const applicationId = 0x4e434d31; // NCM1, dedicated monitoring state
const schemaRows = db => db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
let legacySchema;
function isLegacyStore(db) {
  if (!legacySchema) {
    const reference = new DatabaseSync(':memory:');
    try { reference.exec(migration); legacySchema = encode(schemaRows(reference)); }
    finally { reference.close(); }
  }
  return encode(schemaRows(db)) === legacySchema && db.prepare('SELECT version FROM schema_version').get()?.version === 1;
}
function coreFor(id, config, now) {
  return { subscription: {
    subscriptionId: id, owner: 'tenant', source: { kind: 'http', scope: config.scopeKey },
    revision: 1, expiresAt: iso(config.expiresAt), budget: { maxUsefulEvents: config.budget.maxEvents },
    destination: { receiverId: 'api-inbox' }, status: 'active', currentClass: null,
    baseline: null, lastAcceptedEvidenceId: null, lastFailureFingerprint: null, lastEventId: null,
    revisionLog: [], createdAt: iso(now), updatedAt: iso(now),
  }, usage: emptyUsage() };
}
export class MonitorStore {
  constructor(file, options = {}) {
    this.options = runtimeOptions(options);
    if (file !== ':memory:') {
      requireThat(path.isAbsolute(file), 'absolute_store_path_required', 503);
      const directory = path.dirname(file);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      requireThat(realpathSync(directory) === path.resolve(directory) && !(lstatSync(directory).mode & 0o077),
        'store_requires_private_canonical_directory', 503);
      const handle = openSync(file, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      try {
        const stat = fstatSync(handle);
        requireThat(stat.isFile() && stat.nlink === 1 && !(stat.mode & 0o077), 'store_requires_private_regular_file_without_links', 503);
      } finally { closeSync(handle); }
    }
    this.db = new DatabaseSync(file);
    try {
      this.db.exec('PRAGMA busy_timeout=2000; PRAGMA foreign_keys=ON;');
      this.tx(() => {
        const application = this.one('PRAGMA application_id').application_id;
        const version = this.one('PRAGMA user_version').user_version;
        const empty = schemaRows(this.db).length === 0;
        requireThat(application === applicationId || (application === 0 && version === 0 && (empty || isLegacyStore(this.db))), 'foreign_state_database', 503);
        requireThat(version === 0 || version === 1, 'unsupported_store_version', 503);
        if (empty) this.db.exec('PRAGMA auto_vacuum=INCREMENTAL;');
        this.db.exec(migration);
        this.db.exec(`PRAGMA application_id=${applicationId}; PRAGMA user_version=1;`);
      });
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    } catch (error) { this.db.close(); throw error; }
  }
  close() { this.db.close(); }
  one(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  write(sql, ...args) { return this.db.prepare(sql).run(...args); }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      if (value?.then) throw new Error('async SQLite transaction refused');
      this.db.exec('COMMIT'); return value;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  provision(input, now = Date.now()) {
    object(input, ['id', 'token', 'readerToken', 'plan', 'entitlementUntil', 'subscriptionRef']);
    requireThat(typeof input.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(input.id), 'invalid_tenant');
    const plan = input.plan ?? 'free';
    requireThat(Object.hasOwn(LIMITS, plan), 'invalid_plan');
    const until = input.entitlementUntil ? Date.parse(input.entitlementUntil) : now + 7 * 86400000;
    requireThat(Number.isSafeInteger(until) && until > now && until <= now + 366 * 86400000, 'invalid_entitlement_expiry');
    requireThat(plan !== 'paid' || (typeof input.subscriptionRef === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(input.subscriptionRef)), 'paid_subscription_reference_required');
    for (const token of [input.token, input.readerToken].filter(x => x !== undefined)) {
      requireThat(typeof token === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(token), 'invalid_credential');
    }
    requireThat(input.token && input.token !== input.readerToken, 'distinct_owner_credential_required');
    return this.tx(() => {
      this.write(`INSERT INTO tenants(id,plan,entitlement_until,subscription_ref) VALUES(?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET plan=excluded.plan,entitlement_until=excluded.entitlement_until,
        subscription_ref=excluded.subscription_ref,revoked=0`, input.id, plan, until, input.subscriptionRef ?? null);
      this.write('DELETE FROM credentials WHERE tenant_id=?', input.id);
      for (const [token, role] of [[input.token, 'owner'], [input.readerToken, 'reader']]) if (token) {
        requireThat(!this.one('SELECT 1 FROM credentials WHERE token_hash=?', sha256(token)), 'credential_already_enrolled', 409);
        this.write('INSERT INTO credentials VALUES(?,?,?)', sha256(token), input.id, role);
      }
      return { tenantId: input.id, plan, entitlementUntil: iso(until), charged: false };
    });
  }
  revoke(tenantId) {
    return this.tx(() => {
      this.write('UPDATE tenants SET revoked=1 WHERE id=?', tenantId);
      // Persist the generation change with revocation. A fast regrant must
      // never revive an outstanding claim or an already revoked monitor.
      this.write("UPDATE monitors SET status='expired',generation=generation+1 WHERE tenant_id=? AND status IN ('active','paused')", tenantId);
    });
  }
  authenticate(token, now) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 256) throw new ServiceError('unauthorized', 401);
    const row = this.one(`SELECT t.*, c.role FROM tenants t JOIN credentials c ON c.tenant_id=t.id
      WHERE c.token_hash=? AND t.revoked=0`, sha256(token));
    requireThat(row, 'unauthorized', 401); return row;
  }
  owned(tenantId, id) {
    const row = this.one('SELECT * FROM monitors WHERE id=? AND tenant_id=?', id, tenantId);
    requireThat(row, 'not_found', 404); return row;
  }
  publicMonitor(row) {
    const config = parse(row.config), core = parse(row.core);
    return { id: row.id, status: row.status, createdAt: iso(row.created_at), expiresAt: iso(row.expires_at),
      nextDueAt: iso(row.next_due), config, initialEvidenceId: row.initial_evidence,
      currentEvidenceId: row.current_evidence, currentClass: core.subscription.currentClass,
      usage: this.usageFor(row), eventCursorFloor: row.event_floor };
  }
  create(tenant, input, key, now) {
    requireThat(typeof key === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(key), 'idempotency_key_required');
    const createDigest = digestJson(input), createKey = sha256(key);
    return this.tx(() => {
      const currentTenant = this.one('SELECT * FROM tenants WHERE id=? AND revoked=0 AND entitlement_until>?', tenant.id, now);
      requireThat(currentTenant, 'entitlement_expired_or_revoked', 403);
      tenant = currentTenant;
      const prior = this.one('SELECT * FROM monitors WHERE tenant_id=? AND create_key=?', tenant.id, createKey);
      if (prior) {
        requireThat(prior.create_digest === createDigest, 'idempotency_conflict', 409);
        return { monitor: this.publicMonitor(prior), replay: true };
      }
      const limit = LIMITS[tenant.plan];
      requireThat(this.one('SELECT count(*) n FROM monitors WHERE tenant_id=?', tenant.id).n < limit.monitors, 'tenant_monitor_limit', 409);
      requireThat(this.one('SELECT count(*) n FROM monitors').n < this.options.maxMonitors, 'host_monitor_limit', 503);
      const config = monitorConfig(input, tenant, now, this.options), id = randomUUID();
      this.write(`INSERT INTO monitors(id,tenant_id,create_key,create_digest,config,status,created_at,expires_at,next_due,core)
        VALUES(?,?,?,?,?,'active',?,?,?,?)`, id, tenant.id, createKey, createDigest, encode(config), now, config.expiresAt, now,
        encode(coreFor(id, config, now)));
      return { monitor: this.publicMonitor(this.owned(tenant.id, id)), replay: false };
    });
  }
  expire(now) {
    this.write(`UPDATE monitors SET status='expired',generation=generation+1
      WHERE status IN ('active','paused') AND (expires_at<=? OR tenant_id IN
        (SELECT id FROM tenants WHERE revoked=1 OR entitlement_until<=?))`, now, now);
  }
  lifecycle(tenantId, id, action, now) {
    return this.tx(() => {
      this.expire(now);
      const row = this.owned(tenantId, id);
      requireThat(['pause', 'resume', 'cancel'].includes(action), 'invalid_action');
      if (action === 'cancel' && row.status === 'cancelled') return this.publicMonitor(row);
      requireThat(!['cancelled', 'expired', 'budget_exhausted'].includes(row.status), 'terminal_monitor', 409);
      const status = { pause: 'paused', resume: 'active', cancel: 'cancelled' }[action];
      if (status !== row.status) this.write('UPDATE monitors SET status=?,generation=generation+1,next_due=? WHERE id=?',
        status, Math.max(now, row.next_due), id);
      return this.publicMonitor(this.owned(tenantId, id));
    });
  }
  revise(tenant, id, patch, now) {
    object(patch, ['intervalMs', 'expiresAt', 'budget', 'retentionDays']);
    requireThat(Object.keys(patch).length > 0, 'empty_patch');
    return this.tx(() => {
      this.expire(now);
      const currentTenant = this.one('SELECT * FROM tenants WHERE id=? AND revoked=0 AND entitlement_until>?', tenant.id, now);
      requireThat(currentTenant, 'entitlement_expired_or_revoked', 403);
      tenant = currentTenant;
      const row = this.owned(tenant.id, id), old = parse(row.config), core = parse(row.core);
      requireThat(row.status === 'paused' && row.current_run === null, 'pause_and_drain_before_revision', 409);
      const config = monitorConfig({ url: old.url, mode: old.mode,
        ...(old.mode === 'json' ? { pointers: old.pointers } : {}),
        ...(old.mode === 'observatory' ? { sourceId: old.sourceId } : {}),
        intervalMs: patch.intervalMs ?? old.intervalMs, expiresAt: patch.expiresAt ?? iso(old.expiresAt),
        retentionDays: patch.retentionDays ?? old.retentionDays, budget: { ...old.budget, ...patch.budget },
        ...(old.targetAuth ? { targetAuth: old.targetAuth } : {}) }, tenant, now, this.options);
      requireThat(config.budget.maxChecks >= row.checks && config.budget.maxBytes >= row.charged_bytes
        && config.budget.maxRuntimeMs >= row.charged_ms && config.budget.maxEvents >= core.usage.usefulEvents, 'budget_below_usage');
      core.subscription.revision += 1;
      core.subscription.expiresAt = iso(config.expiresAt);
      core.subscription.budget.maxUsefulEvents = config.budget.maxEvents;
      this.write('UPDATE monitors SET config=?,core=?,expires_at=?,generation=generation+1,next_due=? WHERE id=?',
        encode(config), encode(core), config.expiresAt, now + config.intervalMs, id);
      return this.publicMonitor(this.owned(tenant.id, id));
    });
  }
  claim(now, excluded = []) {
    return this.tx(() => {
      this.expire(now);
      const candidates = this.all(`SELECT m.*,t.plan,t.checks tenant_checks,t.charged_bytes tenant_bytes,t.charged_ms tenant_ms
        FROM monitors m JOIN tenants t ON t.id=m.tenant_id
        WHERE m.status='active' AND m.current_run IS NULL AND m.next_due<=?
        ORDER BY m.next_due,m.checks,m.id LIMIT 200`, now);
      for (const row of candidates) {
        if (excluded.includes(row.id)) continue;
        const config = parse(row.config), budget = config.budget, limits = LIMITS[row.plan];
        const reservedBytes = budget.maxBodyBytes + 65536, reservedMs = budget.timeoutMs;
        if (row.checks >= budget.maxChecks || row.charged_bytes + reservedBytes > budget.maxBytes
          || row.charged_ms + reservedMs > budget.maxRuntimeMs || parse(row.core).usage.usefulEvents >= budget.maxEvents
          || row.tenant_checks >= limits.tenantChecks || row.tenant_bytes + reservedBytes > limits.tenantBytes
          || row.tenant_ms + reservedMs > limits.tenantMs) {
          this.write("UPDATE monitors SET status='budget_exhausted',generation=generation+1 WHERE id=?", row.id); continue;
        }
        const originKey = digestJson({ origin: new URL(config.url).origin });
        const gates = [[config.sourceKey, this.options.sourceCooldownMs], [originKey, this.options.originCooldownMs]];
        const blockedUntil = Math.max(0, ...gates.map(([key]) => this.one('SELECT next_at FROM source_gates WHERE key=?', key)?.next_at ?? 0));
        if (blockedUntil > now) { this.write('UPDATE monitors SET next_due=? WHERE id=?', blockedUntil, row.id); continue; }
        for (const [key, cooldown] of gates) this.write(`INSERT INTO source_gates VALUES(?,?)
          ON CONFLICT(key) DO UPDATE SET next_at=excluded.next_at`, key, now + cooldown);
        const id = randomUUID(), token = randomUUID();
        this.write(`INSERT INTO runs(id,monitor_id,slot,generation,lease_token,lease_until,phase,reserved_bytes,reserved_ms,started_at)
          VALUES(?,?,?,?,?,?,'claimed',?,?,?)`, id, row.id, row.next_due, row.generation, token,
          now + budget.timeoutMs + this.options.leaseSlackMs, reservedBytes, reservedMs, now);
        this.write(`UPDATE monitors SET current_run=?,checks=checks+1,charged_bytes=charged_bytes+?,charged_ms=charged_ms+?,next_due=? WHERE id=?`,
          id, reservedBytes, reservedMs, Math.max(now + config.intervalMs, row.next_due + config.intervalMs), row.id);
        this.write('UPDATE tenants SET checks=checks+1,charged_bytes=charged_bytes+?,charged_ms=charged_ms+? WHERE id=?', reservedBytes, reservedMs, row.tenant_id);
        return { id, monitorId: row.id, token, generation: row.generation, config, expiresAt: row.expires_at, tenantId: row.tenant_id };
      }
      return null;
    });
  }
  start(claim, now) {
    return this.tx(() => {
      this.expire(now);
      const live = this.one(`SELECT r.*,m.status,m.generation live_generation,m.current_run FROM runs r
        JOIN monitors m ON m.id=r.monitor_id WHERE r.id=? AND r.lease_token=?`, claim.id, claim.token);
      if (!live || live.phase !== 'claimed' || live.lease_until <= now || live.status !== 'active'
        || live.live_generation !== claim.generation || live.current_run !== claim.id) return false;
      return this.write("UPDATE runs SET phase='started' WHERE id=? AND phase='claimed'", claim.id).changes === 1;
    });
  }
  stillActive(claim, now) {
    const row = this.one(`SELECT m.status,m.generation,m.expires_at,t.entitlement_until,t.revoked,r.lease_until
      FROM monitors m JOIN tenants t ON t.id=m.tenant_id JOIN runs r ON r.id=m.current_run
      WHERE m.id=? AND r.id=? AND r.lease_token=?`, claim.monitorId, claim.id, claim.token);
    return row && row.status === 'active' && row.generation === claim.generation && row.expires_at > now
      && row.entitlement_until > now && !row.revoked && row.lease_until > now;
  }
  baseline(monitorId) {
    const row = this.one(`SELECT s.document FROM snapshots s JOIN monitors m ON m.id=s.monitor_id
      AND m.current_evidence=s.evidence_id WHERE m.id=?`, monitorId);
    return row ? parse(row.document) : null;
  }
  stage(claim, result, now) {
    return this.tx(() => {
      const run = this.one('SELECT * FROM runs WHERE id=? AND lease_token=?', claim.id, claim.token);
      if (!run || !['started', 'claimed'].includes(run.phase) || run.lease_until <= now) return false;
      this.write("UPDATE runs SET phase='staged',staged=? WHERE id=?", encode(result), claim.id); return true;
    });
  }
  finish(runId, now) {
    return this.tx(() => this.finishInside(runId, now));
  }
  finishInside(runId, now) {
    this.expire(now);
    const run = this.one('SELECT * FROM runs WHERE id=?', runId);
    if (!run || run.phase !== 'staged') return null;
    const row = this.one('SELECT * FROM monitors WHERE id=?', run.monitor_id), staged = parse(run.staged);
    const config = parse(row.config), saved = parse(row.core), state = emptyState();
    state.subscriptions[row.id] = saved.subscription; state.usage[row.id] = saved.usage;
    const authorized = row.current_run === run.id && row.generation === run.generation && row.status === 'active';
    let admitted = { outcome: 'discarded', eventId: null }, before = this.baseline(row.id);
    if (authorized && staged.normalized) {
      admitted = applyObservation(state, { subscriptionId: row.id, normalized: staged.normalized, now: iso(now) });
      const evidence = state.evidence[staged.normalized.evidenceId];
      if (evidence) this.write('INSERT OR IGNORE INTO snapshots VALUES(?,?,?,?)', row.id, evidence.evidenceId, now,
        encode({ ...staged.normalized, firstObservedAt: iso(now) }));
      // An unchanged replay needs no new snapshot. Its original evidence remains immutable.
      if (admitted.eventId && state.events[admitted.eventId]) {
        const event = state.events[admitted.eventId];
        const body = { schema: 'continuous-monitoring.change.v1', id: event.eventId, idempotencyKey: event.idempotencyKey,
          monitorId: row.id, runId, observedAt: iso(now), transition: event.transition,
          evidenceClass: event.evidenceClass, failureCode: event.failureCode, capture: this.options.demo ? 'mounted_http' : 'public_http',
          beforeEvidenceId: before?.evidenceId ?? null, afterEvidenceId: event.evidenceId,
          before: before?.material ?? null, after: event.material,
          diff: event.transition === 'content_changed' ? materialDiff(before?.material, event.material) : [],
          publicSourceChanged: !this.options.demo && event.transition === 'content_changed',
          task: event.task };
        this.write(`INSERT INTO events(id,monitor_id,created_at,before_evidence,after_evidence,document) VALUES(?,?,?,?,?,?)`,
          event.eventId, row.id, now, before?.evidenceId ?? null, event.evidenceId, encode(body));
        this.write('INSERT INTO deliveries(event_id,monitor_id,next_attempt) VALUES(?,?,?)', event.eventId, row.id, now);
      }
      this.write(`UPDATE monitors SET core=?,current_evidence=?,initial_evidence=COALESCE(initial_evidence,?),
        status=CASE WHEN ?='budget_exhausted' THEN 'budget_exhausted' ELSE status END WHERE id=?`,
        encode({ subscription: state.subscriptions[row.id], usage: state.usage[row.id] }),
        state.subscriptions[row.id].baseline?.evidenceId ?? null,
        state.subscriptions[row.id].baseline?.evidenceId ?? null, admitted.outcome, row.id);
    }
    const metrics = staged.metrics;
    const byteCharge = metrics.unknown ? run.reserved_bytes : metrics.bytes;
    const timeCharge = metrics.unknown ? run.reserved_ms : metrics.durationMs;
    this.write(`UPDATE monitors SET current_run=CASE WHEN current_run=? THEN NULL ELSE current_run END,
      charged_bytes=charged_bytes+?,charged_ms=charged_ms+?,actual_bytes=actual_bytes+?,actual_ms=actual_ms+?,
      requests=requests+?,unknown_runs=unknown_runs+? WHERE id=?`,
      runId, byteCharge - run.reserved_bytes, timeCharge - run.reserved_ms, metrics.bytes, metrics.durationMs,
      metrics.requests, metrics.unknown ? 1 : 0, row.id);
    this.write('UPDATE tenants SET charged_bytes=charged_bytes+?,charged_ms=charged_ms+? WHERE id=?',
      byteCharge - run.reserved_bytes, timeCharge - run.reserved_ms, row.tenant_id);
    const output = { schema: 'continuous-monitoring.run.v1', runId, monitorId: row.id, scheduledAt: iso(run.slot),
      startedAt: iso(run.started_at), completedAt: iso(now), outcome: authorized ? admitted.outcome : 'discarded',
      failure: staged.failure ?? null, eventId: admitted.eventId, observation: staged.normalized,
      metrics: { ...metrics, chargedBytes: byteCharge, chargedRuntimeMs: timeCharge } };
    this.write('INSERT INTO run_outputs VALUES(?,?,?,?)', runId, row.id, now, encode(output));
    this.write("UPDATE runs SET phase='finished',staged=NULL,outcome=? WHERE id=?", output.outcome, runId);
    return output;
  }
  recover(now) {
    return this.tx(() => {
      this.expire(now);
      const outputs = [];
      for (const run of this.all("SELECT * FROM runs WHERE phase='staged' OR (phase IN ('claimed','started') AND lease_until<=?) ORDER BY started_at LIMIT 200", now)) {
        if (run.phase !== 'staged') {
          const row = this.one('SELECT config FROM monitors WHERE id=?', run.monitor_id), unknown = run.phase === 'started';
          const failure = unknown ? 'interrupted_unknown' : 'worker_lost_before_dispatch';
          const staged = { normalized: unknown ? normalize(parse(row.config), { failure }, now) : null, failure,
            metrics: { bytes: 0, requests: 0, durationMs: 0, unknown, requestUpperBound: unknown ? 1 : 0 } };
          this.write("UPDATE runs SET phase='staged',staged=? WHERE id=?", encode(staged), run.id);
        }
        outputs.push(this.finishInside(run.id, now));
      }
      return outputs;
    });
  }
  usageFor(row) {
    return { schema: 'continuous-monitoring.usage.v1', checksReserved: row.checks, sourceRequestsKnown: row.requests,
      sourceRequestsUnknownUpperBound: row.unknown_runs, receivedBytesKnown: row.actual_bytes,
      runtimeMsKnown: row.actual_ms, budgetBytesCharged: row.charged_bytes, budgetRuntimeMsCharged: row.charged_ms,
      deliveryAttempts: row.delivery_attempts, acknowledgedEvents: row.acknowledged,
      transitions: parse(row.core).usage,
      cost: { currency: null, total: null, sourcePrice: null, infrastructureRate: null, laborRate: null,
        billable: false, automaticCharge: false, basis: 'measured inputs; provider, storage, operations and subscription economics unknown' } };
  }
  listEvents(tenantId, id, after = 0, limit = 25) {
    const row = this.owned(tenantId, id);
    integer(after, 0, Number.MAX_SAFE_INTEGER); integer(limit, 1, 50);
    requireThat(after === 0 || after >= row.event_floor, 'cursor_expired', 410);
    requireThat(after === 0 || after === row.event_floor || this.one('SELECT 1 FROM events WHERE monitor_id=? AND seq=?', id, after), 'foreign_or_unknown_cursor', 409);
    const events = this.all('SELECT seq,document FROM events WHERE monitor_id=? AND seq>? ORDER BY seq LIMIT ?', id, after, limit)
      .map(event => ({ cursor: event.seq, ...parse(event.document) }));
    return { events, nextCursor: events.at(-1)?.cursor ?? Math.max(after, row.event_floor), cursorFloor: row.event_floor };
  }
  poll(tenantId, id, now, limit = 10) {
    integer(limit, 1, 25);
    return this.tx(() => {
      this.owned(tenantId, id);
      this.write("UPDATE deliveries SET state='exhausted' WHERE monitor_id=? AND state!='accepted' AND attempts>=? AND next_attempt<=?", id, this.options.maxDeliveryAttempts, now);
      const rows = this.all(`SELECT d.*,e.document,e.seq FROM deliveries d JOIN events e ON e.id=d.event_id
        WHERE d.monitor_id=? AND d.state IN ('pending','awaiting_ack') AND d.next_attempt<=? AND d.attempts<?
        ORDER BY e.seq LIMIT ?`, id, now, this.options.maxDeliveryAttempts, limit);
      return { deliveries: rows.map(row => {
        const attempt = row.attempts + 1;
        const retryAt = now + Math.min(3600000, this.options.visibilityMs * 2 ** (attempt - 1));
        this.write("UPDATE deliveries SET state='awaiting_ack',attempts=?,next_attempt=?,first_read_at=COALESCE(first_read_at,?) WHERE event_id=?", attempt, retryAt, now, row.event_id);
        this.write('INSERT INTO delivery_attempts(event_id,created_at,attempt,retry_at) VALUES(?,?,?,?)', row.event_id, now, attempt, retryAt);
        this.write('UPDATE monitors SET delivery_attempts=delivery_attempts+1 WHERE id=?', id);
        return { event: { cursor: row.seq, ...parse(row.document) }, deliveryId: row.event_id, attempt, delivered: false, retryAt: iso(retryAt) };
      }) };
    });
  }
  delivery(tenantId, id, eventId) {
    this.owned(tenantId, id);
    const row = this.one('SELECT * FROM deliveries WHERE monitor_id=? AND event_id=?', id, eventId);
    requireThat(row, 'delivery_not_found_or_retained_out', 404);
    return { deliveryId: row.event_id, idempotencyKey: row.event_id, state: row.state, attempts: row.attempts,
      delivered: row.state === 'accepted', acknowledgedAt: row.acknowledged_at === null ? null : iso(row.acknowledged_at),
      attemptsLog: this.all('SELECT created_at,attempt,retry_at FROM delivery_attempts WHERE event_id=? ORDER BY id', eventId) };
  }
  acknowledge(tenantId, id, eventId, key, now) {
    return this.tx(() => {
      const prior = this.delivery(tenantId, id, eventId);
      requireThat(key === eventId, 'acknowledgement_key_mismatch', 409);
      requireThat(prior.attempts > 0, 'delivery_not_read', 409);
      if (!prior.delivered) {
        this.write("UPDATE deliveries SET state='accepted',acknowledged_at=? WHERE event_id=?", now, eventId);
        this.write('UPDATE monitors SET acknowledged=acknowledged+1 WHERE id=?', id);
      }
      return { ...this.delivery(tenantId, id, eventId), replay: prior.delivered };
    });
  }
  prune(now) {
    return this.tx(() => {
      this.expire(now);
      for (const row of this.all('SELECT * FROM monitors LIMIT 200')) {
        const config = parse(row.config), cutoff = now - config.retentionDays * 86400000;
        if (['cancelled', 'expired', 'budget_exhausted'].includes(row.status) && row.current_run === null && row.expires_at < cutoff) {
          this.write('DELETE FROM monitors WHERE id=?', row.id); continue;
        }
        const remove = this.all(`SELECT seq FROM events WHERE monitor_id=? AND (created_at<? OR seq NOT IN
          (SELECT seq FROM events WHERE monitor_id=? ORDER BY seq DESC LIMIT ?))`, row.id, cutoff, row.id, config.budget.maxEvents);
        if (remove.length) {
          this.write('UPDATE monitors SET event_floor=max(event_floor,?) WHERE id=?', Math.max(...remove.map(x => x.seq)), row.id);
          for (const item of remove) this.write('DELETE FROM events WHERE seq=?', item.seq);
        }
        this.write(`DELETE FROM runs WHERE monitor_id=? AND phase='finished' AND (started_at<? OR id NOT IN
          (SELECT id FROM runs WHERE monitor_id=? ORDER BY started_at DESC,id DESC LIMIT 100))`, row.id, cutoff, row.id);
        this.write(`DELETE FROM snapshots WHERE monitor_id=? AND evidence_id NOT IN
          (SELECT initial_evidence FROM monitors WHERE id=? AND initial_evidence IS NOT NULL
           UNION SELECT current_evidence FROM monitors WHERE id=? AND current_evidence IS NOT NULL
           UNION SELECT before_evidence FROM events WHERE monitor_id=? AND before_evidence IS NOT NULL
           UNION SELECT after_evidence FROM events WHERE monitor_id=? AND after_evidence IS NOT NULL)`, row.id, row.id, row.id, row.id, row.id);
      }
      this.write('DELETE FROM source_gates WHERE next_at<?', now - 86400000);
    });
  }
}
