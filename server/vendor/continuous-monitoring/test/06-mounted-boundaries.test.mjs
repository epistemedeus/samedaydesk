import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { boundedGet } from '../src/http.mjs';
import { tick } from '../src/worker.mjs';
import { harness, delay } from './harness.mjs';

test('credential rotation during an uploaded mutation rechecks the current owner role', async t => {
  const app = await harness(); t.after(() => app.close());
  const id = (await app.create({ intervalMs: 5000 })).body.monitor.id;
  await app.api(`/v1/monitors/${id}/pause`, { method: 'POST', body: {} });
  const req = http.request(`${app.base}/v1/monitors/${id}`, { method: 'PATCH', headers: {
    authorization: `Bearer ${app.token}`, 'content-type': 'application/json',
  } });
  const response = new Promise((resolve, reject) => {
    req.once('error', reject);
    req.once('response', res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.once('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
  });
  req.write('{"intervalMs":');
  await delay(30);
  const store = app.open(); t.after(() => store.close());
  store.provision({ id: 'customer', token: randomBytes(32).toString('base64url'), readerToken: app.token });
  req.end('5001}');
  const rejected = await response;
  assert.equal(rejected.status, 401);
  assert.equal(JSON.parse(store.owned('customer', id).config).intervalMs, 5000);
  assert.equal((await app.api(`/v1/monitors/${id}`)).status, 200);
  assert.equal((await app.api(`/v1/monitors/${id}/resume`, { method: 'POST', body: {} })).status, 403);
});

test('actual sockets use one validated DNS answer; an authority change during DNS opens no socket', async t => {
  let requests = 0, lookups = 0, sockets = 0, authorized = true;
  const server = http.createServer((req, res) => {
    requests++;
    for (const key of ['authorization', 'cookie', 'payment-signature']) assert.equal(req.headers[key], undefined);
    res.setHeader('content-type', 'application/json'); res.end('{"public":true}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  t.mock.method(https, 'request', (url, options, callback) => {
    sockets++;
    assert.equal(url.hostname, 'public.example.com'); assert.equal(options.agent, false);
    options.lookup(url.hostname, { all: true }, (error, answers) => {
      assert.equal(error, null); assert.deepEqual(answers, [{ address: '8.8.8.8', family: 4 }]);
    });
    options.lookup(url.hostname, {}, (error, address, family) => {
      assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4);
    });
    // A test-owned loopback socket under the real request/body implementation.
    // No HTTP caller can inject this transport or bypass production DNS checks.
    return http.request(`http://127.0.0.1:${server.address().port}${url.pathname}`, {
      headers: options.headers, signal: options.signal, agent: false,
    }, callback);
  });
  const lookup = async () => { lookups++; return [{ address: '8.8.8.8', family: 4 }]; };
  const good = await boundedGet('https://public.example.com/resource', { lookup, authorize: () => authorized });
  assert.equal(good.failure, null); assert.equal(good.requests, 1);
  const stopped = await boundedGet('https://public.example.com/resource', {
    lookup: async () => { authorized = false; return lookup(); }, authorize: () => authorized,
  });
  assert.equal(stopped.failure, 'cancelled'); assert.equal(stopped.requests, 0);
  assert.deepEqual({ requests, lookups, sockets }, { requests: 1, lookups: 2, sockets: 1 });
});

test('lease recovery fences a live old worker, preserves unknown cost, and emits only one result', async t => {
  const app = await harness({ originHandler: (_req, res) => { res.writeHead(200); res.flushHeaders(); } });
  t.after(() => app.close());
  const id = (await app.create({ intervalMs: 5000, budget: { timeoutMs: 1000 } })).body.monitor.id;
  const old = app.open(), receiver = app.open(); t.after(() => old.close()); t.after(() => receiver.close());
  let claim;
  const pending = tick(old, { afterStart: started => { claim = started; } });
  for (let index = 0; app.state.requests === 0 && index < 100; index++) await delay(10);
  assert.equal(app.state.requests, 1);
  const expiry = receiver.one('SELECT lease_until FROM runs WHERE id=?', claim.id).lease_until;
  const recovered = receiver.recover(expiry + 1);
  assert.equal(recovered.length, 1); assert.equal(recovered[0].failure, 'interrupted_unknown');
  await pending;
  assert.equal(old.stage(claim, { normalized: null }, Date.now()), false);
  assert.equal(old.finish(claim.id, Date.now()), null);
  assert.deepEqual(receiver.recover(expiry + 2), []);
  const row = receiver.owned('customer', id);
  assert.equal(row.initial_evidence, null);
  assert.equal(row.unknown_runs, 1); assert.equal(row.charged_bytes, 131072);
  assert.equal(receiver.listEvents('customer', id).events.length, 1);
  assert.equal(receiver.all('SELECT * FROM run_outputs WHERE monitor_id=?', id).length, 1);
  assert.equal(app.state.requests, 1);
});

test('an elapsed DNS budget fences socket entry before a delayed timeout callback runs', async t => {
  let sockets = 0;
  t.mock.method(https, 'request', () => { sockets++; throw new Error('late socket entry'); });
  const result = await boundedGet('https://public.example.com/resource', { timeoutMs: 50, lookup: async () => {
    // Simulate DNS completion after the event loop was stalled. Its promise
    // continuation runs before the pending timer, as with other delayed IO.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
    return [{ address: '8.8.8.8', family: 4 }];
  } });
  assert.equal(result.failure, 'timeout'); assert.equal(result.requests, 0); assert.equal(sockets, 0);
});
