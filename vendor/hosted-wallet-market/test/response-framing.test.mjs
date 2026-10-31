import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Agent, createServer, request} from 'node:http';
import {connect} from 'node:net';
import {resolve} from 'node:path';
import {
  RESPONSE_FRAMING, WIRE_HEADER, WIRE_VERSION,
  createResponseCompletion, deliverJsonResponse,
} from '../src/response-completion.mjs';

const root = resolve(import.meta.dirname, '../../..');
const contract = JSON.parse(readFileSync(new URL('../contracts/voluntary-participation.openapi.json', import.meta.url), 'utf8'));
const contractBytes = Buffer.from(JSON.stringify(contract));
const HISTORICAL_SERVER = '313b6093da34e4e81d82ce0a1ff7db057947a85ee87c836d55e4f27368a59b92';
const PRIVATE = 'PRIVATE_BODY_MUST_NOT_APPEAR';

function arm(logs) {
  return createResponseCompletion(8, line => logs.push(line), {expiresAt: new Date(Date.now() + 60000).toISOString()});
}

function padded(bytes) {
  const overhead = Buffer.byteLength('{"p":""}');
  const body = {p: 'x'.repeat(bytes - overhead)};
  const payload = Buffer.from(JSON.stringify(body));
  assert.equal(payload.length, bytes);
  return body;
}

function listen(handler) {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(error => {
      if (!res.headersSent && !res.destroyed) res.destroy(error);
    });
  });
  let connections = 0;
  server.on('connection', () => { connections += 1; });
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen({
      server, port: server.address().port, connections: () => connections,
      async close() {
        const started = Date.now();
        server.closeAllConnections();
        await new Promise(resolveClose => server.close(resolveClose));
        return Date.now() - started;
      },
    }));
  });
}

function keepAgent() {
  let opened = 0;
  const agent = new Agent({keepAlive: true, maxSockets: 1});
  const original = agent.createConnection;
  agent.createConnection = function countConnection(options, callback) {
    opened += 1;
    return original.call(this, options, callback);
  };
  return {agent, opened: () => opened};
}

function call(port, path, {method = 'GET', agent, headers = {}, abort = false} = {}) {
  return new Promise((resolveRequest, reject) => {
    const req = request({host: '127.0.0.1', port, method, agent, path, headers: {host: 'desk.invalid', ...headers}}, res => {
      const chunks = [];
      res.on('data', chunk => {
        chunks.push(chunk);
        if (abort) req.destroy();
      });
      const finish = aborted => resolveRequest({
        status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), aborted,
      });
      res.on('end', () => finish(false));
      res.on('aborted', () => finish(true));
    });
    req.setTimeout(3000, () => req.destroy(new Error('fixture_deadline')));
    req.on('error', error => {
      if (abort && (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.message === 'fixture_deadline')) {
        resolveRequest({status: 0, headers: {}, body: Buffer.alloc(0), aborted: true, error: error.code || error.message});
        return;
      }
      reject(error);
    });
    req.end();
  });
}

function assertJson(response, status, body, connection) {
  const payload = Buffer.from(JSON.stringify(body));
  assert.equal(response.status, status);
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(response.headers['content-length'], String(payload.length));
  assert.equal(response.headers.connection, connection);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers[WIRE_HEADER], WIRE_VERSION);
  assert.equal(response.headers['x-ae-server-class'], 'live');
  assert.equal(response.headers['transfer-encoding'], undefined);
  assert.equal(response.body.equals(payload), true);
}

