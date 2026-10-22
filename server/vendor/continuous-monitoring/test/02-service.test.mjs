import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { harness, delay } from './harness.mjs';

const base = id => `/v1/monitors/${id}`;
test('creation replay/conflict, tenant and reader boundaries, hostile config and secret redaction', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const first = await app.create({}, 'stable-create-key');
  assert.equal(first.status, 201); const id = first.body.monitor.id;
  const replay = await app.create({}, 'stable-create-key');
  assert.equal(replay.status, 200); assert.equal(replay.body.replay, true); assert.equal(replay.body.monitor.id, id);
  assert.equal((await app.create({ intervalMs: 121 }, 'stable-create-key')).status, 409);
  for (const patch of [{ intervalMs: 1 }, { expiresAt: '2099-01-01' }, { budget: { maxChecks: 10000000 } },
    { url: 'http://169.254.169.254/' }, { url: 'https://example.com/?token=must-stay-secret' },
    { url: 'https://user:must-stay-secret@example.com/' }, { receiverUrl: 'https://example.com/' }]) {
    const rejected = await app.create(patch);
    assert.equal(rejected.status, 400); assert.ok(!JSON.stringify(rejected).includes('must-stay-secret'));
  }
  assert.equal((await app.api(base(id), { credential: app.readerToken })).status, 200);
  assert.equal((await app.api(`${base(id)}/cancel`, { method: 'POST', body: {}, credential: app.readerToken })).status, 403);
  assert.equal((await app.api(`${base(id)}/deliveries`, { credential: app.readerToken })).status, 403);
  const other = randomBytes(32).toString('base64url'), store = app.open();
  store.provision({ id: 'other', token: other }); store.close();
  for (const resource of ['', '/usage', '/events', '/runs', '/deliveries']) assert.equal((await app.api(`${base(id)}${resource}`, { credential: other })).status, 404);
  assert.equal((await app.api(`${base(id)}/cancel`, { method: 'POST', body: {}, credential: other })).status, 404);
  assert.equal((await app.api(`${base(id)}?token=must-stay-secret`)).status, 400);
  assert.equal((await app.api(base(id), { credential: randomBytes(32).toString('hex') })).status, 401);
  const reopened = app.open();
  const saved = JSON.stringify(reopened.all('SELECT * FROM credentials'));
  assert.ok(!saved.includes(app.token)); assert.ok(!saved.includes(app.readerToken)); reopened.close();
});

test('unchanged conditional GET, incomplete JSON and timeout preserve baseline and emit useful recovery', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create()).body.monitor.id, root = base(id);
  await app.tick(); const original = (await app.api(root)).body.monitor.initialEvidenceId;
  await delay(140); assert.deepEqual((await app.tick()).outcomes, ['unchanged']);
  assert.equal((await app.api(`${root}/events`)).body.events.length, 0);
  app.state.mode = 'missing'; await delay(140);
  assert.deepEqual((await app.tick()).outcomes, ['evidence_unavailable']);
  let events = (await app.api(`${root}/events`)).body.events;
  assert.equal(events[0].failureCode, 'partial_fields'); assert.equal(events[0].after, null); assert.deepEqual(events[0].diff, []);
  assert.equal((await app.api(root)).body.monitor.currentEvidenceId, original);
  app.state.mode = 'timeout'; await delay(140); await app.tick();
  events = (await app.api(`${root}/events`)).body.events;
  assert.equal(events.at(-1).failureCode, 'timeout');
  assert.equal((await app.api(root)).body.monitor.currentEvidenceId, original);
  app.state.mode = 'normal'; await delay(140);
  assert.deepEqual((await app.tick()).outcomes, ['service_restored']);
  assert.equal((await app.api(root)).body.monitor.currentEvidenceId, original);
  assert.equal((await app.api(`${root}/snapshots/${original}`)).body.material.fields['/price'], 10);
  assert.equal(app.state.requests, 5);
});

