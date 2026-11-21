import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {createServer, request} from 'node:http';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {hostSourceSha256} from '../src/native-debt.mjs';
import {
  COMPLETION_HEADER, COMPLETION_LIMIT, WIRE_HEADER, WIRE_VERSION,
  createResponseCompletion as createWindowCompletion, deliverJsonResponse, responseCompletionLimit,
} from '../src/response-completion.mjs';

const createResponseCompletion = (limit, emit) => createWindowCompletion(limit, emit, {expiresAt: new Date(Date.now() + 60000).toISOString()});

const root = resolve(import.meta.dirname, '../../..');
const HISTORICAL_SERVER = '313b6093da34e4e81d82ce0a1ff7db057947a85ee87c836d55e4f27368a59b92';
const marker = 'UNIQUE_BODY_MARKER';
const successBody = () => ({ok: true, value: {schema: 'pilot.funded-installed-source.v1', marker, n: 7}});

function parseLog(line) {
  const entry = JSON.parse(line);
  assert.deepEqual(Object.keys(entry), ['timestamp', 'level', 'message']);
  assert.equal(entry.level, 'INFO');
  assert.equal(new Date(entry.timestamp).toISOString(), entry.timestamp);
  assert.ok(entry.message.startsWith('installed_response_completion '));
  const record = JSON.parse(entry.message.slice('installed_response_completion '.length));
  assert.deepEqual(Object.keys(record), ['id', 'status', 'declaredBytes', 'ended', 'finish', 'close', 'writableFinished', 'bytesWrittenDelta', 'suppressed']);
  return record;
}

async function serve(handler) {
  const directory = mkdtempSync(join(tmpdir(), 'root1156-completion-'));
  const socketPath = join(directory, 'node.sock');
  const server = createServer((req, res) => {
    req.originalUrl = req.url;
    const url = new URL(req.url, 'https://127.0.0.1');
    Promise.resolve(handler(req, res, url)).catch(error => {
      if (!res.headersSent && !res.destroyed) res.destroy(error);
    });
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolveListen);
  });
  return {
    socketPath, server,
    async close() {
      server.closeAllConnections();
      await new Promise(resolveClose => server.close(resolveClose));
      rmSync(directory, {recursive: true, force: true});
    },
  };
}

function get(socketPath, path, {abort = false, headers = {}} = {}) {
  return new Promise((resolveRequest, reject) => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRequest(value);
    };
    const timer = setTimeout(() => finish({status: 0, headers: {}, body: Buffer.alloc(0), aborted: true, error: 'timeout'}), 3000);
    const req = request({socketPath, path, method: 'GET', agent: false, headers: {host: 'desk.invalid', connection: 'close', ...headers}}, res => {
      const chunks = [];
      res.on('data', chunk => {
        chunks.push(chunk);
        if (abort) req.destroy();
      });
      const done = aborted => finish({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), aborted});
      res.on('end', () => done(false));
      res.on('aborted', () => done(true));
    });
    req.on('error', error => {
      if (abort && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
        finish({status: 0, headers: {}, body: Buffer.alloc(0), aborted: true, error: error.code});
        return;
      }
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    req.end();
  });
}

function assertEnvelope(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  assert.equal(response.status, status);
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(response.headers['content-length'], String(payload.length));
  assert.equal(response.headers.connection, 'close');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers[WIRE_HEADER], WIRE_VERSION);
  assert.equal(response.headers['x-ae-server-class'], 'live');
  assert.equal(response.headers.vary, undefined);
  assert.equal(response.headers['transfer-encoding'], undefined);
  assert.equal(response.body.length, payload.length);
  assert.equal(response.body.toString(), payload.toString());
  assert.equal(response.headers['content-length'], String(response.body.length));
}

test('only an integer budget from 0 through 32 arms, and every other value stays off', () => {
  assert.equal(COMPLETION_LIMIT, 32);
  assert.equal(createWindowCompletion(32).budget(), 0, 'count alone stays off');
  for (const value of [undefined, null, '', 0, '0', '00']) assert.equal(responseCompletionLimit(value), 0, String(value));
  for (const value of [1, '1', 32, '32']) assert.equal(responseCompletionLimit(value), Number(value));
  for (const value of [-1, '33', 33, 1.5, '1.5', '32abc', ' 32', true, false, {}, [], 'true']) {
    assert.equal(responseCompletionLimit(value), 0, String(value));
  }
  const idle = createResponseCompletion(undefined, () => { throw new Error('inert completion logged'); });
  assert.equal(idle.budget(), 0);
  assert.equal(idle.take(), null);
  assert.equal(createResponseCompletion(32).budget(), 32);
});

