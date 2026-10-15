// AE21 U2 negative controls: SDS mounts url.extract.* on the enrolled async
// Postgres with the Helm-vendored G4 extraction kernel. Every test below FAILS
// on samedaydesk daa3bdee with only this file added (red) and PASSES with the
// U2 change (green). Modules under change are imported lazily inside each test
// so each control fails on its own assertion instead of one module-load error.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { once } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, cp, appendFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { install } from '../install.mjs';
import { installedDatabaseUrl } from '../postgres.mjs';
import { mountMachineServices } from '../mount.mjs';
import { sha256 } from '../../../vendor/machine-gateway/src/util.mjs';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const directory = process.env.AE18_FIXTURE_DIR;
assert.ok(directory?.startsWith('/tmp/ae18-postgres-'), 'run through the owned disposable Postgres fixture');
const ROUTES = ['url.extract.submit', 'url.extract.poll', 'url.extract.result'];
const tokenA = 'u2_fixture_tenant_a_00000000000000000000001', tokenB = 'u2_fixture_tenant_b_00000000000000000000001';
const tenantsFile = path.join(directory, 'u2-tenants.json'), bindingFile = path.join(directory, 'u2-url-extract.json');
const base = { NODE_ENV: 'production', CORRESPONDENCE_DATABASE_URL: process.env.AE18_FIXTURE_DATABASE_URL,
  CORRESPONDENCE_PGSSL_CA_FILE: process.env.AE18_FIXTURE_CA_FILE,
  MACHINE_GATEWAY_ENABLED: '1', MACHINE_GATEWAY_PAYMENTS_ENABLED: '0', MONITOR_ENABLED: '1', MONITOR_SCHEDULER: '0',
  MACHINE_GATEWAY_TENANTS_FILE: tenantsFile };
const env = { ...base, MACHINE_GATEWAY_URL_EXTRACT_FILE: bindingFile };
const LOOPBACK = 'http://127.0.0.1:9/u2-private';
let admin;

before(async () => {
  await writeFile(tenantsFile, JSON.stringify({ tenants: [tokenA, tokenB].map((value, index) => ({ id: 'tenant-' + index,
    tokenSha256: sha256(value), routes: ROUTES, maxCalls: 64, maxUnits: 0, maxConcurrent: 1 })) }), { mode: 0o600 });
  await writeFile(bindingFile, JSON.stringify({ schema: 'ae19_paid_continuation', tenantId: 'sds-u2', actorId: 'sds-gateway' }), { mode: 0o600 });
  await install(['migrate'], env); // provisioning step; serving never migrates
  admin = new pg.Pool({ connectionString: installedDatabaseUrl(base), max: 1 });
  admin.on('error', () => {});
});
after(async () => { await admin?.end(); });

