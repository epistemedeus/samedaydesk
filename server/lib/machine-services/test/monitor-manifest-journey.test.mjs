// Serial, disposable verified-TLS PostgreSQL receiving. No upstream observation,
// scheduler demonstration, production credential or shared source pin mutation.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, chmod, rm, mkdir, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PgPort, installedDatabaseUrl } from '../postgres.mjs';
import { createSdsApp } from '../../../app.js';
import { PostgresMonitorStore } from '../../../vendor/continuous-monitoring/src/store-pg.mjs';
import Ajv2020 from 'ajv/dist/2020.js';

const exec = promisify(execFile), root = fileURLToPath(new URL('../../../../', import.meta.url));
const baseline = process.env.R4_MONITOR_BASELINE === '1';
const pgBin = process.env.AE18_POSTGRES_BIN || '/usr/lib/postgresql/16/bin';
const hash = value => createHash('sha256').update(value).digest('hex');
let directory, data, env, port, gatewayPort, started = false, sourcePinFile, candidatePin;
let retainedId;
const ownerToken = 'r4_fixture_owner_' + 'o'.repeat(32), readerToken = 'r4_fixture_reader_' + 'r'.repeat(32);
const foreignToken = 'r4_fixture_foreign_' + 'f'.repeat(32), expiredToken = 'r4_fixture_expired_' + 'e'.repeat(32);
const revokedToken = 'r4_fixture_revoked_' + 'v'.repeat(32);
const evidenceId = hash('retained preexisting fixture evidence');
const eventId = hash('retained preexisting fixture event');
const runId = '11111111-2222-4333-8444-555555555555';
const retained = { schema: 'r4.fixture.retained.v1', evidenceId, material: { price: 17 }, retained: true };
const monitorInput = { url: 'https://example.com/r4-no-observation', intervalMs: 60000 };
const tables = ['schema_identity', 'tenants', 'credentials', 'monitors', 'runs', 'run_outputs', 'snapshots',
  'events', 'deliveries', 'delivery_attempts', 'source_gates'];

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'ae18-postgres-root4431-'));
  data = path.join(directory, 'data');
  const ca = path.join(directory, 'ca.pem');
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(directory, 'ca.key'),
    '-out', ca, '-days', '1', '-subj', '/CN=ROOT4431 disposable CA', '-addext', 'basicConstraints=critical,CA:TRUE']);
  await exec('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(directory, 'server.key'),
    '-out', path.join(directory, 'server.csr'), '-subj', '/CN=localhost']);
  await writeFile(path.join(directory, 'extensions'), 'subjectAltName=DNS:localhost\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n');
  await exec('openssl', ['x509', '-req', '-in', path.join(directory, 'server.csr'), '-CA', ca, '-CAkey', path.join(directory, 'ca.key'),
    '-CAcreateserial', '-out', path.join(directory, 'server.pem'), '-days', '1', '-extfile', path.join(directory, 'extensions')]);
  await chmod(ca, 0o600); await chmod(path.join(directory, 'server.key'), 0o600);
  await exec(path.join(pgBin, 'initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const number = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  await writeFile(path.join(data, 'postgresql.auto.conf'), `
listen_addresses='127.0.0.1,::1'
port=${number}
unix_socket_directories='${directory}'
ssl=on
ssl_cert_file='${directory}/server.pem'
ssl_key_file='${directory}/server.key'
shared_buffers='32MB'
work_mem='1MB'
max_connections=16
max_wal_size='64MB'
`, { mode: 0o600 });
  await exec(path.join(pgBin, 'pg_ctl'), ['-D', data, '-l', path.join(directory, 'postgres.log'), '-w', 'start']); started = true;
  env = { NODE_ENV: 'production', CORRESPONDENCE_DATABASE_URL: `postgres://postgres@localhost:${number}/postgres?sslmode=verify-full`,
    CORRESPONDENCE_PGSSL_CA_FILE: ca, MONITOR_ENABLED: '1', MONITOR_SCHEDULER: '1', MACHINE_GATEWAY_ENABLED: '0' };
  port = new PgPort({ service: 'monitor', databaseUrl: installedDatabaseUrl(env) });
  await port.migrate();
  gatewayPort = new PgPort({ service: 'gateway', databaseUrl: installedDatabaseUrl(env) });
  await gatewayPort.migrate();
  if (!baseline) {
    const { monitorSourceMembers } = await import('../monitor-manifest.mjs');
    const pin = JSON.parse(await readFile(path.join(root, 'server/foundry/activation/private-control-pin.json')));
    // Job-local candidate only. The canonical shared pin remains untouched.
    for (const name of monitorSourceMembers()) pin.files[name] = hash(await readFile(path.join(root, name)));
    sourcePinFile = path.join(directory, 'candidate-source.json');
    candidatePin = JSON.stringify(pin);
    await writeFile(sourcePinFile, candidatePin);
    const store = new PostgresMonitorStore(port);
    await store.provision({ id: 'existing-fixture', token: ownerToken, readerToken });
    await store.provision({ id: 'foreign-fixture', token: foreignToken });
    await store.provision({ id: 'expired-fixture', token: expiredToken });
    await store.provision({ id: 'revoked-fixture', token: revokedToken });
    await store.revoke('revoked-fixture');
    await port.write('UPDATE tenants SET entitlement_until=? WHERE id=?', Date.now() - 86400000, 'expired-fixture');
    const tenant = await store.authenticate(ownerToken, Date.now());
    // Fill the three lifetime slots once, then pause. These are fixture rows,
    // with retained data inserted directly; no tick or upstream request runs.
    for (let i = 0; i < 3; i++) {
      const created = await store.create(tenant, monitorInput, 'r4-existing-fixture-' + i, Date.now());
      await store.lifecycle(tenant.id, created.monitor.id, 'pause', Date.now());
      retainedId ??= created.monitor.id;
    }
    await port.write('INSERT INTO snapshots(monitor_id,evidence_id,created_at,document) VALUES(?,?,?,?)',
      retainedId, evidenceId, Date.now(), JSON.stringify(retained));
    const at = Date.now();
    await port.write(`INSERT INTO runs(id,monitor_id,slot,generation,lease_token,lease_until,phase,reserved_bytes,reserved_ms,started_at,outcome)
      VALUES(?,?,0,1,'retained-fixture',?,'finished',0,0,?,'content_changed')`, runId, retainedId, at, at);
    await port.write('INSERT INTO run_outputs(run_id,monitor_id,created_at,document) VALUES(?,?,?,?)', runId, retainedId, at, JSON.stringify(retained));
    await port.write('INSERT INTO events(id,monitor_id,created_at,document) VALUES(?,?,?,?)',
      eventId, retainedId, at, JSON.stringify({ eventId, transition: 'content_changed', fixture: true }));
    await port.write(`INSERT INTO deliveries(event_id,monitor_id,state,attempts,next_attempt,acknowledged_at,first_read_at)
      VALUES(?,?,'accepted',1,?,?,?)`, eventId, retainedId, at, at, at);
    await port.write('INSERT INTO delivery_attempts(event_id,created_at,attempt,retry_at) VALUES(?,?,1,?)', eventId, at, at);
    await port.write('UPDATE monitors SET acknowledged=1,delivery_attempts=1 WHERE id=?', retainedId);
  }
});
after(async () => {
  await port?.close(); await gatewayPort?.close();
  if (started) await exec(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']);
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function host(t, extra = {}, projection = {}) {
  const app = createSdsApp({ machineServices: { env: { ...env, ...extra }, monitorProjection: { sourcePinFile, ...projection } },
    hostedWalletMarket: { env: {} }, neomorphicContributorJourney: { env: {} }, neomorphicOpportunity: { env: {} },
    correspondence: { env: {} }, managedWatch: { env: {} }, hostedUsefulJourney: { env: {} } });
  const server = http.createServer(app), services = app.get('machineServices');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let stopped = false;
  const close = async () => {
    if (stopped) return; stopped = true;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await services.close();
  };
  t.after(close);
  return { base: `http://127.0.0.1:${server.address().port}`, services, close };
}
async function request(base, route, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(base + route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000) });
  const text = await response.text();
  let value; try { value = JSON.parse(text); } catch { /* bounded non-JSON host refusal */ }
  return { status: response.status, headers: response.headers, text, value };
}
async function snapshot() {
  const rows = {};
  for (const table of tables) rows[table] = (await port.all('SELECT * FROM ' + table)).map(row => JSON.stringify(row)).sort();
  for (const table of ['schema_identity', 'credentials', 'quotes', 'attempts', 'usage']) {
    rows['gateway.' + table] = (await gatewayPort.all('SELECT * FROM ' + table)).map(row => JSON.stringify(row)).sort();
  }
  return rows;
}
const auth = credential => ({ authorization: 'Bearer ' + credential, 'content-type': 'application/json' });
async function rawRequest(base, route, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: new URL(base).port, path: route, method,
      headers: { connection: 'close' } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject); req.setTimeout(10000, () => req.destroy(new Error('fixture_request_timeout'))); req.end();
  });
}
async function waitUntil(fn) {
  const deadline = Date.now() + 8000;
  while (!await fn()) {
    assert.ok(Date.now() < deadline, 'bounded recovery timeout');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

if (baseline) {
  test('baseline: healthy mounted PG service must advertise effective readiness separately from artifact history', async t => {
    const h = await host(t); await h.services.arm();
    const health = await request(h.base, '/api/monitor/healthz');
    const manifest = await request(h.base, '/api/monitor/v1/manifest');
    t.diagnostic(JSON.stringify({ health: health.value, manifest: manifest.value }));
    assert.equal(health.status, 200); assert.equal(health.value.persistence, 'postgres');
    assert.equal(manifest.value.runtime?.available, true, 'ready health needs an effective availability projection');
  });
  test('baseline: the advertised relative OpenAPI must be obtainable without a tenant credential', async t => {
    const h = await host(t);
    const manifest = await request(h.base, '/api/monitor/v1/manifest');
    const route = new URL(manifest.value.openapi, h.base + '/api/monitor/v1/manifest').pathname;
    const contract = await request(h.base, route), readme = await request(h.base, '/api/monitor/v1/README.md');
    t.diagnostic(JSON.stringify({ advertised: manifest.value.openapi, resolved: route, contract: contract.status, readme: readme.status }));
    assert.equal(contract.status, 200, 'credential-free exact OpenAPI acquisition');
  });
} else {
  test('mounted PG contract journey: credential-free readiness and exact machine acquisition', async t => {
    const before = await snapshot();
    const h = await host(t);
    const cold = await request(h.base, '/api/monitor/v1/manifest');
    assert.equal(cold.status, 200); assert.equal(cold.value.runtime.available, true);
    assert.equal(cold.value.runtime.observationsAvailable, false);
    assert.deepEqual(h.services.schedulerState(), { enabled: false, armed: false, nextDueAt: null });
    await h.services.arm();
    const scheduler = h.services.schedulerState();
    const health = await request(h.base, '/api/monitor/healthz'), manifest = await request(h.base, '/api/monitor/v1/manifest');
    assert.equal(health.status, 200); assert.equal(manifest.status, 200);
    assert.equal(manifest.value.runtime.available, true);
    assert.equal(manifest.value.runtime.observationsAvailable, true);
    assert.deepEqual(health.value.runtime, manifest.value.runtime);
    assert.equal(health.value.persistence, 'postgres');
    assert.equal(manifest.value.basePath, '/api/monitor/v1');
    assert.equal(manifest.value.artifact.deploymentState, 'feature-branch-not-deployed');
    assert.equal(manifest.value.deploymentState, undefined);
    assert.equal(manifest.value.source.status, 'matched');
    assert.equal(manifest.value.source.providerBuildQualified, false);
    assert.equal(manifest.value.access.entitlement, 'not-evaluated');
    assert.equal(manifest.value.access.freeLifetimeMonitors, 3);
    assert.equal(manifest.value.access.freeCapacityRenews, false);
    assert.equal(manifest.value.subscription.automaticCharge, false);
    assert.equal(manifest.value.subscription.checkout, null);
    assert.equal(manifest.value.freePath, null); assert.equal(manifest.value.publicDemo, null);
    assert.deepEqual(manifest.value.documentation, [manifest.value.openapi]);
    const contract = await request(h.base, manifest.value.openapi);
    assert.equal(contract.status, 200);
    assert.equal(contract.text, await readFile(path.join(root, 'server/vendor/continuous-monitoring/openapi.json'), 'utf8'));
    assert.equal(hash(contract.text), manifest.value.contract.sha256);
    assert.equal(Buffer.byteLength(contract.text), manifest.value.contract.bytes);
    assert.equal(contract.headers.get('content-type'), 'application/openapi+json; charset=utf-8');
    for (const response of [contract, health, manifest]) {
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    assert.equal(contract.value.servers[0].url, '/api/monitor');
    const validator = new Ajv2020({ strict: false });
    for (const [name, value] of [['MountedManifest', manifest.value], ['MountedHealth', health.value]]) {
      const validate = validator.compile({ $ref: '#/components/schemas/' + name, components: contract.value.components });
      assert.equal(validate(value), true, JSON.stringify(validate.errors));
    }
    for (const [route, entry] of Object.entries(contract.value.paths)) {
      assert.ok(route.startsWith('/'));
      if (entry.get?.security?.length === 0) assert.equal((await request(h.base, '/api/monitor' + route)).status, 200);
    }
    assert.deepEqual(h.services.schedulerState(), scheduler);
    assert.deepEqual(await snapshot(), before, 'public reads preserve every stored row, including grants and lifetime slots');
    const ssl = await port.one('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
    assert.equal(ssl.ssl, true); assert.match(ssl.version, /^TLSv1\.[23]$/);
    t.diagnostic(JSON.stringify({ rowsPreserved: Object.fromEntries(Object.entries(before).map(([name, rows]) => [name, rows.length])),
      artifactSha256: manifest.value.artifact.sha256, contractSha256: manifest.value.contract.sha256,
      source: manifest.value.source, scheduler, postgresTLS: ssl }));
  });

  test('public acquisition grants no private read, tenant write or renewed lifetime capacity', async t => {
    const h = await host(t), before = await snapshot();
    for (const method of ['GET', 'POST']) {
      const response = await request(h.base, '/api/monitor/v1/monitors', { method,
        ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: monitorInput } : {}) });
      assert.equal(response.status, 401);
    }
    const detail = '/api/monitor/v1/monitors/' + retainedId;
    for (const [credential, status] of [[undefined, 401], [foreignToken, 404], [revokedToken, 401], [readerToken, 200], [ownerToken, 200]]) {
      assert.equal((await request(h.base, detail, { headers: credential ? auth(credential) : {} })).status, status);
    }
    const read = await request(h.base, detail + '/snapshots/' + evidenceId, { headers: auth(readerToken) });
    assert.equal(read.status, 200); assert.deepEqual(read.value, retained);
    const run = await request(h.base, detail + '/runs/' + runId, { headers: auth(readerToken) });
    assert.equal(run.status, 200); assert.deepEqual(run.value, retained);
    const delivery = await request(h.base, detail + '/deliveries/' + eventId, { headers: auth(readerToken) });
    assert.equal(delivery.status, 200); assert.equal(delivery.value.delivered, true);
    assert.equal((await request(h.base, detail + '/deliveries', { headers: auth(readerToken) })).status, 403);
    for (const [credential, expected, code] of [[readerToken, 403, 'read_only_credential'],
      [expiredToken, 403, 'entitlement_expired'], [ownerToken, 409, 'tenant_monitor_limit']]) {
      const response = await request(h.base, '/api/monitor/v1/monitors', { method: 'POST',
        headers: { ...auth(credential), 'idempotency-key': 'r4-refuse-new-capacity' }, body: monitorInput });
      assert.equal(response.status, expected); assert.equal(response.value.error, code);
    }
    assert.equal((await request(h.base, detail + '/resume', { method: 'POST', headers: auth(readerToken), body: {} })).status, 403);
    assert.deepEqual(await snapshot(), before);
    assert.equal(h.services.schedulerState().enabled, false);
  });

  test('wrong routes, traversal, malformed paths, methods, origins and queries expose no document or private material', async t => {
    const h = await host(t), before = await snapshot();
    const sentinel = 'ROOT4431_PRIVATE_FILE_SENTINEL';
    await writeFile(path.join(directory, 'PRIVATE.md'), sentinel, { mode: 0o600 });
    const paths = ['/api/monitor/v1/openapi.json', '/api/monitor/v1/README.md', '/api/monitor/README.md',
      '/api/monitor/docs/OPERATIONS.md', '/api/monitor/docs/LAUNCH-INTEGRATION.md', '/api/monitor/unknown.json',
      '/api/monitor/openapi.json/extra', '/api/monitor/%6fpenapi.json', '/api/monitor/./openapi.json',
      '/api/monitor/v1/../openapi.json', '/api/monitor/%2e%2e/openapi.json', '/api/monitor/%2e/openapi.json',
      '/api/monitor/..%2fopenapi.json', '/api/monitor/%252e%252e/README.md', '/api/monitor/..\\openapi.json',
      '/api/monitor/%00openapi.json', '/api/monitor/%', '/api/monitor//openapi.json',
      '/api/monitor2/openapi.json', '/api/monitoring/openapi.json', '/api/continuous-monitoring/openapi.json',
      '/api/monitor/../../' + directory.slice(1) + '/PRIVATE.md'];
    for (const route of paths) {
      const response = await rawRequest(h.base, route);
      assert.ok(response.status >= 400, route + ': ' + response.status);
      assert.ok(response.text.length < 4096, route);
      assert.ok(!response.text.includes(sentinel) && !response.text.includes(ownerToken) && !response.text.includes('BEGIN PRIVATE KEY'), route);
    }
    for (const route of ['/healthz', '/v1/manifest', '/openapi.json']) {
      for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        const response = await rawRequest(h.base, '/api/monitor' + route, method);
        assert.equal(response.status, 405, method + ' ' + route);
      }
      for (const query of ['?x=1', '?limit=1', '?after=0&after=1', '?file=../../PRIVATE.md', '?']) {
        assert.equal((await rawRequest(h.base, '/api/monitor' + route + query)).status, 400);
      }
      assert.equal((await request(h.base, '/api/monitor' + route, { headers: { origin: 'https://foreign.example' } })).status, 403);
    }
    assert.deepEqual(await snapshot(), before);
  });

  test('disabled, missing or invalid PG/config and unsupported stores cannot advertise ready', async t => {
    const before = await snapshot();
    for (const extra of [{ MONITOR_ENABLED: '0' }, { MONITOR_ENABLED: 'invalid' },
      { CORRESPONDENCE_DATABASE_URL: undefined }, { MONITOR_STORE: 'sqlite' },
      { CORRESPONDENCE_DATABASE_URL: env.CORRESPONDENCE_DATABASE_URL.replace('verify-full', 'require') },
      { MONITOR_RUNTIME_FILE: path.join(directory, 'missing-runtime.json') }]) {
      const h = await host(t, extra);
      const manifest = await request(h.base, '/api/monitor/v1/manifest');
      assert.equal(manifest.status, 503); assert.equal(manifest.value.runtime.available, false);
      assert.equal(manifest.value.runtime.observationsAvailable, false);
      assert.equal(manifest.value.openapi, null); assert.equal(manifest.value.contract, null);
      assert.equal((await request(h.base, '/api/monitor/healthz')).value.ok, false);
      assert.equal((await request(h.base, '/api/monitor/openapi.json')).status, 503);
      assert.equal(h.services.schedulerState().enabled, false);
      await h.close();
    }
    assert.deepEqual(await snapshot(), before);
  });

  test('missing/stale source evidence refuses availability; original evidence recovers without scheduler or grant', async t => {
    const before = await snapshot(), h = await host(t);
    const initial = await request(h.base, '/api/monitor/v1/manifest');
    const source = JSON.parse(candidatePin);
    for (const broken of [undefined, '{}', '{', JSON.stringify({ ...source, files: { ...source.files,
      'server/lib/machine-services/mount.mjs': '0'.repeat(64) } }), JSON.stringify({ ...source,
      candidate: { deployed: true, available: true }, files: {} })]) {
      if (broken === undefined) await rm(sourcePinFile); else await writeFile(sourcePinFile, broken);
      const manifest = await request(h.base, '/api/monitor/v1/manifest');
      assert.equal(manifest.status, 503); assert.equal(manifest.value.runtime.available, false);
      assert.equal(manifest.value.source.status, 'unverified');
      assert.equal(manifest.value.source.providerBuildQualified, false);
      assert.deepEqual(manifest.value.artifact, initial.value.artifact);
      assert.equal(manifest.value.openapi, null);
      assert.equal((await request(h.base, '/api/monitor/openapi.json')).status, 503);
    }
    await writeFile(sourcePinFile, candidatePin);
    const recovered = await request(h.base, '/api/monitor/v1/manifest');
    assert.equal(recovered.status, 200); assert.deepEqual(recovered.value, initial.value);
    assert.deepEqual(await snapshot(), before); assert.equal(h.services.schedulerState().enabled, false);
    await h.close();
    // The predecessor's canonical evidence cannot qualify a successor. Keep
    // this control independent of Root's eventual combined pin regeneration.
    const predecessorPin = path.join(directory, 'predecessor-pin.json');
    const old = await exec('git', ['show', '79fbd37d31aabdc790248443c576a2f0017e55f0:server/foundry/activation/private-control-pin.json'], { cwd: root });
    await writeFile(predecessorPin, old.stdout);
    const predecessor = await host(t, {}, { sourcePinFile: predecessorPin });
    assert.equal((await request(predecessor.base, '/api/monitor/v1/manifest')).value.source.status, 'unverified');
  });

  test('real PG outage and recovery retain one scheduler, store, grants, slots and exact restart contract', async t => {
    const before = await snapshot();
    await exec(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
    const h = await host(t);
    await assert.rejects(h.services.arm(), /monitor_unavailable/);
    const unavailable = await request(h.base, '/api/monitor/v1/manifest');
    assert.equal(unavailable.status, 503); assert.equal(unavailable.value.runtime.available, false);
    await exec(path.join(pgBin, 'pg_ctl'), ['-D', data, '-l', path.join(directory, 'postgres.log'), '-w', 'start']); started = true;
    await waitUntil(async () => (await request(h.base, '/api/monitor/v1/manifest')).value.runtime.observationsAvailable);
    const ready = await request(h.base, '/api/monitor/v1/manifest');
    const store = (await h.services.ready('monitor')).store;
    const firstContract = await request(h.base, ready.value.openapi);
    assert.equal(ready.value.runtime.available, true); assert.deepEqual(ready.value.artifact, unavailable.value.artifact);
    const scheduler = h.services.schedulerState();
    await exec(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop']); started = false;
    const down = await request(h.base, '/api/monitor/v1/manifest');
    assert.equal(down.status, 503); assert.equal(down.value.runtime.available, false);
    assert.equal((await request(h.base, '/api/monitor/healthz')).value.ok, false);
    await exec(path.join(pgBin, 'pg_ctl'), ['-D', data, '-l', path.join(directory, 'postgres.log'), '-w', 'start']); started = true;
    await waitUntil(async () => (await request(h.base, '/api/monitor/v1/manifest')).value.runtime.available);
    assert.equal((await h.services.ready('monitor')).store, store);
    assert.deepEqual(h.services.schedulerState(), scheduler);
    assert.deepEqual((await request(h.base, '/api/monitor/v1/manifest')).value, ready.value);
    assert.deepEqual(await snapshot(), before);
    await h.close();
    const restarted = await host(t);
    const contract = await request(restarted.base, '/api/monitor/openapi.json');
    assert.equal(contract.status, 200); assert.equal(contract.text, firstContract.text);
    assert.equal((await request(restarted.base, '/api/monitor/v1/manifest')).value.contract.sha256, hash(firstContract.text));
    assert.deepEqual(await snapshot(), before);
    assert.equal(restarted.services.schedulerState().enabled, false);
  });

  test('fresh schema identity is required even after a healthy store was cached', async t => {
    const h = await host(t), before = await snapshot();
    assert.equal((await request(h.base, '/api/monitor/healthz')).status, 200);
    await port.write("UPDATE schema_identity SET identity='foreign'");
    try {
      assert.equal((await request(h.base, '/api/monitor/healthz')).status, 503);
      assert.equal((await request(h.base, '/api/monitor/v1/manifest')).value.runtime.available, false);
      assert.equal((await request(h.base, '/api/monitor/openapi.json')).status, 503);
    } finally { await port.write("UPDATE schema_identity SET identity='sds.continuous-monitoring.pg.v1'"); }
    assert.equal((await request(h.base, '/api/monitor/healthz')).status, 200);
    assert.deepEqual(await snapshot(), before);
  });

  for (const boundary of ['close', 'source']) test(`${boundary} change during an actual blocked PG readiness query cannot retain availability`, async t => {
    const h = await host(t), before = await snapshot();
    assert.equal((await request(h.base, '/api/monitor/healthz')).status, 200);
    const state = await h.services.ready('monitor');
    const pid = (await state.store.one('SELECT pg_backend_pid() pid')).pid;
    const lock = await port.pool.connect();
    let pending, closing;
    try {
      await lock.query('BEGIN');
      await lock.query('LOCK TABLE pilot_monitor.schema_identity IN ACCESS EXCLUSIVE MODE');
      pending = request(h.base, '/api/monitor/v1/manifest');
      await waitUntil(async () => (await port.one('SELECT wait_event_type FROM pg_stat_activity WHERE pid=?', pid))?.wait_event_type === 'Lock');
      if (boundary === 'close') closing = h.services.close();
      else await rm(sourcePinFile);
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    const response = await pending;
    assert.equal(response.status, 503);
    assert.equal(response.value.runtime.available, false);
    if (boundary === 'close') {
      assert.equal(response.value.runtime.mounted, false);
      await closing;
      assert.equal((await request(h.base, '/api/monitor/healthz')).status, 503);
    } else {
      assert.equal(response.value.source.status, 'unverified');
      await writeFile(sourcePinFile, candidatePin);
      assert.equal((await request(h.base, '/api/monitor/healthz')).status, 200);
    }
    assert.deepEqual(await snapshot(), before);
  });

  test('cold exact source: missing files, inconsistent contracts, links and repinned unloaded bytes fail closed', async t => {
    const before = await snapshot();
    const cold = path.join(directory, 'cold-source'); await mkdir(cold);
    const archive = path.join(directory, 'source.tar');
    await exec('git', ['archive', '--format=tar', '-o', archive, 'HEAD'], { cwd: root });
    await exec('tar', ['-xf', archive, '-C', cold]);
    for (const name of ['server/lib/machine-services/mount.mjs', 'server/lib/machine-services/monitor-manifest.mjs',
      'server/vendor/continuous-monitoring/src/api.mjs', 'server/vendor/continuous-monitoring/openapi.json']) {
      await cp(path.join(root, name), path.join(cold, name));
    }
    const pin = path.join(cold, 'server/foundry/activation/private-control-pin.json');
    const contract = path.join(cold, 'server/vendor/continuous-monitoring/openapi.json');
    const artifact = path.join(cold, 'server/vendor/continuous-monitoring/machine-manifest.json');
    const original = await readFile(contract), artifactBytes = await readFile(artifact);
    await writeFile(pin, candidatePin);
    await symlink(path.join(root, 'node_modules'), path.join(cold, 'node_modules'), 'dir');
    const input = path.join(directory, 'cold-input.json'); await writeFile(input, JSON.stringify({ root: cold, env }), { mode: 0o600 });
    const childScript = path.join(root, 'docs/receiving/r4-monitor-contract/cold-server.mjs');
    async function boot() {
      const child = spawn(process.execPath, [childScript, input], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        env: { PATH: process.env.PATH, NODE_OPTIONS: '--max-old-space-size=384' } });
      let errors = ''; child.stderr.on('data', bytes => { errors = (errors + bytes).slice(-3000); });
      let stopped = false;
      const close = async () => {
        if (stopped) return; stopped = true;
        const exited = once(child, 'exit'); child.send('close');
        const [code] = await exited; assert.equal(code, 0, errors);
      };
      t.after(close);
      const message = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('cold source startup timeout')); }, 10000);
        child.once('message', value => { clearTimeout(timer); resolve(value); });
        child.once('exit', () => { clearTimeout(timer); reject(new Error('cold source startup failure: ' + errors)); });
      });
      return { base: 'http://127.0.0.1:' + message.port, close };
    }
    async function refuses(h) {
      const manifest = await request(h.base, '/api/monitor/v1/manifest');
      assert.equal(manifest.status, 503); assert.equal(manifest.value.runtime.available, false);
      assert.equal(manifest.value.source.status, 'unverified');
      assert.equal((await request(h.base, '/api/monitor/openapi.json')).status, 503);
      return manifest.value;
    }
    let h = await boot();
    assert.equal((await request(h.base, '/api/monitor/openapi.json')).text, original.toString());
    await rm(contract); await refuses(h);
    await writeFile(contract, original);
    assert.equal((await request(h.base, '/api/monitor/openapi.json')).status, 200);
    // Repinning changed bytes cannot qualify code/contracts this process did not load.
    const badDocument = JSON.parse(original); badDocument.servers[0].url = 'https://foreign.invalid';
    const foreignBytes = JSON.stringify(badDocument);
    const repin = JSON.parse(candidatePin); repin.files['server/vendor/continuous-monitoring/openapi.json'] = hash(foreignBytes);
    await writeFile(contract, foreignBytes); await writeFile(pin, JSON.stringify(repin));
    await refuses(h); await h.close();
    h = await boot(); await refuses(h); await h.close();
    for (const mutate of [document => { document.info.version = '0.0.0-stale'; },
      document => { delete document.paths['/openapi.json']; },
      document => { document.security = []; },
      document => { document.paths['/v1/monitors'].post.security = []; }]) {
      const document = JSON.parse(original); mutate(document);
      const bytes = JSON.stringify(document), pinValue = JSON.parse(candidatePin);
      pinValue.files['server/vendor/continuous-monitoring/openapi.json'] = hash(bytes);
      await writeFile(contract, bytes); await writeFile(pin, JSON.stringify(pinValue));
      h = await boot(); await refuses(h); await h.close();
    }
    // Missing contract on a cold boot reports unavailable, including after restore
    // until a restart binds the actual loaded closure.
    await rm(contract); await writeFile(pin, candidatePin);
    h = await boot(); await refuses(h);
    await writeFile(contract, original); await refuses(h); await h.close();
    await rm(artifact); h = await boot();
    assert.equal((await refuses(h)).artifact, null); await h.close();
    await writeFile(artifact, artifactBytes);
    // A linked document cannot publish the target, even if its hash is in a pin.
    const secret = path.join(directory, 'private-document.json'), sentinel = 'ROOT4431_DO_NOT_EXPORT_PRIVATE_FILE';
    await writeFile(secret, JSON.stringify({ secret: sentinel }), { mode: 0o600 });
    await rm(contract); await symlink(secret, contract);
    h = await boot(); const refused = await refuses(h);
    assert.ok(!JSON.stringify(refused).includes(sentinel)); await h.close();
    await rm(contract); await writeFile(contract, original);
    h = await boot();
    const recovered = await request(h.base, '/api/monitor/openapi.json');
    assert.equal(recovered.status, 200); assert.equal(recovered.text, original.toString());
    await h.close();
    assert.deepEqual(await snapshot(), before);
  });

  test('paid-disabled gateway discovery and its stored authority remain intact', async t => {
    const file = path.join(directory, 'gateway-tenants.json');
    await writeFile(file, JSON.stringify({ tenants: [{ id: 'r4-existing-gateway', tokenSha256: hash('r4-unused-gateway-token'),
      routes: ['lockfile.delta'], maxCalls: 1, maxUnits: 0, maxConcurrent: 1 }] }), { mode: 0o600 });
    const before = await snapshot(), h = await host(t, { MACHINE_GATEWAY_ENABLED: '1', MACHINE_GATEWAY_PAYMENTS_ENABLED: '0', MACHINE_GATEWAY_TENANTS_FILE: file });
    const health = await request(h.base, '/api/machine-gateway/healthz');
    assert.equal(health.status, 200); assert.equal(health.value.paymentsEnabled, false); assert.equal(health.value.persistence, 'postgres');
    const discover = await request(h.base, '/api/machine-gateway/v1/discover');
    assert.equal(discover.status, 200);
    assert.deepEqual(await snapshot(), before);
  });
}