test('plaintext pipe send keeps a positive framed body for success, busy, error, and delay', async () => {
  const logs = [];
  const completion = createResponseCompletion(8, line => logs.push(line));
  const cases = {
    '/success': [200, successBody()],
    '/busy': [503, {ok: false, code: 'installation_receiving_unavailable'}],
    '/error': [500, {ok: false, code: 'storage_failed'}],
    '/delayed': [200, successBody()],
  };
  const live = await serve(async (_req, res, url) => {
    if (url.pathname === '/delayed') await new Promise(resolveDelay => setTimeout(resolveDelay, 30));
    const [status, body] = cases[url.pathname];
    deliverJsonResponse(res, status, body, {}, completion);
  });
  try {
    for (const [path, [status, body]] of Object.entries(cases)) {
      const before = logs.length;
      const response = await get(live.socketPath, path);
      assertEnvelope(response, status, body);
      assert.match(response.headers[COMPLETION_HEADER], /^[a-f0-9]{8}$/);
      const record = await waitRecord(logs, response.headers[COMPLETION_HEADER]);
      assert.equal(logs.length, before + 1);
      assert.equal(record.status, status);
      assert.equal(record.declaredBytes, response.body.length);
      assert.equal(record.declaredBytes > 0, true);
      assert.equal(record.ended, true);
      assert.equal(record.finish, true);
      assert.equal(record.close, true);
      assert.equal(record.writableFinished, true);
      assert.equal(record.suppressed, false);
      assertLocalSocketDelta(record);
      assert.equal(logs.at(-1).includes(marker), false);
      assert.equal(logs.at(-1).includes('DO_NOT_LOG'), false);
      assert.equal(logs.at(-1).includes(live.socketPath), false);
    }
    assert.equal(completion.budget(), 4);
  } finally {
    await live.close();
  }
});

test('a second end and a destroyed response do not replace or empty the first body', async () => {
  const logs = [];
  const completion = createResponseCompletion(4, line => logs.push(line));
  let second = null;
  let secondEnd = null;
  let destroyed = null;
  const live = await serve((req, res) => {
    if (req.url === '/twice') {
      deliverJsonResponse(res, 200, successBody(), {}, completion);
      second = deliverJsonResponse(res, 500, {ok: false, code: 'second_end'}, {}, completion);
      res.on('error', error => { secondEnd = error.code; });
      res.end('FALLTHROUGH_MARKER');
      return;
    }
    res.destroy();
    destroyed = deliverJsonResponse(res, 200, {ok: true, value: {marker: 'DESTROYED_BODY'}}, {}, completion);
  });
  try {
    const response = await get(live.socketPath, '/twice', {headers: {authorization: 'DO_NOT_LOG'}});
    assertEnvelope(response, 200, successBody());
    assert.equal(response.body.includes('FALLTHROUGH_MARKER'), false);
    assert.equal(response.body.includes('second_end'), false);
    assert.equal(second.sent, false);
    assert.equal(second.bytes, 0);
    assert.match(second.id, /^[a-f0-9]{8}$/);
    assert.equal(secondEnd, 'ERR_STREAM_WRITE_AFTER_END');
    const failed = await get(live.socketPath, '/destroy').catch(error => error);
    assert.equal(destroyed.sent, false);
    assert.equal(destroyed.bytes, 0);
    assert.match(destroyed.id, /^[a-f0-9]{8}$/);
    const written = await waitRecord(logs, response.headers[COMPLETION_HEADER]);
    assert.equal(written.suppressed, false);
    assertLocalSocketDelta(written);
    const ended = await waitRecord(logs, second.id);
    assertSuppressed(ended, 500, true);
    const preended = await waitRecord(logs, destroyed.id);
    assertSuppressed(preended, 200, false);
    assert.equal(logs.length, 3);
    assert.equal(completion.budget(), 1);
    assert.equal(logs.some(line => line.includes(marker) || line.includes('DESTROYED_BODY') || line.includes('FALLTHROUGH_MARKER') || line.includes('second_end') || line.includes('DO_NOT_LOG') || line.includes(live.socketPath)), false);
    assert.ok(failed);
  } finally {
    await live.close();
  }
});