test('the selected stage keeps explicit length and the historical producer pin', () => {
  assert.deepEqual(RESPONSE_FRAMING, {
    stage: 'no-forced-connection-close',
    forceConnectionClose: false,
    explicitContentLength: true,
  });
  const source = readFileSync(new URL('../src/response-completion.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes("connection: 'close'"), false);
  assert.equal(source.includes("if (RESPONSE_FRAMING.forceConnectionClose) headers.connection = 'close'"), true);
  assert.equal(source.includes("headers['content-length'] = String(payload.length)"), true);
  const server = readFileSync(new URL('../src/server.mjs', import.meta.url), 'utf8');
  assert.match(server, /deliverJsonResponse\(res, status, body, extra, completion\)/);
  assert.equal(server.includes('res.end(payload)'), false);
  for (const route of ['/v1/claims/terms', '/v1/claims/binding', '/v1/claims/claims', '/v1/payouts',
    '/v1/native-debt/import', '/v1/native-debt/enroll', '/v1/market/participation-contract']) {
    assert.equal(server.includes(route), true, route);
  }
  const succession = JSON.parse(readFileSync(resolve(root, 'vendor/hosted-wallet-market/SOURCE.json'), 'utf8'));
  assert.equal(succession.successionSource.commit, 'f461e780df010663d31d4d9a5632147cd983a52e');
  assert.equal(succession.successionSource.files['src/server.mjs'], HISTORICAL_SERVER);
  assert.equal(succession.successionSource.files['src/response-completion.mjs'], undefined);
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contractBytes.length, 39996);
});

function emptyStatus(status) {
  return {status, body: {ok: true, empty: true}};
}

function abortEarly(port, path) {
  return new Promise((resolveAbort, reject) => {
    const socket = connect({host: '127.0.0.1', port, readableHighWaterMark: 1024});
    let received = 0;
    const finish = () => resolveAbort(received);
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('timeout', finish);
    socket.on('error', error => {
      if (received > 0) finish();
      else reject(error);
    });
    socket.on('close', finish);
    socket.on('connect', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: desk.invalid\r\nConnection: keep-alive\r\n\r\n`);
    });
    socket.on('data', chunk => {
      received += chunk.length;
      if (received > 200) socket.destroy();
    });
  });
}

test('one socket reuses explicit-length responses, including unicode, buffer boundaries, no-body statuses, abort, and shutdown', async () => {
  const unicode = {ok: true, text: 'héllo 你好 😀', marker: PRIVATE};
  const unicodeBytes = Buffer.from(JSON.stringify(unicode));
  assert.ok(unicodeBytes.length > unicode.text.length);
  const routes = new Map([
    ['/unicode', {status: 200, body: unicode}],
    ['/contract', {status: 200, body: contract}],
    ['/small', {status: 200, body: padded(64)}],
    ['/mark', {status: 200, body: padded(16384)}],
    ['/over', {status: 200, body: padded(16385)}],
    ['/wide', {status: 200, body: padded(65536)}],
    ['/error', {status: 500, body: {ok: false, code: 'storage_failed'}}],
    ['/busy', {status: 503, body: {ok: false, code: 'installation_receiving_unavailable'}}],
    ['/cookie', {status: 200, body: {ok: true, value: {session: 'present'}}}],
  ]);
  const noBody = new Map([
    ['/no-content', emptyStatus(204)],
    ['/not-modified', emptyStatus(304)],
  ]);
  const logs = [];
  const completion = arm(logs);
  let calls = 0;
  const live = await listen((req, res) => {
    calls += 1;
    const url = new URL(req.url, 'http://127.0.0.1');
    const absent = noBody.get(url.pathname);
    if (absent) {
      deliverJsonResponse(res, absent.status, absent.body, {}, null);
      return;
    }
    const route = routes.get(url.pathname);
    const trace = url.pathname === '/contract' ? completion : null;
    if (trace) trace.begin(req, res);
    const extra = url.pathname === '/cookie'
      ? {'set-cookie': 'session=present; HttpOnly', 'x-cj-csrf': 'csrf-token'}
      : {};
    deliverJsonResponse(res, route.status, route.body, extra, trace);
  });
  const pooled = keepAgent();
  try {
    for (const [path, route] of routes) {
      const response = await call(live.port, path, {agent: pooled.agent, headers: {connection: 'keep-alive'}});
      assertJson(response, route.status, route.body, 'keep-alive');
      if (path === '/contract') {
        assert.match(response.headers['x-ae-completion'], /^[a-f0-9]{8}$/);
        assert.equal(response.body.length, 39996);
      } else {
        assert.equal(response.headers['x-ae-completion'], undefined);
      }
      if (path === '/cookie') {
        assert.match(String(response.headers['set-cookie']), /HttpOnly/);
        assert.equal(response.headers['x-cj-csrf'], 'csrf-token');
        assert.equal(response.headers.connection, 'keep-alive');
      }
    }
    assert.equal(pooled.opened(), 1);
    assert.equal(live.connections(), 1);
    assert.equal(calls, routes.size);

    const head = await call(live.port, '/contract', {method: 'HEAD', agent: pooled.agent, headers: {connection: 'keep-alive'}});
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal(head.headers['content-length'], '39996');
    assert.equal(head.headers.connection, 'keep-alive');
    assert.match(head.headers['x-ae-completion'], /^[a-f0-9]{8}$/);
    const again = await call(live.port, '/unicode', {agent: pooled.agent, headers: {connection: 'keep-alive'}});
    assertJson(again, 200, unicode, 'keep-alive');
    assert.equal(pooled.opened(), 1);
    assert.equal(calls, routes.size + 2);

    for (const [path, route] of noBody) {
      const response = await call(live.port, path, {agent: pooled.agent, headers: {connection: 'keep-alive'}});
      const declared = Buffer.from(JSON.stringify(route.body));
      assert.equal(response.status, route.status);
      assert.equal(response.body.length, 0);
      assert.equal(response.headers['content-length'], String(declared.length));
      assert.equal(response.headers.connection, 'keep-alive');
      assert.equal(response.headers['transfer-encoding'], undefined);
      assert.equal(response.headers['x-ae-completion'], undefined);
    }
    assert.equal(pooled.opened(), 1);

    const closed = await call(live.port, '/small', {agent: pooled.agent, headers: {connection: 'close'}});
    assertJson(closed, 200, routes.get('/small').body, 'close');
    assert.equal(pooled.opened(), 1);
    const reopened = await call(live.port, '/unicode', {agent: pooled.agent, headers: {connection: 'keep-alive'}});
    assertJson(reopened, 200, unicode, 'keep-alive');
    assert.equal(pooled.opened(), 2);

    const beforeAbort = calls;
    const received = await abortEarly(live.port, '/wide');
    assert.equal(received > 200, true);
    // Headers plus the 65536-byte body exceed one 64KiB readable chunk.
    assert.equal(received <= 65536, true);
    assert.equal(calls, beforeAbort + 1);
    const recovered = await call(live.port, '/wide', {agent: pooled.agent, headers: {connection: 'keep-alive'}});
    assertJson(recovered, 200, routes.get('/wide').body, 'keep-alive');
    assert.equal(calls, beforeAbort + 2);

    const rendered = logs.join('\n');
    assert.equal(JSON.stringify(contract).includes('Voluntary machine participation'), true);
    assert.equal(rendered.includes('Voluntary machine participation'), false);
    assert.equal(rendered.includes(PRIVATE), false);
    completion.close();
    const quiet = await call(live.port, '/contract', {agent: pooled.agent, headers: {connection: 'keep-alive'}});
    assertJson(quiet, 200, contract, 'keep-alive');
    assert.equal(quiet.headers['x-ae-completion'], undefined);
    assert.equal(logs.join('\n'), rendered);
  } finally {
    pooled.agent.destroy();
    const elapsed = await live.close();
    assert.equal(elapsed < 1000, true);
  }
});
