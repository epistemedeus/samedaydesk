import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod, link, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MonitorStore } from '../src/store.mjs';
import { tick } from '../src/worker.mjs';
import { normalize } from '../src/observation.mjs';
import { runtimeOptions } from '../src/config.mjs';
import { harness } from './harness.mjs';

test('cancel committed between dispatch claim and HTTP entry prevents the source request', async t => {
  const app = await harness(); t.after(() => app.close());
  const created = await app.create({ intervalMs: 5000 });
  const id = created.body.monitor.id, store = app.open(); t.after(() => store.close());
  await tick(store, { afterStart: async () => {
    const cancel = await app.api(`/v1/monitors/${id}/cancel`, { method: 'POST', body: {} });
    assert.equal(cancel.status, 200);
  } });
  assert.equal(app.state.requests, 0);
  assert.equal(store.owned('customer', id).initial_evidence, null);
});

test('revocation fences an old claim even when the tenant is regranted before the next tick', async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create()).body.monitor.id;
  const store = app.open(); t.after(() => store.close());
  const claim = store.claim(Date.now());
  store.revoke('customer');
  store.provision({ id: 'customer', token: app.token, readerToken: app.readerToken });
  assert.equal(store.start(claim, Date.now()), false);
  assert.equal(store.owned('customer', id).status, 'expired');
});

test('upstream failure strings never enter notification or run output', async t => {
  const sentinel = 'private_upstream_failure_payload_fixture';
  const app = await harness({ originHandler: (_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'source_failure', fetchFailure: { code: sentinel } }));
  } }); t.after(() => app.close());
  const id = (await app.create({ mode: 'observatory', sourceId: 'moltjobs', pointers: undefined })).body.monitor.id;
  await app.tick();
  const events = (await app.api(`/v1/monitors/${id}/events`)).body.events;
  const runs = (await app.api(`/v1/monitors/${id}/runs`)).body.runs;
  assert.equal(events[0].transition, 'evidence_unavailable');
  assert.equal(events[0].failureCode, 'source_unreachable');
  assert.equal(JSON.stringify({ events, runs }).includes(sentinel), false);
});

test('malformed Observatory structures produce unavailable evidence instead of crashing the worker', async t => {
  const app = await harness({ originHandler: (_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ projectionId: 'agent-economy-observatory.source-projection', sources: [{
      sourceId: 'moltjobs', availability: 'available', freshness: { state: 'fresh' },
      coverage: { state: 'covered', presentPopulations: [{ toString: null }, { toString: null }] },
      metrics: [{ key: 'count', value: 1, state: 'ok' }],
    }] }));
  } }); t.after(() => app.close());
  const id = (await app.create({ mode: 'observatory', sourceId: 'moltjobs', pointers: undefined })).body.monitor.id;
  const run = await app.tick();
  assert.deepEqual(run.outcomes, ['evidence_unavailable']);
  const events = (await app.api(`/v1/monitors/${id}/events`)).body.events;
  assert.equal(events[0].failureCode, 'unsafe_material');
  assert.equal(events[0].after, null);
});

test('monitor initialization refuses foreign databases without modifying their contents', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'monitor-foreign-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'other.sqlite');
  const foreign = new DatabaseSync(file); foreign.exec('CREATE TABLE unrelated(value TEXT)'); foreign.close();
  await chmod(file, 0o600);
  const before = await readFile(file);
  assert.throws(() => { const store = new MonitorStore(file); store.close(); }, /foreign/);
  assert.deepEqual(await readFile(file), before);
});

test('monitor state refuses hard links, shared directories and symlinked parent paths', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'monitor-path-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'monitor.sqlite'), store = new MonitorStore(file); store.close();
  const alias = path.join(directory, 'hard.sqlite'); await link(file, alias);
  assert.throws(() => { const opened = new MonitorStore(file); opened.close(); }, /private|link/);
  await rm(alias);
  await chmod(directory, 0o755);
  assert.throws(() => { const opened = new MonitorStore(file); opened.close(); }, /private/);
  await chmod(directory, 0o700);
  const parentAlias = `${directory}-alias`;
  await symlink(directory, parentAlias); t.after(() => rm(parentAlias));
  assert.throws(() => { const opened = new MonitorStore(path.join(parentAlias, 'monitor.sqlite')); opened.close(); }, /canonical|private/);
});

test('missing and duplicate Observatory metrics cannot establish a comparable baseline', () => {
  const config = { mode: 'observatory', sourceId: 'moltjobs', scopeKey: 'receiving' };
  const metric = { key: 'completedCount', value: 2, state: 'ok' };
  for (const [metrics, code] of [[[{ ...metric, value: null }], 'partial_metrics'],
    [[metric, { ...metric, value: 3 }], 'metrics_unreadable'], [[], 'partial_metrics']]) {
    const document = { schemaVersion: 'pilot.external-observatory.v1', sourceId: 'moltjobs',
      availability: 'available', coverage: { comparable: true, status: 'complete' }, metrics };
    const observation = normalize(config, { status: 200, headers: {}, body: Buffer.from(JSON.stringify(document)) }, Date.now());
    assert.equal(observation.evidenceClass, 'source_failure');
    assert.equal(observation.material, null);
    assert.equal(observation.failureCode, code);
  }
});

test('runtime arithmetic refuses coercible strings and non-finite cadence or lease values', () => {
  for (const input of [{ minIntervalMs: Infinity }, { sourceCooldownMs: '60000' },
    { originCooldownMs: Infinity }, { leaseSlackMs: '5000' }]) assert.throws(() => runtimeOptions(input));
});

test('an unchanged legacy monitor database is adopted with its WAL history intact', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'monitor-legacy-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'monitor.sqlite');
  const legacy = new DatabaseSync(file);
  legacy.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  legacy.exec(await readFile(new URL('../migrations/001.sql', import.meta.url), 'utf8'));
  legacy.prepare('INSERT INTO tenants(id,plan,entitlement_until,checks) VALUES(?,?,?,?)').run('legacy', 'free', Date.now() + 60000, 17);
  await chmod(file, 0o600);
  const store = new MonitorStore(file); t.after(() => store.close()); t.after(() => legacy.close());
  assert.notEqual(store.one('PRAGMA application_id').application_id, 0);
  assert.equal(store.one('PRAGMA user_version').user_version, 1);
  assert.equal(store.one('SELECT checks FROM tenants WHERE id=?', 'legacy').checks, 17);
});