async function listen(t, server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
async function mounted(t, extra = {}) {
  const app = express();
  const services = mountMachineServices(app, { env: { ...env, ...extra } });
  t.after(() => services.close());
  return { services, base: await listen(t, http.createServer(app)) };
}
async function coldHost(t, extra = {}) {
  const child = spawn(process.execPath, ['--import', path.join(here, 'entry-preload.mjs'), 'server/index.js'], {
    cwd: repoRoot, env: { PATH: process.env.PATH, PORT: '0', ...env, ...extra }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let errors = ''; child.stderr.on('data', value => { errors = (errors + value).slice(-3000); });
  const message = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('cold host timeout')), 8000);
    child.once('message', value => { clearTimeout(timeout); resolve(value); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('cold host failed: ' + errors)); });
  });
  let stopped = false;
  const close = async () => { if (stopped) return; stopped = true; const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; };
  t.after(close);
  return { base: `http://127.0.0.1:${message.port}`, close };
}
async function request(origin, route, { body, credential = tokenA, key } = {}) {
  const response = await fetch(origin + route, { method: body === undefined ? 'GET' : 'POST', headers: {
    authorization: `Bearer ${credential}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(key ? { 'idempotency-key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { status: response.status, body: parsed };
}
let keys = 0;
async function call(origin, routeId, input, credential = tokenA) {
  const quote = await request(origin, '/api/machine-gateway/v1/quote', { body: { routeId, input }, credential });
  assert.equal(quote.status, 200, `quote ${routeId}: ${JSON.stringify(quote.body)}`);
  const key = `u2exec${String(process.pid).padStart(8, '0')}${String(++keys).padStart(6, '0')}`;
  return (await request(origin, '/api/machine-gateway/v1/execute', { credential,
    body: { quoteId: quote.body.quoteId, input, maxUnits: 0 }, key })).body;
}
const errorCode = receipt => receipt?.error?.code ?? null;
const submitInput = key => ({ url: LOOPBACK, idempotencyKey: key });

test('NC1 url.extract.* is mounted and discoverable on the SDS gateway', async t => {
  const host = await mounted(t);
  const discover = await request(host.base, '/api/machine-gateway/v1/discover');
  assert.equal(discover.status, 200);
  for (const id of ROUTES) assert.ok(JSON.stringify(discover.body).includes(`"${id}"`), `${id} discoverable`);
  assert.equal((await request(host.base, '/api/machine-gateway/v1/routes/url.extract.submit/input.schema.json')).status, 200);
  const receipt = await call(host.base, 'url.extract.submit', submitInput('u2-nc1-loopback'));
  assert.equal(receipt.status, 'completed', JSON.stringify(receipt));
  assert.match(receipt.output.jobId, /^j[a-f0-9]{32}$/);
  assert.equal(receipt.output.state, 'no_fit'); // SSRF/fit refuses loopback before any fetch
  assert.equal(receipt.output.attempts, 0);
  assert.equal(receipt.output.paymentAttempts, 0);
});

test('NC2 a job persisted in Postgres survives a process restart (same jobId, digest, one row)', async t => {
  const first = await coldHost(t);
  const submitted = await call(first.base, 'url.extract.submit', submitInput('u2-nc2-restart'));
  assert.equal(submitted.status, 'completed', JSON.stringify(submitted));
  const { jobId } = submitted.output;
  await first.close();
  const second = await coldHost(t);
  const read = await call(second.base, 'url.extract.result', { jobId });
  assert.equal(read.status, 'completed', JSON.stringify(read));
  assert.equal(read.output.jobId, jobId);
  assert.equal(read.output.state, submitted.output.state);
  assert.equal(read.output.digest, submitted.output.digest);
  const again = await call(second.base, 'url.extract.submit', submitInput('u2-nc2-restart'));
  assert.equal(again.output.jobId, jobId, 'idempotent replay after restart');
  const rows = await admin.query('SELECT tenant_id FROM ae19_paid_continuation.extraction_job WHERE job_id=$1', [jobId]);
  assert.deepEqual(rows.rows, [{ tenant_id: 'sds-u2:tenant-0' }], 'tenant passed through as binding:gatewayTenant (U1)');
});

test('NC3 a cross-tenant read is refused', async t => {
  const host = await mounted(t);
  const owned = await call(host.base, 'url.extract.submit', submitInput('u2-nc3-owner'));
  assert.equal(owned.status, 'completed', JSON.stringify(owned));
  for (const routeId of ['url.extract.poll', 'url.extract.result']) {
    const foreign = await call(host.base, routeId, { jobId: owned.output.jobId }, tokenB);
    assert.equal(foreign.status, 'failed');
    assert.equal(errorCode(foreign), 'e08_job_forbidden');
    assert.equal(foreign.output, null);
  }
  const mine = await call(host.base, 'url.extract.result', { jobId: owned.output.jobId });
  assert.equal(mine.output.jobId, owned.output.jobId);
});

test('NC4 a missing env name fails closed with a named error; the env packet is one coherent set', async t => {
  // (a) No binding name: url.extract.* refuse with url_extract_unbound, gateway still serves.
  const unbound = await mounted(t, { MACHINE_GATEWAY_URL_EXTRACT_FILE: undefined });
  assert.equal((await request(unbound.base, '/api/machine-gateway/healthz')).status, 200);
  const refused = await call(unbound.base, 'url.extract.submit', submitInput('u2-nc4-unbound'));
  assert.equal(refused.status, 'failed'); assert.equal(errorCode(refused), 'url_extract_unbound');
  const { openExtractionService } = await import('../extraction.mjs');
  // (b) Named file absent, (c) database name absent, (d) extra key, (e) schema not provisioned.
  await assert.rejects(openExtractionService({ ...env, MACHINE_GATEWAY_URL_EXTRACT_FILE: path.join(directory, 'absent.json') }), { message: 'url_extract_binding_missing' });
  await assert.rejects(openExtractionService({ ...env, CORRESPONDENCE_DATABASE_URL: undefined }), { message: 'machine_database_unconfigured' });
  const extra = path.join(directory, 'u2-extra.json');
  await writeFile(extra, JSON.stringify({ schema: 'ae19_paid_continuation', tenantId: 'a', actorId: 'b', merchantRoot: '/tmp' }), { mode: 0o600 });
  await assert.rejects(openExtractionService({ ...env, MACHINE_GATEWAY_URL_EXTRACT_FILE: extra }), { message: 'invalid_url_extract_binding' });
  await admin.query('DROP DATABASE IF EXISTS u2_unprovisioned'); await admin.query('CREATE DATABASE u2_unprovisioned');
  const empty = new URL(base.CORRESPONDENCE_DATABASE_URL); empty.pathname = '/u2_unprovisioned';
  await assert.rejects(openExtractionService({ ...env, CORRESPONDENCE_DATABASE_URL: empty.href }), { message: 'url_extract_schema_absent' });
  const probe = new pg.Pool({ connectionString: installedDatabaseUrl({ ...base, CORRESPONDENCE_DATABASE_URL: empty.href }), max: 1 });
  assert.equal((await probe.query("SELECT count(*)::int n FROM information_schema.schemata WHERE schema_name='ae19_paid_continuation'")).rows[0].n, 0, 'serving never migrates');
  await probe.end();
  // (f) J-C: every deploy/inputs/*.names entry is a name in env.keys and the packet admits the new names.
  const names = file => readFile(path.join(here, '..', 'deploy', file), 'utf8')
    .then(text => text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')));
  const keysList = new Set(await names('env.keys'));
  for (const file of ['inputs/gateway.env.names', 'inputs/monitor.env.names']) {
    for (const name of await names(file)) assert.ok(/^[A-Z_][A-Z0-9_]*$/.test(name) && keysList.has(name), `${file}: ${name} not in env.keys`);
  }
  for (const name of ['MACHINE_GATEWAY_URL_EXTRACT_FILE', 'MACHINE_GATEWAY_URL_EXTRACT_JSON']) assert.ok(keysList.has(name), name);
  const { prepareMachineEnvironment } = await import('../deploy/environment-packet.mjs');
  const packet = prepareMachineEnvironment({ existing: [{ key: 'KEEP', value: 'x' }], listed: [{ key: 'KEEP' }],
    overlay: [{ key: 'MACHINE_GATEWAY_URL_EXTRACT_JSON', value: '{"tenantId":"a","actorId":"b"}' }] });
  assert.equal(packet.receipt.machineKeys, 1);
  // (g) The N2 continuous-monitoring deploy/runtime.example.json is accepted (mapped, not refused).
  const n2 = path.join(directory, 'u2-n2-runtime.json');
  await writeFile(n2, JSON.stringify({ database: '/var/lib/neomorphic-monitor/monitor.sqlite', host: '127.0.0.1', port: 8791,
    options: { maxMonitors: 200, maxTick: 10 } }), { mode: 0o600 });
  const { monitorOptions } = await import('../mount.mjs');
  assert.doesNotThrow(() => monitorOptions({ MONITOR_RUNTIME_FILE: n2 }));
  const bad = path.join(directory, 'u2-n2-bad.json');
  await writeFile(bad, JSON.stringify({ database: 7 }), { mode: 0o600 });
  assert.throws(() => monitorOptions({ MONITOR_RUNTIME_FILE: bad }), { message: 'invalid_monitor_runtime' });
});

test('NC5 the vendor script refuses a tampered vendored file (git blob mismatch)', async t => {
  const vendor = path.join(repoRoot, 'server/vendor/url-extract');
  const script = path.join(vendor, 'vendor-url-extract.sh');
  assert.ok(existsSync(script), 'vendored url-extract with its verify script');
  const ok = await exec('bash', [script, '--verify', vendor]);
  assert.match(ok.stdout, /verified 10 vendored files/);
  const copy = await mkdtemp(path.join(directory, 'u2-vendor-'));
  t.after(() => rm(copy, { recursive: true, force: true }));
  await cp(vendor, copy, { recursive: true });
  await appendFile(path.join(copy, 'extract-batch-c1/url-guard.mjs'), '\n// tampered\n');
  await assert.rejects(exec('bash', [script, '--verify', copy]), error => error.code === 1 && /blob mismatch extract-batch-c1\/url-guard\.mjs/.test(error.stderr));
  const extra = await mkdtemp(path.join(directory, 'u2-vendor-extra-'));
  t.after(() => rm(extra, { recursive: true, force: true }));
  await cp(vendor, extra, { recursive: true });
  await writeFile(path.join(extra, 'smuggled.mjs'), 'export {};\n');
  await assert.rejects(exec('bash', [script, '--verify', extra]), error => error.code === 1 && /vendor_file_unlisted smuggled\.mjs/.test(error.stderr));
  const source = JSON.parse(await readFile(path.join(vendor, 'SOURCE.json'), 'utf8'));
  assert.equal(source.commit, '6dd7a040f80f3e3ce1d914383172721751de59a2');
  const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@exodus/bytes'], '1.16.0');
});

test('NC6 a closed extraction pool makes url.extract calls fail cleanly; lifecycle follows the store', async t => {
  const unhandled = []; const onUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled); t.after(() => process.off('unhandledRejection', onUnhandled));
  const { openExtractionService } = await import('../extraction.mjs');
  const { bindUrlExtractService, unbindUrlExtractService } = await import('../../../vendor/machine-gateway/src/url-extract-routes.mjs');
  const { builtinRoutes } = await import('../../../vendor/machine-gateway/src/providers.mjs');
  const route = id => builtinRoutes().find(value => value.id === id);
  const handle = await openExtractionService(env);
  const bound = bindUrlExtractService(handle);
  t.after(() => unbindUrlExtractService(bound));
  const view = await route('url.extract.submit').run(submitInput('u2-nc6-before-close'), { tenantId: 'tenant-0' });
  assert.equal(view.state, 'no_fit');
  await handle.close();
  assert.equal(handle.closed, true);
  for (const [id, input] of [['url.extract.submit', submitInput('u2-nc6-after-close')], ['url.extract.result', { jobId: view.jobId }]]) {
    await assert.rejects(route(id).run(input, { tenantId: 'tenant-0' }), error => error.code === 'url_extract_store_closed' && error.status === 503);
  }
  await handle.close(); // idempotent
  // Mounted lifecycle: closing the services closes the extraction pool and unbinds the routes.
  const host = await mounted(t);
  const mountedReceipt = await call(host.base, 'url.extract.submit', submitInput('u2-nc6-mounted'));
  assert.equal(mountedReceipt.status, 'completed', JSON.stringify(mountedReceipt));
  await host.services.close();
  await assert.rejects(route('url.extract.submit').run(submitInput('u2-nc6-after-services-close'), { tenantId: 'tenant-0' }),
    error => error.code === 'url_extract_unbound' && error.status === 503);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unhandled, []);
});