test('an early close is followed by one complete recovery and an inert budget adds nothing', async () => {
  const logs = [];
  const armed = createResponseCompletion(2, line => logs.push(line));
  const inert = createResponseCompletion(0, line => logs.push(line));
  const live = await serve(async (req, res) => {
    if (req.url === '/off') {
      deliverJsonResponse(res, 200, successBody(), {}, inert);
      return;
    }
    if (req.url === '/null') {
      deliverJsonResponse(res, 200, successBody(), {}, null);
      return;
    }
    deliverJsonResponse(res, 200, successBody(), {}, armed);
  });
  try {
    const aborted = await get(live.socketPath, '/abort', {abort: true, headers: {authorization: 'DO_NOT_LOG'}});
    if (aborted.status === 200) assert.equal(aborted.body.toString().includes(marker), true);
    const recovered = await get(live.socketPath, '/recover', {headers: {authorization: 'DO_NOT_LOG'}});
    assertEnvelope(recovered, 200, successBody());
    assert.match(recovered.headers[COMPLETION_HEADER], /^[a-f0-9]{8}$/);
    const record = await waitRecord(logs, recovered.headers[COMPLETION_HEADER]);
    assert.equal(record.suppressed, false);
    assertLocalSocketDelta(record);
    const inertDestroyed = createResponseCompletion(0, line => logs.push(line));
    const silent = deliverJsonResponse({destroyed: true, writableEnded: false, closed: false, writableFinished: false}, 200, successBody(), {}, inertDestroyed);
    assert.deepEqual(silent, {sent: false, id: null, bytes: 0});
    assert.equal(inertDestroyed.budget(), 0);
    const logged = logs.length;
    const off = await get(live.socketPath, '/off');
    const bare = await get(live.socketPath, '/null');
    assertEnvelope(off, 200, successBody());
    assertEnvelope(bare, 200, successBody());
    assert.equal(off.headers[COMPLETION_HEADER], undefined);
    assert.equal(bare.headers[COMPLETION_HEADER], undefined);
    assert.equal(logs.length, logged);
    assert.equal(logs.some(line => line.includes(marker) || line.includes('DO_NOT_LOG') || line.includes(live.socketPath)), false);
    assert.equal(inert.budget(), 0);
  } finally {
    await live.close();
  }
});

test('the vendor send delegates once and the historical succession hash stays put', () => {
  const source = readFileSync(new URL('../src/server.mjs', import.meta.url), 'utf8');
  assert.match(source, /deliverJsonResponse\(res, status, body, extra, completion\)/);
  assert.equal(source.includes('res.end(payload)'), false);
  const succession = JSON.parse(readFileSync(join(root, 'vendor/hosted-wallet-market/SOURCE.json'), 'utf8'));
  assert.equal(succession.successionSource.files['src/server.mjs'], HISTORICAL_SERVER);
  const pin = JSON.parse(readFileSync(join(root, 'server/foundry/activation/private-control-pin.json'), 'utf8'));
  for (const file of ['vendor/hosted-wallet-market/src/server.mjs', 'vendor/hosted-wallet-market/src/response-completion.mjs']) {
    assert.equal(pin.files[file], createHash('sha256').update(readFileSync(join(root, file))).digest('hex'), file);
  }
  assert.match(hostSourceSha256(root), /^[a-f0-9]{64}$/);
});

function assertLocalSocketDelta(record) {
  assert.equal(Number.isSafeInteger(record.bytesWrittenDelta), true);
  assert.equal(Number.isSafeInteger(record.declaredBytes), true);
  // bytesWritten includes the status line and headers, so the delta is not body delivery.
  assert.equal(record.bytesWrittenDelta > record.declaredBytes, true);
}

function assertSuppressed(record, status, ended) {
  assert.equal(record.suppressed, true);
  assert.equal(record.status, status);
  assert.equal(record.declaredBytes, null);
  assert.equal(record.bytesWrittenDelta, null);
  assert.equal(record.finish, false);
  assert.equal(record.ended, ended);
  for (const value of Object.values(record)) {
    assert.equal(value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number', true);
  }
}

async function waitRecord(logs, id) {
  const start = Date.now();
  while (Date.now() - start < 2000) {
    const record = logs.map(parseLog).find(item => item.id === id);
    if (record) return record;
    await new Promise(resolveWait => setTimeout(resolveWait, 10));
  }
  throw new Error(`completion log missing (${logs.length})`);
}
