import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { gzipSync } from 'node:zlib';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { existingFacilitatorAdapter } from '../../../vendor/machine-gateway/src/payments.mjs';
import { once } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PgPort, installedDatabaseUrl } from '../postgres.mjs';
import { openInstalledStore, monitorScheduleService } from '../mount.mjs';
import { install } from '../install.mjs';
import { prepareMachineEnvironment } from '../deploy/environment-packet.mjs';
import { prepareMachineConfig } from '../private-config.mjs';
import { armScheduler } from '../../managed-watch/scheduler.mjs';
import { PostgresGatewayStore } from '../../../vendor/machine-gateway/src/store-pg.mjs';
import { SqliteStore } from '../../../vendor/machine-gateway/src/store.mjs';
import { MachineGateway } from '../../../vendor/machine-gateway/src/gateway.mjs';
import { createGatewayServer } from '../../../vendor/machine-gateway/src/http.mjs';
import { RouteRegistry } from '../../../vendor/machine-gateway/src/registry.mjs';
import { builtinRoutes, sampleInput } from '../../../vendor/machine-gateway/src/providers.mjs';
import { sha256, digest } from '../../../vendor/machine-gateway/src/util.mjs';
import { PostgresMonitorStore } from '../../../vendor/continuous-monitoring/src/store-pg.mjs';
import { MonitorStore } from '../../../vendor/continuous-monitoring/src/store.mjs';
import { createApi } from '../../../vendor/continuous-monitoring/src/api.mjs';
import { tick } from '../../../vendor/continuous-monitoring/src/worker.mjs';
import { normalize } from '../../../vendor/continuous-monitoring/src/observation.mjs';
import { object, text } from '../../../vendor/machine-gateway/src/schemas.mjs';
import { unsignedPaymentAdapter, requirements } from '../../../vendor/machine-gateway/tests/helpers.mjs';

const exec = promisify(execFile);
const directory = process.env.AE18_FIXTURE_DIR;
assert.ok(directory?.startsWith('/tmp/ae18-postgres-'), 'run through the owned disposable Postgres fixture');
const env = { NODE_ENV: 'production', CORRESPONDENCE_DATABASE_URL: process.env.AE18_FIXTURE_DATABASE_URL,
  CORRESPONDENCE_PGSSL_CA_FILE: process.env.AE18_FIXTURE_CA_FILE,
  MACHINE_GATEWAY_ENABLED: '1', MACHINE_GATEWAY_PAYMENTS_ENABLED: '0', MONITOR_ENABLED: '1', MONITOR_SCHEDULER: '0',
  MACHINE_GATEWAY_TENANTS_FILE: path.join(directory, 'tenants.json') };
const token = 'ae18_fixture_owner_0000000000000000000001', reader = 'ae18_fixture_reader_000000000000000000001';
const foreign = 'ae18_fixture_foreign_00000000000000000001';
const tenants = [token, foreign].map((value, index) => ({ id: 'tenant-' + index, tokenSha256: sha256(value),
  routes: ['lockfile.delta', 'http.capture'], maxCalls: 4, maxUnits: 0, maxConcurrent: 1 }));
