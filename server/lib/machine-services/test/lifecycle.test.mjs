import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mountMachineServices } from '../mount.mjs';
import { PgPort } from '../postgres.mjs';
import { PostgresMonitorStore } from '../../../vendor/continuous-monitoring/src/store-pg.mjs';

const transient = () => Object.assign(new Error('private database detail must never escape'), { code: 'ECONNRESET' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

async function fixture(t, extra = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ae18-lifecycle-'));
  const tenants = path.join(directory, 'tenants.json');
  await writeFile(tenants, JSON.stringify({ tenants: [{ id: 'owner', tokenSha256: 'a'.repeat(64),
    routes: ['lockfile.delta'], maxCalls: 2, maxUnits: 0, maxConcurrent: 1 }] }), { mode: 0o600 });
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1700000000000 });
  const calls = { opens: 0, closes: 0, plans: 0, runs: 0, active: 0, maxActive: 0 };
  const control = { failOpen: 0, failPlan: 0, failWork: 0, due: null, opening: null, planning: null, working: null };
  t.mock.method(PgPort.prototype, 'checkReady', async function () {
    calls.opens++; if (control.opening) await control.opening.promise;
    if (control.failOpen-- > 0) throw transient();
    calls.active++; calls.maxActive = Math.max(calls.maxActive, calls.active); this.fixtureOpened = true;
  });
  const close = PgPort.prototype.close;
  t.mock.method(PgPort.prototype, 'close', async function () {
    calls.closes++; if (this.fixtureOpened) calls.active--; await close.call(this);
  });
  t.mock.method(PostgresMonitorStore.prototype, 'one', async () => {
    calls.plans++; if (control.planning) await control.planning.promise;
    if (control.failPlan-- > 0) throw transient(); return { due: control.due };
  });
  t.mock.method(PostgresMonitorStore.prototype, 'recover', async () => {
    calls.runs++; if (control.working) await control.working.promise;
    if (control.failWork-- > 0) throw transient(); control.due = null; return [];
  });
  t.mock.method(PostgresMonitorStore.prototype, 'claim', async () => null);
  t.mock.method(PostgresMonitorStore.prototype, 'prune', async () => {});
  t.mock.method(console, 'error', () => {});
  const routes = new Map();
  const services = mountMachineServices({ use(prefix, handler) { routes.set(prefix, handler); } }, { env: {
    NODE_ENV: 'production', CORRESPONDENCE_DATABASE_URL: 'postgres://fixture@localhost/postgres?sslmode=verify-full',
    MACHINE_GATEWAY_ENABLED: '1', MACHINE_GATEWAY_PAYMENTS_ENABLED: '0', MACHINE_GATEWAY_TENANTS_FILE: tenants,
    MONITOR_ENABLED: '1', MONITOR_SCHEDULER: '1', ...extra,
  } });
  t.after(() => services.close());
  const advance = async ms => { t.mock.timers.tick(ms); await flush(); };
  return { services, calls, control, advance, directory, routes };
}

test('later caller recovers a concurrent failed first open, with one new store and private errors', async t => {
  const { services, control, calls, advance, routes } = await fixture(t);
  control.failOpen = 1; control.opening = deferred();
  const failed = Array.from({ length: 12 }, () => services.ready('gateway'));
  await flush(); assert.equal(calls.opens, 1);
  control.opening.resolve();
  const outcomes = await Promise.allSettled(failed);
  assert.ok(outcomes.every(value => value.status === 'rejected' && value.reason.message === 'gateway_unavailable'));
  let body, status;
  await routes.get('/api/machine-gateway')({}, { status(value) { status = value; return this; }, json(value) { body = value; } });
  assert.equal(status, 503); assert.deepEqual(body, { error: { code: 'gateway_unavailable' } });
  assert.equal(calls.opens, 1, 'requests cannot defeat cooldown');
  await advance(1000);
  const recovered = await Promise.all(Array.from({ length: 12 }, () => services.ready('gateway')));
  assert.ok(recovered.every(value => value === recovered[0])); assert.equal(calls.opens, 2);
  assert.equal(calls.active, 1); assert.equal(calls.maxActive, 1);
  await services.close(); assert.equal(calls.closes, 2); assert.equal(calls.active, 0);
});

test('scheduler recovers readiness without another caller and installs one scheduler/store', async t => {
  const { services, control, calls, advance } = await fixture(t);
  control.failOpen = 1; control.due = Date.now();
  const failed = Array.from({ length: 8 }, () => services.arm());
  await Promise.all(failed.map(promise => assert.rejects(promise)));
  assert.equal(calls.opens, 1);
  await advance(999); assert.equal(calls.opens, 1);
  await advance(1); await advance(0);
  assert.equal(calls.opens, 2); assert.equal(calls.runs, 1);
  assert.equal(calls.active, 1); assert.equal(calls.maxActive, 1);
  const state = await services.ready('monitor');
  await Promise.all(Array.from({ length: 8 }, () => services.arm()));
  assert.equal(await services.ready('monitor'), state); assert.equal(calls.opens, 2);
  await advance(300000); assert.equal(calls.runs, 1, 'idle scheduler does not poll');
});

test('repeated readiness failure backs off 1/2/4/8/16/30 seconds and caps at 30 seconds', async t => {
  const { services, control, calls, advance } = await fixture(t); control.failOpen = Infinity;
  await assert.rejects(services.arm());
  for (const [index, delay] of [1000, 2000, 4000, 8000, 16000, 30000, 30000].entries()) {
    await advance(delay - 1); assert.equal(calls.opens, index + 1);
    await Promise.all(Array.from({ length: 8 }, () => assert.rejects(services.arm())));
    assert.equal(calls.opens, index + 1, 'explicit arms cannot defeat backoff');
    await advance(1); assert.equal(calls.opens, index + 2);
  }
  await services.close(); const attempts = calls.opens; await advance(300000); assert.equal(calls.opens, attempts);
});