test('delivery lost response retries stable key, readback and lost acknowledgement are idempotent', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create()).body.monitor.id, root = base(id);
  await app.tick(); app.state.price = 11; await delay(140); await app.tick();
  const event = (await app.api(`${root}/events`)).body.events[0];
  assert.equal((await app.api(`${root}/deliveries/${event.id}/ack`, { method: 'POST', body: { idempotencyKey: event.id } })).status, 409);
  const lost = (await app.api(`${root}/deliveries`)).body.deliveries[0];
  assert.equal(lost.attempt, 1);
  assert.equal((await app.api(`${root}/deliveries`)).body.deliveries.length, 0);
  await app.restart(); await delay(150);
  const retry = (await app.api(`${root}/deliveries`)).body.deliveries[0];
  assert.equal(retry.attempt, 2); assert.equal(retry.deliveryId, lost.deliveryId); assert.deepEqual(retry.event, lost.event);
  assert.equal((await app.api(`${root}/deliveries/${event.id}/ack`, { method: 'POST', body: { idempotencyKey: 'wrong' } })).status, 409);
  const ack = await app.api(`${root}/deliveries/${event.id}/ack`, { method: 'POST', body: { idempotencyKey: event.id } });
  assert.equal(ack.body.delivered, true); assert.equal(ack.body.replay, false);
  const again = await app.api(`${root}/deliveries/${event.id}/ack`, { method: 'POST', body: { idempotencyKey: event.id } });
  assert.equal(again.body.replay, true); assert.equal(again.body.acknowledgedAt, ack.body.acknowledgedAt);
  assert.equal((await app.api(`${root}/usage`)).body.acknowledgedEvents, 1);
});

test('pause, bounded configuration revision, resume, terminal cancel and expiry survive restart', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create()).body.monitor.id, root = base(id);
  await app.tick();
  assert.equal((await app.api(root, { method: 'PATCH', body: { intervalMs: 150 } })).status, 409);
  await app.api(`${root}/pause`, { method: 'POST', body: {} });
  app.state.price = 20; await delay(140); await app.restart();
  assert.equal((await app.tick()).completed, 0); assert.equal(app.state.requests, 1);
  assert.equal((await app.api(root, { method: 'PATCH', body: { intervalMs: 150, budget: { maxChecks: 5 } } })).status, 200);
  await app.api(`${root}/resume`, { method: 'POST', body: {} }); await delay(170);
  assert.deepEqual((await app.tick()).outcomes, ['content_changed']);
  await app.api(`${root}/cancel`, { method: 'POST', body: {} }); await app.restart();
  assert.equal((await app.api(`${root}/resume`, { method: 'POST', body: {} })).status, 409);
  assert.equal((await app.tick()).completed, 0); assert.equal(app.state.requests, 2);
  const expiring = await app.create({ url: `${app.mountedOrigin}/expiry`, expiresAt: new Date(Date.now() + 300).toISOString() });
  assert.equal(expiring.status, 201); await delay(350); await app.restart();
  await app.tick(); assert.equal((await app.api(base(expiring.body.monitor.id))).body.monitor.status, 'expired');
  assert.equal(app.state.requests, 2);
});

test('check and byte reservations halt work before repeating expensive observations', { timeout: 15000 }, async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create({ budget: { maxChecks: 2, timeoutMs: 200 } })).body.monitor.id;
  await app.tick(); await delay(140); await app.tick(); await delay(140); await app.tick();
  const monitor = (await app.api(base(id))).body.monitor;
  assert.equal(monitor.status, 'budget_exhausted'); assert.equal(monitor.usage.checksReserved, 2); assert.equal(app.state.requests, 2);
  const bytes = await app.create({ url: `${app.mountedOrigin}/byte-limited`, budget: { maxBodyBytes: 256, maxBytes: 65792, timeoutMs: 200 } });
  const byteId = bytes.body.monitor.id; await app.tick(); await delay(140); await app.tick();
  assert.equal((await app.api(base(byteId))).body.monitor.status, 'budget_exhausted');
  assert.equal(app.state.requests, 3);
});

test('HTTP status and payment-challenge drift is observable without authentication or a purchase', { timeout: 15000 }, async t => {
  const app = await harness({ originHandler: (req, res, state) => {
    assert.equal(req.method, 'GET'); assert.equal(req.headers.authorization, undefined);
    res.writeHead(state.price === 10 ? 200 : 402, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state.price === 10 ? { available: true } : { paymentRequired: true, price: '1.00' }));
  } });
  t.after(() => app.close());
  const created = await app.create({ mode: 'http', pointers: undefined });
  assert.equal(created.status, 201); const id = created.body.monitor.id;
  await app.tick(); app.state.price = 1; await delay(140); await app.tick();
  const event = (await app.api(`${base(id)}/events`)).body.events[0];
  assert.equal(event.transition, 'content_changed');
  assert.deepEqual(event.diff.find(field => field.field === 'status'), { field: 'status', before: 200, after: 402 });
  assert.equal((await app.api(`${base(id)}/usage`)).body.cost.automaticCharge, false);
  assert.equal(app.state.requests, 2);
});
