import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { normalize } from '../src/observation.mjs';
import { tick } from '../src/worker.mjs';
import { harness, delay } from './harness.mjs';

const exec = promisify(execFile);
const crashScript = fileURLToPath(new URL('./crash-worker.mjs', import.meta.url));
const root = id => `/v1/monitors/${id}`;

test('two separate workers race on one durable slot; one origin read and one baseline', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create({ intervalMs: 5000 })).body.monitor.id;
  const runs = await Promise.all([app.tick(), app.tick()]);
  assert.equal(runs.reduce((sum, run) => sum + run.completed, 0), 1); assert.equal(app.state.requests, 1);
  assert.equal((await app.api(`${root(id)}/runs`)).body.runs.length, 1);
});

test('different monitors cannot multiply requests to the same target inside the source cooldown', { timeout: 15000 }, async t => {
  const app = await harness({ options: { sourceCooldownMs: 5000 } }); t.after(() => app.close());
  const first = (await app.create({ intervalMs: 5000 })).body.monitor.id;
  const second = (await app.create({ intervalMs: 5000 })).body.monitor.id;
  await Promise.all([app.tick(), app.tick()]); assert.equal(app.state.requests, 1);
  const store = app.open();
  await tick(store, { now: () => Date.now() + 6000 });
  assert.ok(store.owned('customer', first).initial_evidence);
  assert.ok(store.owned('customer', second).initial_evidence);
  assert.equal(app.state.requests, 2); store.close();
});

test('cancelling an actual in-flight read aborts it, fences its result and stops future requests', { timeout: 15000 }, async t => {
  const app = await harness({ originHandler: (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.flushHeaders(); } });
  t.after(() => app.close());
  const id = (await app.create({ intervalMs: 5000, budget: { timeoutMs: 2000 } })).body.monitor.id;
  const work = app.tick();
  for (let tries = 0; app.state.requests === 0 && tries < 100; tries++) await delay(20);
  assert.equal(app.state.requests, 1);
  assert.equal((await app.api(`${root(id)}/cancel`, { method: 'POST', body: {} })).body.monitor.status, 'cancelled');
  const result = await work;
  assert.deepEqual(result.outcomes, ['discarded']);
  assert.equal((await app.api(`${root(id)}/events`)).body.events.length, 0);
  await app.restart(); await app.tick(); assert.equal(app.state.requests, 1);
});

test('real response staged before a worker crash finishes after restart without a second source request', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create({ intervalMs: 5000 })).body.monitor.id;
  await assert.rejects(exec(process.execPath, [crashScript, app.configFile, 'staged'], { env: { ...process.env, NODE_ENV: 'test' } }), error => error.code === 17);
  assert.equal(app.state.requests, 1); await app.restart();
  const recovery = await app.tick(); assert.equal(recovery.recovered, 1); assert.equal(recovery.completed, 0);
  assert.equal(app.state.requests, 1);
  const runs = (await app.api(`${root(id)}/runs`)).body.runs;
  assert.equal(runs[0].outcome, 'baseline_established');
  assert.equal((await app.api(`${root(id)}/usage`)).body.checksReserved, 1);
});

test('lost worker before response remains unknown, consumes reservation and never replays that slot', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create({ intervalMs: 5000, budget: { timeoutMs: 50 } })).body.monitor.id;
  await assert.rejects(exec(process.execPath, [crashScript, app.configFile, 'started'], { env: { ...process.env, NODE_ENV: 'test' } }), error => error.code === 18);
  await delay(180); await app.restart(); const recovered = await app.tick();
  assert.equal(recovered.recovered, 1); assert.equal(recovered.completed, 0); assert.equal(app.state.requests, 0);
  const usage = (await app.api(`${root(id)}/usage`)).body;
  assert.equal(usage.sourceRequestsUnknownUpperBound, 1); assert.equal(usage.budgetBytesCharged, 131072);
  const event = (await app.api(`${root(id)}/events`)).body.events[0];
  assert.equal(event.failureCode, 'interrupted_unknown'); assert.deepEqual(event.diff, []);
});

test('expired claim with no dispatch is recovered with zero source cost; stale token cannot commit', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create({ intervalMs: 5000 })).body.monitor.id;
  const store = app.open(), now = Date.now(), claim = store.claim(now);
  assert.ok(claim); const recovered = store.recover(now + 1000);
  assert.equal(recovered.length, 1); assert.equal(recovered[0].failure, 'worker_lost_before_dispatch');
  assert.equal(store.start(claim, now + 1001), false);
  assert.equal(store.stage(claim, { normalized: null }, now + 1001), false);
  assert.equal(store.owned('customer', id).charged_bytes, 0); store.close();
  assert.equal(app.state.requests, 0);
});

test('immutable outputs, monotonic event cursors, retention and bounded exhausted delivery attempts', { timeout: 15000 }, async t => {
  const app = await harness({ options: { visibilityMs: 1, maxDeliveryAttempts: 2 } }); t.after(() => app.close());
  const id = (await app.create({ intervalMs: 5000, retentionDays: 1 })).body.monitor.id;
  await app.tick(); app.state.price = 25;
  const store = app.open(), row = store.owned('customer', id), now = Date.now();
  // Drive only the schedule clock forward; observation still traverses the mounted HTTP origin.
  const checked = await tick(store, { now: () => now + 6000 }); assert.equal(checked.completed[0].outcome, 'content_changed');
  const first = store.listEvents('customer', id).events[0];
  const initial = row.initial_evidence;
  assert.throws(() => store.write("UPDATE snapshots SET document='{}' WHERE monitor_id=?", id), /immutable/);
  assert.throws(() => store.write("UPDATE events SET document='{}' WHERE monitor_id=?", id), /immutable/);
  assert.throws(() => store.write("UPDATE run_outputs SET document='{}' WHERE monitor_id=?", id), /immutable/);
  store.poll('customer', id, now + 6000); store.poll('customer', id, now + 6002);
  store.poll('customer', id, now + 6005);
  assert.equal(store.delivery('customer', id, first.id).state, 'exhausted');
  assert.equal(store.delivery('customer', id, first.id).attempts, 2);
  store.prune(now + 86400000 + 7000);
  assert.equal(store.listEvents('customer', id).events.length, 0);
  assert.ok(store.one('SELECT 1 FROM snapshots WHERE monitor_id=? AND evidence_id=?', id, initial));
  assert.equal(store.owned('customer', id).event_floor, first.cursor);
  assert.throws(() => store.listEvents('customer', id, first.cursor - 1 || 0.5), /cursor_expired|invalid_integer/);
  assert.equal(store.usageFor(store.owned('customer', id)).transitions.contentChanged, 1);
  store.prune(row.expires_at + 86400000 + 1);
  assert.throws(() => store.owned('customer', id), /not_found/); store.close();
});