test('initial scheduler plan failure recovers autonomously using the existing store', async t => {
  const { services, control, calls, advance } = await fixture(t);
  control.failPlan = 1; control.due = Date.now();
  await assert.rejects(services.arm()); assert.equal(calls.plans, 1);
  await advance(999); assert.equal(calls.plans, 1);
  await advance(1); await advance(0);
  assert.equal(calls.runs, 1); assert.equal(calls.opens, 1); assert.equal(calls.maxActive, 1);
});

test('scheduled replan failure recovers and repeated tick errors use bounded backoff', async t => {
  const { services, control, calls, advance } = await fixture(t);
  control.due = Date.now(); control.failWork = 3;
  await services.arm(); await advance(0); assert.equal(calls.runs, 1);
  for (const [index, delay] of [1000, 2000, 4000].entries()) {
    await advance(delay - 1); assert.equal(calls.runs, index + 1);
    await advance(1); await advance(0); assert.equal(calls.runs, index + 2);
  }
  assert.equal(calls.opens, 1);
  // A failure in the scheduler's own post-tick plan must take the same recovery path.
  control.due = Date.now(); control.failPlan = 0;
  await (await services.arm()).plan(); control.failPlan = 1;
  await advance(0); const plans = calls.plans;
  await advance(999); assert.equal(calls.plans, plans);
  await advance(1); assert.ok(calls.plans > plans);
});

test('close during initialization waits for and closes the returned store exactly once', async t => {
  const { services, control, calls, advance } = await fixture(t); control.opening = deferred();
  const pending = services.arm(); await flush();
  let closed = false; const closing = services.close().then(() => { closed = true; });
  await flush(); assert.equal(closed, false);
  control.opening.resolve(); await Promise.allSettled([pending, closing]);
  assert.equal(closed, true); assert.equal(calls.closes, 1); assert.equal(calls.active, 0);
  assert.equal(calls.plans, 0); await advance(300000); assert.equal(calls.opens, 1);
});

test('close during backoff cancels autonomous recovery', async t => {
  const { services, control, calls, advance } = await fixture(t); control.failOpen = 1;
  await assert.rejects(services.arm()); await services.close(); await advance(300000);
  assert.equal(calls.opens, 1); assert.equal(calls.closes, 1); assert.equal(calls.plans, 0);
});

test('close during asynchronous planning never installs a timer after shutdown', async t => {
  const { services, control, calls, advance } = await fixture(t);
  control.planning = deferred(); control.due = Date.now() + 100;
  const pending = services.arm(); await flush();
  let closed = false; const closing = services.close().then(() => { closed = true; });
  await flush(); assert.equal(closed, false, 'wait for owned planning query before ending its pool');
  control.planning.resolve(); await Promise.allSettled([pending, closing]);
  assert.equal(services.schedulerState().armed, false);
  await advance(300000); assert.equal(calls.runs, 0); assert.equal(calls.closes, 1);
});

test('close during in-flight work waits, aborts its signal and prevents rearming', async t => {
  const { services, control, calls, advance } = await fixture(t);
  control.due = Date.now(); control.working = deferred();
  await services.arm(); await advance(0); assert.equal(calls.runs, 1);
  let closed = false; const closing = services.close().then(() => { closed = true; });
  await flush(); assert.equal(closed, false); assert.equal(calls.closes, 0);
  control.working.resolve(); await closing; const plans = calls.plans;
  await services.close(); await advance(300000);
  assert.equal(calls.runs, 1); assert.equal(calls.plans, plans); assert.equal(calls.closes, 1);
});

for (const [name, extra] of Object.entries({ disabled: { MONITOR_ENABLED: '0' },
  flag: { MONITOR_ENABLED: 'yes' }, schedulerFlag: { MONITOR_SCHEDULER: 'yes' },
  sqliteProduction: { MONITOR_STORE: 'sqlite' }, missingDatabase: { CORRESPONDENCE_DATABASE_URL: '' },
  weakTls: { CORRESPONDENCE_DATABASE_URL: 'postgres://fixture@localhost/postgres?sslmode=require' },
  invalidRuntime: { MONITOR_RUNTIME_JSON: '{"options":{"maxTick":0}}' },
})) test(`${name} never retries or opens a store`, async t => {
  const { services, calls, advance } = await fixture(t, extra);
  await assert.rejects(services.arm()); await advance(300000);
  assert.equal(calls.opens, 0); assert.equal(calls.plans, 0);
});

test('scheduler disabled leaves request serving independent and opens no autonomous work', async t => {
  const { services, calls, advance } = await fixture(t, { MONITOR_SCHEDULER: '0' });
  await services.arm(); await advance(300000); assert.equal(calls.opens, 0);
  await services.ready('monitor'); assert.equal(calls.opens, 1); assert.equal(calls.plans, 0);
});

test('permanent schema/authentication failures do not retry while the other service remains usable', async t => {
  const { services, calls, advance } = await fixture(t);
  t.mock.method(PgPort.prototype, 'checkReady', async function () {
    calls.opens++; if (this.service === 'monitor') throw Object.assign(new Error('private'), { code: '42P01' });
  });
  await assert.rejects(services.arm()); await advance(300000); assert.equal(calls.opens, 1);
  await services.ready('gateway'); assert.equal(calls.opens, 2);
});
