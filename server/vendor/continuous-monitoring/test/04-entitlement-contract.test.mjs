import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MonitorStore } from '../src/store.mjs';
import { normalize } from '../src/observation.mjs';
import { harness, delay } from './harness.mjs';

const root = id => `/v1/monitors/${id}`;
test('paid entitlements need an administrative subscription reference and cannot be bought or escalated through the API', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const store = app.open(), token = randomBytes(32).toString('base64url');
  assert.throws(() => store.provision({ id: 'paid', token, plan: 'paid' }), /paid_subscription_reference_required/);
  const grant = store.provision({ id: 'paid', token, plan: 'paid', subscriptionRef: 'existing_subscription_reference', entitlementUntil: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(grant.charged, false);
  const created = await app.api('/v1/monitors', { method: 'POST', credential: token, key: 'paid-create-key', body: {
    url: `${app.mountedOrigin}/paid-path`, intervalMs: 5000, budget: { maxChecks: 1000 },
  } });
  assert.equal(created.status, 201); const id = created.body.monitor.id;
  assert.equal((await app.create({ plan: 'paid' })).status, 400);
  await app.tick(); const usage = (await app.api(`${root(id)}/usage`, { credential: token })).body;
  assert.equal(usage.plan, 'paid'); assert.equal(usage.subscriptionRef, 'existing_subscription_reference');
  assert.equal(usage.cost.automaticCharge, false); assert.equal(usage.cost.billable, false); assert.equal(usage.cost.total, null);
  store.revoke('paid'); await app.tick();
  assert.equal((await app.api(root(id), { credential: token })).status, 401);
  assert.equal(store.owned('paid', id).status, 'expired');
  assert.equal(app.state.requests, 1); store.close();
});

test('entitlement expiry and re-enrollment cannot reset aggregate tenant budgets or resurrect an expired monitor', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const store = app.open(), token = randomBytes(32).toString('base64url');
  store.provision({ id: 'short', token, entitlementUntil: new Date(Date.now() + 900).toISOString() });
  const created = await app.api('/v1/monitors', { method: 'POST', credential: token, key: 'short-entitlement-key', body: {
    url: `${app.mountedOrigin}/short-entitlement`, intervalMs: 120,
  } });
  assert.equal(created.status, 201); const id = created.body.monitor.id;
  await app.tick(); app.state.price = 12; await delay(140); await app.tick();
  await delay(950); await app.tick();
  assert.equal((await app.api(root(id), { credential: token })).body.monitor.status, 'expired');
  assert.equal((await app.api('/v1/monitors', { method: 'POST', credential: token, key: 'expired-new-monitor', body: { url: `${app.mountedOrigin}/expired` } })).status, 403);
  const message = (await app.api(`${root(id)}/deliveries`, { credential: token })).body.deliveries[0];
  assert.equal(message.event.transition, 'content_changed');
  const acknowledged = await app.api(`${root(id)}/deliveries/${message.deliveryId}/ack`, {
    method: 'POST', credential: token, body: { idempotencyKey: message.deliveryId },
  });
  assert.equal(acknowledged.body.delivered, true);
  store.provision({ id: 'short', token });
  assert.equal(store.one('SELECT checks FROM tenants WHERE id=?', 'short').checks, 2);
  assert.equal((await app.api(`${root(id)}/resume`, { method: 'POST', credential: token, body: {} })).status, 409);
  assert.equal(app.state.requests, 2);
  store.write('UPDATE tenants SET checks=300 WHERE id=?', 'short');
  const capped = await app.api('/v1/monitors', { method: 'POST', credential: token, key: 'aggregate-budget-key', body: {
    url: `${app.mountedOrigin}/aggregate-budget`, intervalMs: 5000,
  } });
  assert.equal(capped.status, 201); await app.tick();
  assert.equal((await app.api(root(capped.body.monitor.id), { credential: token })).body.monitor.status, 'budget_exhausted');
  assert.equal(app.state.requests, 2); store.close();
});

test('Observatory adapter keeps partial and unavailable readings non-numeric through the new HTTP projection', () => {
  const config = { scopeKey: 'test', mode: 'observatory', sourceId: 'moltjobs' };
  const document = { schemaVersion: 'pilot.external-observatory.v1', sourceId: 'moltjobs',
    availability: 'partial', coverage: { status: 'partial', comparable: false }, metrics: { count: 0 } };
  const reading = normalize(config, { status: 200, headers: {}, body: Buffer.from(JSON.stringify(document)), failure: null }, Date.now());
  assert.equal(reading.evidenceClass, 'source_failure'); assert.equal(reading.material, null);
  assert.equal(reading.failureCode, 'partial_coverage');
  document.availability = 'unavailable';
  const unavailable = normalize(config, { status: 200, headers: {}, body: Buffer.from(JSON.stringify(document)), failure: null }, Date.now());
  assert.equal(unavailable.material, null); assert.equal(unavailable.failureCode, 'unavailable');
});

test('checked-in machine and API contracts expose the actual polling seam and no automatic charge', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const manifest = (await app.api('/v1/manifest', { credential: '' })).body;
  assert.equal(manifest.deploymentState, 'feature-branch-not-deployed');
  assert.equal(manifest.subscription.automaticCharge, false); assert.equal(manifest.subscription.checkout, null);
  const schema = JSON.parse(await readFile(new URL('../openapi.json', import.meta.url), 'utf8'));
  assert.equal(schema.openapi, '3.1.0');
  assert.ok(schema.paths['/v1/monitors/{monitorId}/deliveries/{deliveryId}/ack'].post);
  assert.ok(schema.paths['/v1/monitors/{monitorId}'].patch);
  assert.equal(schema.components.schemas.Usage.properties.cost.properties.total.type, 'null');
  const store = new MonitorStore(':memory:');
  assert.throws(() => store.provision({ id: 'invalid', token: 'short' }), /invalid_credential/); store.close();
});