let gatewayPort, monitorPort;
before(async () => {
  await writeFile(env.MACHINE_GATEWAY_TENANTS_FILE, JSON.stringify({ tenants }), { mode: 0o600 });
  assert.equal((await install(['migrate'], env)).adapter, 'postgres');
  gatewayPort = new PgPort({ service: 'gateway', databaseUrl: installedDatabaseUrl(env) });
  monitorPort = new PgPort({ service: 'monitor', databaseUrl: installedDatabaseUrl(env) });
  await gatewayPort.query('CREATE TABLE public.ae18_unrelated(value text); INSERT INTO public.ae18_unrelated VALUES(\'preserved\')');
});
beforeEach(async () => {
  await gatewayPort.query('TRUNCATE attempts,quotes,usage,credentials CASCADE');
  await monitorPort.query('TRUNCATE tenants,monitors,credentials,runs,run_outputs,snapshots,events,deliveries,delivery_attempts,source_gates RESTART IDENTITY CASCADE');
});
after(async () => { await gatewayPort?.close(); await monitorPort?.close(); });
async function listen(t, server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function request(base, route, { body, method, credential = token, key } = {}) {
  const response = await fetch(base + route, { method: method || (body === undefined ? 'GET' : 'POST'), headers: {
    authorization: `Bearer ${credential}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(key ? { 'idempotency-key': key } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function coldHost(t, extra = {}) {
  const child = spawn(process.execPath, ['--import', fileURLToPath(new URL('./entry-preload.mjs', import.meta.url)), 'server/index.js'], {
    env: { PATH: process.env.PATH, PORT: '0', ...env, ...extra }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let errors = ''; child.stderr.on('data', value => { errors = (errors + value).slice(-3000); });
  const message = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('cold host timeout')), 8000);
    child.once('message', value => { clearTimeout(timeout); resolve(value); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('cold host failed: ' + errors)); });
  });
  let stopped = false;
  const close = async () => {
    if (stopped) return; stopped = true;
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    const [code] = await exited; assert.equal(code, 0, errors);
  };
  t.after(close);
  return { base: `http://127.0.0.1:${message.port}`, close };
}
async function monitorFixture(t, adapter = 'postgres') {
  const source = { price: 10, requests: 0, hold: null };
  const origin = await listen(t, http.createServer(async (_req, res) => {
    source.requests++; if (source.hold) await source.hold;
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ price: source.price }));
  }));
  const options = { demo: true, mountedOrigin: origin, minIntervalMs: 10, sourceCooldownMs: 10,
    originCooldownMs: 1, visibilityMs: 10, leaseSlackMs: 100, maxTick: 1 };
  const sqliteFile = path.join(directory, `monitor-${Date.now()}.sqlite`);
  const store = adapter === 'postgres' ? new PostgresMonitorStore(monitorPort, options)
    : new MonitorStore(sqliteFile, options);
  if (adapter === 'sqlite') t.after(() => store.close());
  await store.provision({ id: 'customer', token, readerToken: reader });
  await store.provision({ id: 'other', token: foreign });
  const base = await listen(t, createApi(store));
  const input = { url: origin + '/price', mode: 'json', pointers: ['/price'], intervalMs: 10, budget: { timeoutMs: 500 } };
  const created = await request(base, '/v1/monitors', { body: input, key: 'ae18-create-monitor-0001' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return { store, sqliteFile, options, source, input, id: created.body.monitor.id, base };
}
const waitUntil = async fn => {
  const deadline = Date.now() + 6000;
  while (!await fn()) { assert.ok(Date.now() < deadline, 'bounded condition timeout'); await new Promise(resolve => setTimeout(resolve, 20)); }
};

test('production adapter requires verify-full, trusts the enrolled CA and refuses weaker TLS/foreign identity', async () => {
  const selected = await openInstalledStore('gateway', env);
  assert.equal(selected.kind, 'postgres'); assert.equal(await selected.ready(), true); await selected.close();
  for (const url of [env.CORRESPONDENCE_DATABASE_URL.replace('verify-full', 'require'),
    env.CORRESPONDENCE_DATABASE_URL.replace('localhost', '127.0.0.1'), env.CORRESPONDENCE_DATABASE_URL + '&host=elsewhere']) {
    assert.throws(() => installedDatabaseUrl({ ...env, CORRESPONDENCE_DATABASE_URL: url }));
  }
  const mismatch = new PgPort({ service: 'gateway', databaseUrl: installedDatabaseUrl({ ...env,
    CORRESPONDENCE_DATABASE_URL: env.CORRESPONDENCE_DATABASE_URL.replace('localhost', 'localhost.localdomain') }) });
  await assert.rejects(() => mismatch.checkReady(), /cert|altname|hostname/i); await mismatch.close();
  await assert.rejects(() => openInstalledStore('gateway', { ...env, MACHINE_GATEWAY_STORE: 'sqlite' }), /postgres/);
  await assert.rejects(() => openInstalledStore('gateway', { ...env, NODE_ENV: undefined, MACHINE_GATEWAY_STORE: 'sqlite' }), /postgres/);
  assert.throws(() => installedDatabaseUrl({ ...env, MACHINE_SERVICES_DATABASE_URL: env.CORRESPONDENCE_DATABASE_URL.replace('/postgres?', '/foreign?') }), /binding_refused/);
  await gatewayPort.query("UPDATE schema_identity SET identity='foreign'");
  await assert.rejects(() => gatewayPort.migrate(), /version_refused/);
  await gatewayPort.query("UPDATE schema_identity SET identity='sds.machine-gateway.pg.v1'");
  await gatewayPort.migrate(); await monitorPort.migrate();
  assert.equal((await gatewayPort.query('SELECT value FROM public.ae18_unrelated')).rows[0].value, 'preserved');
});

test('cold Node runtime executes useful free work; lost HTTP acknowledgement resumes after restart without duplicate admission', async t => {
  let host = await coldHost(t);
  assert.equal((await request(host.base, '/api/machine-gateway/healthz')).body.persistence, 'postgres');
  const quoted = await request(host.base, '/api/machine-gateway/v1/quote', { body: { routeId: 'lockfile.delta', input: sampleInput } });
  assert.equal(quoted.status, 200);
  const execution = { quoteId: quoted.body.quoteId, input: sampleInput, maxUnits: 0 };
  const lossProxy = await listen(t, http.createServer((req, res) => {
    const upstream = http.request(host.base + req.url, { method: req.method, headers: req.headers }, response => {
      response.resume(); response.once('end', () => res.socket.destroy());
    });
    upstream.on('error', () => res.destroy()); req.pipe(upstream);
  }));
  await assert.rejects(() => request(lossProxy, '/api/machine-gateway/v1/execute', { body: execution, key: 'lost-reply-0000000001' }));
  const original = JSON.parse((await gatewayPort.one('SELECT body FROM attempts')).body);
  assert.equal(original.status, 'completed'); assert.equal(original.output.counts.changed, 1);
  await host.close(); host = await coldHost(t);
  const replay = await request(host.base, '/api/machine-gateway/v1/execute', { body: execution, key: 'lost-reply-0000000001' });
  assert.deepEqual(replay.body, original); assert.equal(replay.headers.get('idempotency-replayed'), 'true');
  assert.deepEqual((await request(host.base, original.readbackPath)).body, original);
  assert.equal((await gatewayPort.one('SELECT calls FROM usage WHERE tenant=?', 'tenant-0')).calls, 1);
  assert.equal((await request(host.base, original.readbackPath, { credential: foreign })).status, 404);
});

test('multi-pool gateway claims commit before effect; duplicate request and lost COMMIT response never repeat the effect', async t => {
  await gatewayPort.query('CREATE TABLE IF NOT EXISTS effect_log(id text primary key)');
  const otherPort = new PgPort({ service: 'gateway', databaseUrl: installedDatabaseUrl(env) }); t.after(() => otherPort.close());
  const routes = builtinRoutes(); let release;
  const hold = new Promise(resolve => { release = resolve; });
  routes[0] = { ...routes[0], run: async (_input, { receiptId }) => {
    await gatewayPort.query('INSERT INTO effect_log VALUES($1)', [receiptId]); await hold;
    return routes[0].test();
  } };
  const registry = new RouteRegistry(routes);
  const stores = [gatewayPort, otherPort].map(port => new PostgresGatewayStore(port));
  const gateways = stores.map(store => new MachineGateway({ store, registry, tenants }));
  const tenant = gateways[0].authenticate('Bearer ' + token);
  const quote = await gateways[0].quote({ routeId: 'lockfile.delta', input: sampleInput }, tenant);
  const body = { quoteId: quote.quoteId, input: sampleInput, maxUnits: 0 }, args = { tenant, idempotencyKey: 'effect-dedupe-00000001' };
  const first = gateways[0].execute(body, args);
  await waitUntil(async () => (await gatewayPort.one('SELECT count(*) n FROM effect_log')).n === 1);
  assert.equal((await gateways[1].execute(body, args)).receipt.status, 'running');
  release(); const complete = await first;
  assert.deepEqual((await gateways[1].execute(body, args)).receipt, complete.receipt);
  assert.equal((await gatewayPort.one('SELECT count(*) n FROM effect_log')).n, 1);
  const originalQuery = otherPort.query.bind(otherPort); let lost = false;
  // An acknowledged DB commit whose response is lost after durable admission.
  const originalTx = otherPort.tx.bind(otherPort);
  otherPort.tx = async fn => { const result = await originalTx(fn); if (result?.owner && !lost) { lost = true; throw new Error('fixture_lost_commit_response'); } return result; };
  const q2 = await gateways[1].quote({ routeId: 'lockfile.delta', input: sampleInput }, tenant);
  const b2 = { ...body, quoteId: q2.quoteId }, a2 = { tenant, idempotencyKey: 'lost-commit-00000001' };
  await assert.rejects(() => gateways[1].execute(b2, a2), /lost_commit/);
  assert.equal((await gateways[0].execute(b2, a2)).receipt.status, 'running');
  assert.equal((await originalQuery('SELECT count(*) n FROM effect_log')).rows[0].n, 1);
});

test('gateway request, route, tenant and lifetime budgets are enforced across restarts', async t => {
  const store = new PostgresGatewayStore(gatewayPort), registry = new RouteRegistry(builtinRoutes());
  const limited = [{ ...tenants[0], routes: ['lockfile.delta'], maxCalls: 1 }];
  const gateway = new MachineGateway({ store, registry, tenants: limited }), tenant = gateway.authenticate('Bearer ' + token);
  await assert.rejects(() => gateway.quote({ routeId: 'http.capture', input: { url: 'https://example.com' } }, tenant), /forbidden/);
  const q = await gateway.quote({ routeId: 'lockfile.delta', input: sampleInput }, tenant);
  const body = { quoteId: q.quoteId, input: sampleInput, maxUnits: 0 };
  await gateway.execute(body, { tenant, idempotencyKey: 'limited-first-00000001' });
  const q2 = await gateway.quote({ routeId: 'lockfile.delta', input: sampleInput }, tenant);
  await assert.rejects(() => gateway.execute({ ...body, quoteId: q2.quoteId }, { tenant, idempotencyKey: 'limited-second-000001' }), /tenant_budget/);
  await assert.rejects(() => gateway.execute({ ...body, maxUnits: 1 }, { tenant, idempotencyKey: 'limited-first-00000001' }), /idempotency_conflict/);
  assert.equal((await store.receipt(tenant.id, (await store.replay(tenant.id, sha256('limited-first-00000001'),
    digest({ ...body, paymentHeaderDigest: sha256('') }))).id)).status, 'completed');
});

for (const adapter of ['postgres', 'sqlite']) test(adapter + ' monitor: changing HTTP source, consumer polling, duplicate ack and restart readback', async t => {
  const f = await monitorFixture(t, adapter);
  const first = await tick(f.store); assert.equal(first.completed[0].outcome, 'baseline_established');
  f.source.price = 11; await new Promise(resolve => setTimeout(resolve, 15));
  const changed = await tick(f.store); assert.equal(changed.completed[0].outcome, 'content_changed');
  assert.equal(f.source.requests, 2);
  let host = adapter === 'postgres' ? await coldHost(t) : null;
  let base = host ? host.base + '/api/monitor' : f.base;
  const events = await request(base, `/v1/monitors/${f.id}/events`, { credential: reader });
  assert.equal(events.body.events.length, 1);
  assert.equal(events.body.events[0].publicSourceChanged, false);
  const poll = await request(base, `/v1/monitors/${f.id}/deliveries`);
  const delivery = poll.body.deliveries[0]; assert.equal(delivery.delivered, false);
  const url = `/v1/monitors/${f.id}/deliveries/${delivery.deliveryId}/ack`;
  const acknowledged = await request(base, url, { body: { idempotencyKey: delivery.deliveryId } });
  assert.equal(acknowledged.body.delivered, true);
  if (host) { await host.close(); host = await coldHost(t); base = host.base + '/api/monitor'; }
  const replay = await request(base, url, { body: { idempotencyKey: delivery.deliveryId } });
  assert.equal(replay.body.replay, true);
  assert.deepEqual({ ...replay.body, replay: false }, acknowledged.body);
  assert.equal((await request(f.base, `/v1/monitors/${f.id}/events`, { credential: foreign })).status, 404);
  assert.equal((await request(f.base, `/v1/monitors/${f.id}/deliveries`, { credential: reader })).status, 403);
  assert.equal((await request(f.base, `/v1/monitors/${f.id}/events?after=9999999`)).status, 409);
  const reopened = adapter === 'postgres' ? await openInstalledStore('monitor', env)
    : new MonitorStore(f.sqliteFile, f.options);
  if (adapter === 'postgres') {
    const saved = await reopened.delivery('customer', f.id, delivery.deliveryId);
    assert.equal(saved.delivered, true); assert.equal(saved.attempts, 1); await reopened.close();
  } else { assert.equal(reopened.delivery('customer', f.id, delivery.deliveryId).delivered, true); reopened.close(); }
  assert.equal((await request(f.base, `/v1/monitors/${f.id}/usage`)).body.acknowledgedEvents, 1);
});

test('monitor claims and lease fences survive worker loss, concurrent ticks, pause, cancel and revoked grants', async t => {
  const f = await monitorFixture(t);
  const now = Date.now(); const claim = await f.store.claim(now);
  assert.ok(claim); assert.equal(await f.store.start(claim, now), true);
  assert.equal((await tick(f.store)).completed.length, 0);
  const recovered = await f.store.recover(now + 1000);
  assert.equal(recovered[0].failure, 'interrupted_unknown');
  assert.equal(f.source.requests, 0);
  assert.equal(await f.store.stage(claim, {}, now + 1001), false);
  const owner = await f.store.authenticate(token, now);
  await f.store.lifecycle(owner.id, f.id, 'pause', now + 1001);
  assert.equal(await f.store.claim(now + 2000), null);
  await f.store.lifecycle(owner.id, f.id, 'resume', now + 2000);
  const next = await f.store.claim(now + 2000); assert.ok(next);
  assert.equal(await f.store.start({ ...next, token: 'foreign-fence' }, now + 2000), false);
  await f.store.lifecycle(owner.id, f.id, 'cancel', now + 2000);
  assert.equal(await f.store.start(next, now + 2000), false);
  await f.store.revoke(owner.id);
  await assert.rejects(() => f.store.authenticate(token, now), /unauthorized/);
  assert.equal(f.source.requests, 0);
});

test('monitor staged write recovery emits one event without another upstream request; grant and budget limits persist', async t => {
  const f = await monitorFixture(t);
  await tick(f.store); f.source.price = 12; await new Promise(resolve => setTimeout(resolve, 15));
  await assert.rejects(() => tick(f.store, { afterStage: () => { throw new Error('owned_worker_loss'); } }), /worker_loss/);
  assert.equal(f.source.requests, 2);
  const reopened = await openInstalledStore('monitor', env);
  const recovered = await reopened.recover(Date.now()); assert.equal(recovered[0].outcome, 'content_changed');
  assert.equal(f.source.requests, 2); assert.equal((await reopened.listEvents('customer', f.id)).events.length, 1);
  assert.equal((await reopened.recover(Date.now())).length, 0);
  const owner = await reopened.authenticate(token, Date.now());
  const replay = await reopened.create(owner, f.input, 'ae18-create-monitor-0001', Date.now()); assert.equal(replay.replay, true);
  await assert.rejects(() => reopened.create(owner, { ...f.input, intervalMs: 20 }, 'ae18-create-monitor-0001', Date.now()), /conflict/);
  await monitorPort.write('UPDATE monitors SET checks=100,next_due=? WHERE id=?', Date.now(), f.id);
  assert.equal(await reopened.claim(Date.now()), null);
  assert.equal((await reopened.owned('customer', f.id)).status, 'budget_exhausted'); await reopened.close();
});

test('two Postgres workers race one due slot; pause during IO fences the result and stops subsequent reads', async t => {
  const f = await monitorFixture(t); let release;
  f.source.hold = new Promise(resolve => { release = resolve; });
  const otherPort = new PgPort({ service: 'monitor', databaseUrl: installedDatabaseUrl(env) }); t.after(() => otherPort.close());
  const second = new PostgresMonitorStore(otherPort, f.store.options);
  const first = tick(f.store), other = tick(second);
  await waitUntil(() => f.source.requests === 1);
  await f.store.lifecycle('customer', f.id, 'pause', Date.now()); release();
  const outcomes = await Promise.all([first, other]);
  assert.equal(outcomes.reduce((sum, result) => sum + result.completed.length, 0), 1);
  assert.equal(outcomes.flatMap(result => result.completed)[0].outcome, 'discarded');
  assert.equal(f.source.requests, 1); assert.equal((await f.store.listEvents('customer', f.id)).events.length, 0);
  await tick(second); assert.equal(f.source.requests, 1);
});

test('private Hostinger materialization and install/rollback packets preserve unrelated full configuration', async () => {
  const privateDir = path.join(directory, 'private-runtime');
  const prepared = prepareMachineConfig({ MACHINE_SERVICES_PRIVATE_DIR: privateDir,
    MACHINE_GATEWAY_TENANTS_JSON: JSON.stringify({ tenants }), MONITOR_RUNTIME_JSON: '{"options":{"maxTick":1}}' });
  assert.equal(prepared.MACHINE_GATEWAY_TENANTS_FILE, path.join(privateDir, 'gateway-tenants.json'));
  const baseline = { env_vars: [{ key: 'CORRESPONDENCE_DATABASE_URL', value: 'fixture-authoritative-value' },
    { key: 'CONTRIBUTOR_JOURNEY_MODE', value: 'live' }, { key: 'EXISTING_STRIPE_CONFIGURATION', value: 'fixture-preserved' }] };
  const listed = baseline.env_vars.map(({ key }) => ({ key, value: '********' }));
  const overlay = { env_vars: [{ key: 'MONITOR_ENABLED', value: '1' }, { key: 'MACHINE_GATEWAY_PAYMENTS_ENABLED', value: '0' }] };
  const packet = prepareMachineEnvironment({ existing: baseline, listed, overlay });
  for (const row of baseline.env_vars) assert.deepEqual(packet.install.env_vars.find(candidate => candidate.key === row.key), row);
  assert.deepEqual(packet.rollback.env_vars, [...baseline.env_vars].sort((a, b) => a.key.localeCompare(b.key)));
  assert.throws(() => prepareMachineEnvironment({ existing: baseline, listed: [], overlay }), /coverage/);
  assert.throws(() => prepareMachineEnvironment({ existing: baseline, listed, overlay: { env_vars: [{ key: 'CORRESPONDENCE_DATABASE_URL', value: 'replacement' }] } }), /unrelated/);
  assert.throws(() => prepareMachineEnvironment({ existing: baseline, listed, overlay: { env_vars: [{ key: 'MACHINE_GATEWAY_PAYMENTS_ENABLED', value: '1' }] } }), /adapter/);
});

test('Postgres composite foreign keys and immutable artifacts refuse cross-monitor substitution', async t => {
  const f = await monitorFixture(t); await tick(f.store);
  f.source.price++; await new Promise(resolve => setTimeout(resolve, 15)); await tick(f.store);
  const event = (await f.store.listEvents('customer', f.id)).events[0];
  const other = await f.store.create(await f.store.authenticate(foreign, Date.now()), { ...f.input, url: f.input.url + '2' }, 'other-create-0000001', Date.now());
  await monitorPort.write('DELETE FROM deliveries WHERE event_id=?', event.id);
  await assert.rejects(() => monitorPort.write('INSERT INTO deliveries(event_id,monitor_id,next_attempt) VALUES(?,?,?)', event.id, other.monitor.id, Date.now()), { code: '23503' });
  await assert.rejects(() => monitorPort.write('UPDATE events SET document=? WHERE id=?', '{}', event.id), /immutable/);
  await assert.rejects(() => f.store.listEvents('other', other.monitor.id, event.cursor), /foreign_or_unknown_cursor/);
  await monitorPort.write('INSERT INTO deliveries(event_id,monitor_id,next_attempt) VALUES(?,?,?)', event.id, f.id, Date.now());
  await assert.rejects(() => f.store.acknowledge('customer', f.id, event.id, 'foreign-key', Date.now()), /key_mismatch/);
});

test('Postgres enforces finite monitor budgets, entitlement expiry, reader scope and free tenant monitor limits', async t => {
  const f = await monitorFixture(t);
  const owner = await f.store.authenticate(token, Date.now());
  await f.store.lifecycle('customer', f.id, 'cancel', Date.now());
  const bounded = await f.store.create(owner, { ...f.input, url: f.input.url + '-bounded', budget: { timeoutMs: 500, maxChecks: 1 } }, 'bounded-monitor-0001', Date.now());
  await tick(f.store); const calls = f.source.requests;
  await new Promise(resolve => setTimeout(resolve, 15)); await tick(f.store);
  assert.equal(f.source.requests, calls); assert.equal((await f.store.owned('customer', bounded.monitor.id)).status, 'budget_exhausted');
  await f.store.create(owner, { ...f.input, url: f.input.url + '-third' }, 'third-monitor-00001', Date.now());
  await assert.rejects(() => f.store.create(owner, { ...f.input, url: f.input.url + '-fourth' }, 'fourth-monitor-0001', Date.now()), /tenant_monitor_limit/);
  assert.equal((await request(f.base, '/v1/monitors', { body: f.input, key: 'reader-cannot-create', credential: reader })).status, 403);
  await monitorPort.write('UPDATE tenants SET entitlement_until=? WHERE id=?', Date.now() - 1, 'customer');
  await tick(f.store); assert.equal(f.source.requests, calls);
  await assert.rejects(() => f.store.create(owner, f.input, 'expired-grant-create', Date.now()), /entitlement_expired/);
});

test('existing bounded scheduler performs monitor work and stops after cancel; restart readback has no timer requirement', async t => {
  const f = await monitorFixture(t);
  const service = monitorScheduleService(f.store);
  const scheduler = armScheduler(service); t.after(() => scheduler.stop());
  await scheduler.plan(); assert.equal(scheduler.armed, true);
  await waitUntil(async () => (await f.store.owned('customer', f.id)).checks >= 1);
  await f.store.lifecycle('customer', f.id, 'cancel', Date.now());
  await waitUntil(async () => (await f.store.owned('customer', f.id)).current_run === null);
  await scheduler.plan(); assert.equal(scheduler.armed, false);
  const before = f.source.requests; await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(f.source.requests, before);
});

test('actual index scheduler arms an empty Postgres store and runs finite private-target refusals without IO', async t => {
  const f = await monitorFixture(t);
  await monitorPort.write('UPDATE monitors SET config=? WHERE id=?', JSON.stringify({ ...f.store.publicMonitor(await f.store.owned('customer', f.id)).config,
    budget: { ...f.store.publicMonitor(await f.store.owned('customer', f.id)).config.budget, maxChecks: 1 } }), f.id);
  const host = await coldHost(t, { MONITOR_SCHEDULER: '1' });
  await waitUntil(async () => (await f.store.owned('customer', f.id)).status === 'budget_exhausted');
  const health = await request(host.base, '/api/monitor/healthz');
  assert.equal(health.body.persistence, 'postgres'); assert.equal(health.body.scheduler.enabled, true);
  await waitUntil(async () => !(await request(host.base, '/api/monitor/healthz')).body.scheduler.armed);
  assert.equal(f.source.requests, 0);
  const outputs = await f.store.all('SELECT document FROM run_outputs WHERE monitor_id=?', f.id);
  assert.equal(outputs.length, 1); assert.equal(JSON.parse(outputs[0].document).metrics.requests, 0);
});

test('existing health, raw webhooks, contributor prefixes, MCP and SPA preserve their disabled/enabled behavior', async t => {
  const dist = path.join(directory, 'dist'); await mkdir(dist);
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><html><body>existing-design-fixture</body></html>');
  const old = await coldHost(t, { MACHINE_GATEWAY_ENABLED: '0', MONITOR_ENABLED: '0', SAMEDAYDESK_CLIENT_DIST: dist });
  const current = await coldHost(t, { SAMEDAYDESK_CLIENT_DIST: dist });
  for (const route of ['/api/health', '/api/correspondence/healthz', '/api/neomorphic-contributor-journey/healthz', '/api/not-found']) {
    const a = await request(old.base, route), b = await request(current.base, route);
    if (route === '/api/health') { assert.ok(Date.parse(a.body.time)); assert.ok(Date.parse(b.body.time)); delete a.body.time; delete b.body.time; }
    assert.equal(b.status, a.status, route); assert.deepEqual(b.body, a.body, route);
  }
  for (const route of ['/api/stripe/webhook', '/api/webhooks/resend']) {
    const a = await request(old.base, route, { body: {} }), b = await request(current.base, route, { body: {} });
    assert.equal(b.status, a.status); assert.deepEqual(b.body, a.body);
  }
  for (const base of [old.base, current.base]) {
    const home = await fetch(base + '/'); assert.equal(home.status, 200); assert.match(await home.text(), /existing-design-fixture/);
    const mcp = await request(base, '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'ae18-fixture', version: '1' } } } });
    assert.equal(mcp.status, 200);
  }
  assert.equal((await request(current.base, '/api/monitor/healthz')).status, 200);
});

test('received PG: admission COMMIT finishing at the persisted deadline cannot enter a provider', async t => {
  let now = Date.now(), calls = 0;
  const store = new PostgresGatewayStore(gatewayPort, { now: () => now });
  const routes = builtinRoutes(); routes[0] = { ...routes[0], run: input => { calls++; return routes[0].test(); } };
  const gateway = new MachineGateway({ store, registry: new RouteRegistry(routes), tenants });
  const tenant = gateway.authenticate('Bearer ' + token);
  const quote = await gateway.quote({ routeId: 'lockfile.delta', input: sampleInput }, tenant);
  const admit = store.admit.bind(store);
  store.admit = async input => { const result = await admit(input); now = result.receipt.deadlineAt; return result; };
  const body = { quoteId: quote.quoteId, input: sampleInput, maxUnits: 0 };
  const result = await gateway.execute(body, { tenant, idempotencyKey: 'received-pg-deadline' });
  assert.equal(calls, 0); assert.equal(result.receipt.status, 'uncertain'); assert.equal(result.receipt.output, null);
  assert.deepEqual((await gateway.execute(body, { tenant, idempotencyKey: 'received-pg-deadline' })).receipt, result.receipt);
});

test('received PG: awaiting possible-payment COMMIT cannot enter settlement after deadline', async () => {
  let now = Date.now(), providers = 0;
  const store = new PostgresGatewayStore(gatewayPort, { now: () => now });
  const adapter = unsignedPaymentAdapter();
  const route = { id: 'fixture.paid', version: '1', provider: 'unsigned-local-only', description: 'local fence test',
    price: { amount: 5, unit: 'usd-micros' }, timeoutMs: 1000, maxOutputBytes: 1024,
    inputSchema: object({ value: text() }), outputSchema: object({ value: text() }), paymentRequirements: requirements,
    run: input => { providers++; return input; }, test: () => ({ value: 'fixture' }) };
  const grant = { ...tenants[0], routes: [route.id], maxUnits: 10 };
  const gateway = new MachineGateway({ store, registry: new RouteRegistry([route]), tenants: [grant],
    paymentAdapter: adapter, paymentsEnabled: true, environment: 'test' });
  const tenant = gateway.authenticate('Bearer ' + token), input = { value: 'no dispatch' };
  const quote = await gateway.quote({ routeId: route.id, input }, tenant);
  const possible = store.possiblePayment.bind(store);
  store.possiblePayment = async (...args) => { await possible(...args); now += 1001; };
  const result = await gateway.execute({ quoteId: quote.quoteId, input, maxUnits: 5 }, {
    tenant, idempotencyKey: 'received-pg-payment-deadline', paymentHeader: 'unsigned-local-fixture-fence' });
  assert.equal(adapter.calls.verify, 1); assert.equal(adapter.calls.settle, 0); assert.equal(providers, 0);
  assert.equal(result.receipt.status, 'uncertain'); assert.equal(result.receipt.payment.state, 'possible');
  assert.equal((await gatewayPort.one('SELECT units FROM usage')).units, 5);
});

test('received PG: cancel after dispatch claim and before socket entry emits no request', async t => {
  const f = await monitorFixture(t);
  await tick(f.store, { afterStart: async () => { await f.store.lifecycle('customer', f.id, 'cancel', Date.now()); } });
  assert.equal(f.source.requests, 0); assert.equal((await f.store.owned('customer', f.id)).initial_evidence, null);
});

test('received PG: revoke then regrant cannot revive a live old generation', async t => {
  const f = await monitorFixture(t), claim = await f.store.claim(Date.now());
  await f.store.revoke('customer'); await f.store.provision({ id: 'customer', token, readerToken: reader });
  assert.equal(await f.store.start(claim, Date.now()), false);
  assert.equal((await f.store.owned('customer', f.id)).status, 'expired'); assert.equal(f.source.requests, 0);
});

test('received PG: async fence awaited during DNS refuses a committed revocation before socket entry', async t => {
  const f = await monitorFixture(t);
  const owner = await f.store.authenticate(token, Date.now());
  await f.store.lifecycle('customer', f.id, 'cancel', Date.now());
  const created = await f.store.create(owner, { ...f.input, url: 'https://public.example.com/price' }, 'received-dns-create', Date.now());
  const realLookup = dns.lookup.bind(dns);
  t.mock.method(dns, 'lookup', async (host, ...args) => {
    if (host !== 'public.example.com') return realLookup(host, ...args);
    await f.store.revoke('customer'); await f.store.provision({ id: 'customer', token, readerToken: reader });
    return [{ address: '8.8.8.8', family: 4 }];
  });
  let sockets = 0;
  t.mock.method(https, 'request', () => { sockets++; throw new Error('fixture forbidden socket'); });
  await tick(f.store);
  assert.equal(sockets, 0); assert.equal((await f.store.owned('customer', created.monitor.id)).initial_evidence, null);
});

test('received PG: notification failures and malformed/missing/duplicate projections preserve baseline and privacy', async t => {
  const f = await monitorFixture(t), owner = await f.store.authenticate(token, Date.now());
  await f.store.lifecycle('customer', f.id, 'cancel', Date.now());
  const created = await f.store.create(owner, { ...f.input, mode: 'observatory', pointers: undefined, sourceId: 'moltjobs' }, 'received-projection', Date.now());
  const metric = { key: 'completedCount', value: 2, state: 'ok' };
  const projection = metrics => ({ schemaVersion: 'pilot.external-observatory.v1', sourceId: 'moltjobs',
    availability: 'available', coverage: { comparable: true, status: 'complete' }, metrics });
  const observations = [projection([metric]),
    { status: 'source_failure', fetchFailure: { code: 'fixture_private_notification_text' } },
    projection([{ ...metric, value: null }]), projection([metric, { ...metric, value: 3 }]),
    { projectionId: 'agent-economy-observatory.source-projection', sources: [{ sourceId: 'moltjobs', availability: 'available',
      freshness: { state: 'fresh' }, coverage: { state: 'covered', presentPopulations: [{ toString: null }, { toString: null }] }, metrics: [metric] }] }];
  let baseline;
  for (const [index, document] of observations.entries()) {
    const claim = await f.store.claim(Date.now() + index * 20); assert.ok(claim);
    await f.store.start(claim, Date.now() + index * 20);
    const normalized = normalize(claim.config, { status: 200, headers: {}, body: Buffer.from(JSON.stringify(document)) }, Date.now());
    await f.store.stage(claim, { normalized, failure: null, metrics: { bytes: 10, requests: 1, durationMs: 1, unknown: false } }, Date.now());
    const result = await f.store.finish(claim.id, Date.now());
    if (!index) { assert.equal(result.outcome, 'baseline_established'); baseline = (await f.store.owned('customer', created.monitor.id)).current_evidence; }
    else {
      assert.equal(result.observation.evidenceClass, 'source_failure');
      assert.equal((await f.store.owned('customer', created.monitor.id)).current_evidence, baseline);
      assert.equal(JSON.stringify(result).includes('fixture_private_notification_text'), false);
    }
  }
});

test('received PG: completion waits cannot commit an output after the persisted deadline', async t => {
  let now = Date.now();
  const store = new PostgresGatewayStore(gatewayPort, { now: () => now });
  const gateway = new MachineGateway({ store, registry: new RouteRegistry(builtinRoutes()), tenants });
  const tenant = gateway.authenticate('Bearer ' + token);
  const quote = await gateway.quote({ routeId: 'lockfile.delta', input: sampleInput }, tenant);
  const body = { quoteId: quote.quoteId, input: sampleInput, maxUnits: 0 };
  const finish = store.finish.bind(store);
  store.finish = async (...args) => {
    const read = store.one.bind(store);
    const mock = t.mock.method(store, 'one', async (sql, ...values) => {
      const row = await read(sql, ...values);
      if (sql === 'SELECT * FROM attempts WHERE id=?' && row?.active) now = row.deadline;
      return row;
    });
    try { return await finish(...args); } finally { mock.mock.restore(); }
  };
  const result = await gateway.execute(body, { tenant, idempotencyKey: 'received-completion-wait' });
  assert.equal(result.receipt.status, 'uncertain'); assert.equal(result.receipt.output, null);
});

test('received PG: transaction wait consumes the monitor start and staging lease', async t => {
  const f = await monitorFixture(t);
  const row = await f.store.owned('customer', f.id);
  const config = JSON.parse(row.config); config.budget.timeoutMs = 50;
  await monitorPort.write('UPDATE monitors SET config=? WHERE id=?', JSON.stringify(config), f.id);
  f.store.options.leaseSlackMs = 1;
  const claim = await f.store.claim(Date.now());
  const one = f.store.one.bind(f.store);
  const mock = t.mock.method(f.store, 'one', async (sql, ...args) => {
    const result = await one(sql, ...args);
    if (sql.startsWith('SELECT r.*')) await new Promise(resolve => setTimeout(resolve, 80));
    return result;
  });
  assert.equal(await f.store.start(claim, Date.now()), false);
  mock.mock.restore(); assert.equal(f.source.requests, 0);
});

test('received PG: decoded SDK overflow retains one possible settlement and identical mounted HTTP replay', async t => {
  const network = 'eip155:999999', asset = '0x' + '1'.repeat(40), payTo = '0x' + '2'.repeat(40), calls = [];
  const facilitator = await listen(t, http.createServer((req, res) => {
    calls.push(req.url); req.resume(); res.setHeader('content-type', 'application/json');
    if (req.url === '/verify') return res.end('{"isValid":true}');
    res.setHeader('content-encoding', 'gzip');
    res.end(gzipSync(JSON.stringify({ success: true, transaction: '0x' + '0'.repeat(64), network, extra: { fixture: 'x'.repeat(1048576) } })));
  }));
  const adapter = existingFacilitatorAdapter({ client: new HTTPFacilitatorClient({ url: facilitator }), budgetUnit: 'usd-micros', network, asset, payTo, allowLoopback: true });
  const reqs = { scheme: 'exact', network, asset, amount: '5', payTo, maxTimeoutSeconds: 30 };
  let providers = 0;
  const route = { id: 'fixture.sdk', version: '1', provider: 'unsigned-local-only', description: 'fixture SDK bound',
    price: { amount: 5, unit: 'usd-micros' }, timeoutMs: 3000, maxOutputBytes: 1024, paymentRequirements: reqs,
    inputSchema: object({ value: text() }), outputSchema: object({ value: text() }), run: input => { providers++; return input; }, test: () => ({ value: 'fixture' }) };
  const grant = { ...tenants[0], routes: [route.id], maxUnits: 10 };
  const registry = new RouteRegistry([route]);
  const gateway = new MachineGateway({ store: new PostgresGatewayStore(gatewayPort), registry, tenants: [grant], paymentAdapter: adapter, paymentsEnabled: true, environment: 'test' });
  const base = await listen(t, createGatewayServer(gateway));
  const input = { value: 'must not enter provider' };
  const quote = await request(base, '/api/machine-gateway/v1/quote', { body: { routeId: route.id, input } });
  const body = { quoteId: quote.body.quoteId, input, maxUnits: 5 };
  const payment = Buffer.from(JSON.stringify({ x402Version: 2, accepted: reqs, payload: { signature: '0x' + '0'.repeat(130), authorization: {
    from: '0x' + '3'.repeat(40), to: payTo, value: '5', validAfter: '0', validBefore: '9999999999', nonce: '0x' + '4'.repeat(64) } } })).toString('base64');
  const send = async url => {
    const response = await fetch(url + '/api/machine-gateway/v1/execute', { method: 'POST', headers: { authorization: 'Bearer ' + token,
      'content-type': 'application/json', 'idempotency-key': 'received-pg-sdk-overflow', 'payment-signature': payment }, body: JSON.stringify(body) });
    return response.json();
  };
  const receipt = await send(base);
  assert.equal(receipt.status, 'uncertain'); assert.equal(receipt.payment.state, 'possible'); assert.equal(providers, 0);
  const port = new PgPort({ service: 'gateway', databaseUrl: installedDatabaseUrl(env) }); t.after(() => port.close());
  const restarted = new MachineGateway({ store: new PostgresGatewayStore(port), registry, tenants: [grant], paymentAdapter: adapter, paymentsEnabled: true, environment: 'test' });
  assert.deepEqual(await send(await listen(t, createGatewayServer(restarted))), receipt);
  assert.deepEqual(calls, ['/verify', '/settle']); assert.equal((await gatewayPort.one('SELECT units FROM usage')).units, 5);
});

test('received PG: migration inspects additive-schema privilege rather than relying on a role name', async t => {
  await gatewayPort.query('CREATE ROLE ae18_no_schema_create LOGIN');
  const url = new URL(installedDatabaseUrl(env)); url.username = 'ae18_no_schema_create';
  const denied = new PgPort({ databaseUrl: url.toString(), service: 'gateway' }); t.after(() => denied.close());
  await assert.rejects(() => denied.migrate(), { code: 'machine_additive_schema_privilege_required' });
  const metadata = await gatewayPort.checkMigrationAuthority();
  assert.equal(metadata.database_create, true); assert.equal(metadata.schema_create, true);
  assert.equal((await gatewayPort.one('SELECT count(*) n FROM information_schema.tables WHERE table_schema=?', 'pilot_gateway')).n >= 5, true);
});

for (const boundary of ['verify', 'settled']) test(`received PG: deadline moving during ${boundary} await fences the next adapter/provider entry`, async () => {
  let now = Date.now(), providers = 0;
  const store = new PostgresGatewayStore(gatewayPort, { now: () => now });
  const adapter = unsignedPaymentAdapter({ verify: async () => { if (boundary === 'verify') now += 1001; } });
  const route = { id: 'fixture.boundary', version: '1', provider: 'unsigned-local-only', description: 'async boundary test',
    price: { amount: 5, unit: 'usd-micros' }, timeoutMs: 1000, maxOutputBytes: 1024, paymentRequirements: requirements,
    inputSchema: object({ value: text() }), outputSchema: object({ value: text() }),
    run: input => { providers++; return input; }, test: () => ({ value: 'fixture' }) };
  const gateway = new MachineGateway({ store, registry: new RouteRegistry([route]), tenants: [{ ...tenants[0], routes: [route.id], maxUnits: 10 }],
    paymentAdapter: adapter, paymentsEnabled: true, environment: 'test' });
  if (boundary === 'settled') { const settle = store.settled.bind(store); store.settled = async (...args) => { await settle(...args); now += 1001; }; }
  const tenant = gateway.authenticate('Bearer ' + token), input = { value: 'fixture' };
  const quote = await gateway.quote({ routeId: route.id, input }, tenant);
  const receipt = (await gateway.execute({ quoteId: quote.quoteId, input, maxUnits: 5 }, { tenant,
    idempotencyKey: 'received-await-' + boundary, paymentHeader: 'unsigned-local-fixture-boundary' })).receipt;
  assert.equal(providers, 0); assert.equal(receipt.status, 'uncertain'); assert.equal(receipt.output, null);
  assert.equal(adapter.calls.settle, boundary === 'verify' ? 0 : 1);
  assert.equal((await gatewayPort.one('SELECT units FROM usage')).units, boundary === 'verify' ? 0 : 5);
});

test('received PG: awaited database authorization consumes the source elapsed deadline before socket entry', async t => {
  const f = await monitorFixture(t);
  const config = JSON.parse((await f.store.owned('customer', f.id)).config); config.budget.timeoutMs = 50;
  await monitorPort.write('UPDATE monitors SET config=? WHERE id=?', JSON.stringify(config), f.id);
  const active = f.store.stillActive.bind(f.store);
  t.mock.method(f.store, 'stillActive', async (...args) => {
    const allowed = await active(...args);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
    return allowed;
  });
  await tick(f.store); assert.equal(f.source.requests, 0);
});

test('received PG: both mounted app APIs keep monitoring credentials out of gateway observations', async t => {
  const f = await monitorFixture(t); await f.store.lifecycle('customer', f.id, 'cancel', Date.now());
  const host = await coldHost(t);
  const quote = await request(host.base, '/api/machine-gateway/v1/quote', { body: { routeId: 'lockfile.delta', input: sampleInput } });
  const run = await request(host.base, '/api/machine-gateway/v1/execute', { body: { quoteId: quote.body.quoteId, input: sampleInput, maxUnits: 0 }, key: 'received-mounted-authority' });
  assert.equal(run.body.status, 'completed');
  const store = new PostgresMonitorStore(monitorPort, { ...f.options, mountedOrigin: host.base });
  const created = await store.create(await store.authenticate(token, Date.now()), { url: host.base + run.body.readbackPath, mode: 'http', intervalMs: 5000 }, 'received-shared-monitor', Date.now());
  const result = await tick(store);
  assert.equal(result.completed[0].observation.material.status, 401);
  assert.equal((await store.listEvents('customer', created.monitor.id)).events.length, 0);
  assert.equal((await gatewayPort.one('SELECT count(*) n FROM attempts')).n, 1);
  assert.deepEqual((await request(host.base, run.body.readbackPath)).body, run.body);
});
