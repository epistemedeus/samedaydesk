import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, request} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createResponseCompletion, deliverJsonResponse, COMPLETION_HEADER} from '../src/response-completion.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const body = {ok: true, value: 'PRIVATE_BODY_MUST_NOT_APPEAR'};
const logsOf = logs => logs.filter(line => JSON.parse(line).message.startsWith('installed_response_lifecycle '))
  .map(line => JSON.parse(JSON.parse(line).message.slice('installed_response_lifecycle '.length)));
const arm = (logs, ms = 60000, emit = line => logs.push(line)) => createResponseCompletion(16, emit,
  {expiresAt: new Date(Date.now() + ms).toISOString()});
async function until(check) {
  const end = Date.now() + 2000;
  while (!check() && Date.now() < end) await delay(5);
  assert.ok(check(), 'bounded observation missing');
}
async function serve(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'response-lifecycle-'));
  const socketPath = join(dir, 'node.sock');
  const server = createServer((req, res) => {
    Promise.resolve(fn(req, res)).catch(() => res.destroy());
  });
  await new Promise(resolve => server.listen(socketPath, resolve));
  return {socketPath, async close() {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, {recursive: true, force: true});
  }};
}
function call(socketPath, {method = 'GET', cancel, payload} = {}) {
  return new Promise((resolve, reject) => {
    const req = request({socketPath, path: '/PRIVATE_PATH?PRIVATE_QUERY', method, agent: false,
      headers: {host: 'private.invalid', authorization: 'PRIVATE_TOKEN', cookie: 'PRIVATE_COOKIE',
        'content-type': 'application/json', connection: 'close'}}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)}));
    });
    req.setTimeout(3000, () => req.destroy(new Error('fixture_deadline')));
    req.on('error', error => cancel ? resolve({error: error.code}) : reject(error));
    cancel?.then(() => req.destroy());
    req.end(payload);
  });
}
function assertPrivate(logs) {
  const serialized = logs.join('\n');
  for (const marker of ['PRIVATE_', 'Bearer', 'response-lifecycle-', 'cookie', 'authorization']) {
    assert.equal(serialized.includes(marker), false, marker);
  }
  for (const item of logsOf(logs)) {
    assert.deepEqual(Object.keys(item), ['id', 'stage', 'elapsedMs', 'status', 'declaredBytes',
      'actualStatus', 'headersSent', 'ended', 'writableFinished', 'destroyed', 'bodyAllowed',
      'requestComplete', 'requestAborted', 'bytesWrittenDelta']);
    assert.match(item.id, /^[a-f0-9]{8}$/);
    assert.equal(item.elapsedMs >= 0, true);
  }
}

test('diagnostic requires count and an explicit future window of at most ten minutes', () => {
  const now = 1700000000000;
  for (const expiresAt of [undefined, '', 'bad', new Date(now).toISOString(),
    new Date(now - 1).toISOString(), new Date(now + 600001).toISOString()]) {
    const completion = createResponseCompletion(16, () => assert.fail('off logged'), {expiresAt, now: () => now});
    assert.equal(completion.budget(), 0);
    assert.equal(completion.take(), null);
    const res = {destroyed: false, writableEnded: false, writeHead() {}, end() {}};
    completion.begin({}, res);
    assert.equal(deliverJsonResponse(res, 200, body, {}, completion).id, null);
    completion.close();
  }
  const completion = createResponseCompletion(1, () => {}, {expiresAt: new Date(now + 600000).toISOString(), now: () => now});
  assert.equal(completion.budget(), 1);
  completion.close();
});

test('delayed GET and consumed POST complete after normal request close on a Unix socket', async () => {
  const logs = [], completion = arm(logs);
  let normalRequestCloses = 0;
  const live = await serve(async (req, res) => {
    completion.begin(req, res);
    req.once('close', () => { if (req.complete && !req.aborted) normalRequestCloses++; });
    for await (const _chunk of req) { /* consume without retaining or logging input */ }
    await delay(40);
    deliverJsonResponse(res, 200, body, {}, completion);
  });
  try {
    for (const options of [{}, {method: 'POST', payload: '{}'}]) {
      const result = await call(live.socketPath, options);
      assert.equal(result.body.toString(), JSON.stringify(body));
      assert.equal(result.headers['content-length'], String(result.body.length));
      const id = result.headers[COMPLETION_HEADER];
      await until(() => logsOf(logs).some(item => item.id === id && item.stage === 'socket_close'));
      const stages = logsOf(logs).filter(item => item.id === id);
      for (const name of ['entered', 'request_end', 'intended', 'headers_written', 'end_call', 'end_return', 'end_callback', 'finish', 'close']) {
        assert.ok(stages.some(item => item.stage === name), name);
      }
      const end = stages.find(item => item.stage === 'end_return');
      assert.equal(end.requestComplete, true);
      assert.equal(end.requestAborted, false);
      assert.equal(end.bodyAllowed, true);
      assert.equal(end.declaredBytes, result.body.length);
    }
    assert.equal(normalRequestCloses, 2);
    assertPrivate(logs);
  } finally { completion.close(); await live.close(); }
});

test('a controlled downstream body drop can coexist with a complete Node handoff, then recover', async () => {
  const logs = [], completion = arm(logs);
  let drop = true;
  const upstream = await serve((req, res) => {
    completion.begin(req, res);
    deliverJsonResponse(res, 200, body, {}, completion);
  });
  const edge = await serve((_req, res) => new Promise((resolve, reject) => {
    const incoming = request({socketPath: upstream.socketPath, path: '/', agent: false}, reply => {
      const chunks = [];
      reply.on('data', chunk => chunks.push(chunk));
      reply.on('error', reject);
      reply.on('end', () => {
        const payload = drop ? Buffer.alloc(0) : Buffer.concat(chunks);
        res.writeHead(reply.statusCode, {'content-type': reply.headers['content-type'],
          'content-length': payload.length, [COMPLETION_HEADER]: reply.headers[COMPLETION_HEADER]});
        res.end(payload); resolve();
      });
    });
    incoming.setTimeout(2000, () => incoming.destroy());
    incoming.on('error', reject); incoming.end();
  }));
  try {
    const lost = await call(edge.socketPath);
    assert.equal(lost.status, 200);
    assert.equal(lost.body.length, 0);
    const id = lost.headers[COMPLETION_HEADER];
    await until(() => logsOf(logs).some(item => item.id === id && item.stage === 'finish'));
    const finish = logsOf(logs).find(item => item.id === id && item.stage === 'finish');
    assert.equal(finish.declaredBytes, Buffer.byteLength(JSON.stringify(body)));
    assert.equal(finish.bytesWrittenDelta > finish.declaredBytes, true);
    drop = false;
    const restored = await call(edge.socketPath);
    assert.equal(restored.body.toString(), JSON.stringify(body));
    assert.notEqual(restored.headers[COMPLETION_HEADER], id);
    assertPrivate(logs);
  } finally { completion.close(); await edge.close(); await upstream.close(); }
});

test('disconnect before intent is retained as a suppressed send; the next response recovers', async () => {
  const logs = [], completion = arm(logs);
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const live = await serve(async (req, res) => {
    completion.begin(req, res);
    if (calls++ === 0) { enter(); await gate; }
    deliverJsonResponse(res, 200, body, {}, completion);
  });
  try {
    const pending = call(live.socketPath, {cancel: entered});
    await entered;
    await until(() => logsOf(logs).some(item => item.stage === 'socket_close'));
    release();
    await pending;
    await until(() => logsOf(logs).some(item => item.stage === 'suppressed'));
    const suppressed = logsOf(logs).find(item => item.stage === 'suppressed');
    assert.equal(suppressed.headersSent, false);
    assert.equal(suppressed.destroyed, true);
    assert.equal(suppressed.bytesWrittenDelta, 0);
    const recovered = await call(live.socketPath);
    assert.equal(recovered.body.toString(), JSON.stringify(body));
    assertPrivate(logs);
  } finally { release(); completion.close(); await live.close(); }
});

test('window expiry removes observers without ending a pending response or extending the window', async () => {
  const logs = [], completion = arm(logs, 150);
  let enter, release, response, initialFinish;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const live = await serve(async (req, res) => {
    response = res; initialFinish = res.listenerCount('finish');
    completion.begin(req, res); enter(); await gate;
    deliverJsonResponse(res, 200, body, {}, completion);
  });
  try {
    const pending = call(live.socketPath);
    pending.catch(() => {}); // Preserve an assertion failure while finally closes the socket.
    await entered;
    await until(() => logsOf(logs).some(item => item.stage === 'window_end'));
    assert.equal(response.listenerCount('finish'), initialFinish);
    assert.equal(response.writableEnded, false);
    assert.equal(completion.budget(), 0);
    const before = logs.length;
    release();
    const result = await pending;
    assert.equal(result.headers[COMPLETION_HEADER], undefined);
    assert.equal(result.body.toString(), JSON.stringify(body));
    assert.equal(logs.length, before);
    assertPrivate(logs);
  } finally { release(); completion.close(); await live.close(); }
});

test('a failing diagnostic sink does not change the response', async () => {
  const completion = arm([], 60000, () => { throw new Error('unavailable sink'); });
  const live = await serve((req, res) => {
    completion.begin(req, res); deliverJsonResponse(res, 200, body, {}, completion);
  });
  try { assert.equal((await call(live.socketPath)).body.toString(), JSON.stringify(body)); }
  finally { completion.close(); await live.close(); }
});

test('expiry removes summary and stage observers from an ended response under backpressure', async () => {
  const logs = [], completion = arm(logs, 150);
  const value = {ok: true, value: 'x'.repeat(4 * 1024 * 1024)};
  let response, initialFinish, initialClose, reply, client;
  const live = await serve((req, res) => {
    response = res;
    initialFinish = res.listenerCount('finish'); initialClose = res.listenerCount('close');
    completion.begin(req, res); deliverJsonResponse(res, 200, value, {}, completion);
  });
  const pending = new Promise((resolve, reject) => {
    client = request({socketPath: live.socketPath, path: '/', agent: false}, res => {
      reply = res; res.pause();
      let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; });
      res.on('error', reject); res.on('end', () => resolve(bytes));
    });
    client.setTimeout(3000, () => client.destroy());
    client.on('error', reject); client.end();
  });
  pending.catch(() => {});
  try {
    await until(() => logsOf(logs).some(item => item.stage === 'window_end'));
    assert.equal(response.writableEnded, true);
    assert.equal(response.writableFinished, false);
    assert.equal(response.listenerCount('finish'), initialFinish);
    assert.equal(response.listenerCount('close'), initialClose);
    const before = logs.length;
    reply.resume();
    assert.equal(await pending, Buffer.byteLength(JSON.stringify(value)));
    assert.equal(logs.length, before);
  } finally { reply?.resume(); client.destroy(); completion.close(); await live.close(); }
});

test('Node HEAD suppression is visible and is distinct from GET/POST delivery', async () => {
  const logs = [], completion = arm(logs);
  const live = await serve((req, res) => {
    completion.begin(req, res); deliverJsonResponse(res, 200, body, {}, completion);
  });
  try {
    const response = await call(live.socketPath, {method: 'HEAD'});
    assert.equal(response.status, 200);
    assert.equal(response.body.length, 0);
    assert.equal(response.headers['content-length'], String(Buffer.byteLength(JSON.stringify(body))));
    await until(() => logsOf(logs).some(item => item.stage === 'finish'));
    assert.equal(logsOf(logs).find(item => item.stage === 'finish').bodyAllowed, false);
    assertPrivate(logs);
  } finally { completion.close(); await live.close(); }
});

test('a synchronous header error is observed and the ordinary fallback still sends its body', async () => {
  const logs = [], completion = arm(logs);
  const fallback = {ok: false, code: 'fixture_failure'};
  const live = await serve((req, res) => {
    completion.begin(req, res);
    try { deliverJsonResponse(res, 200, body, {'bad header': 'PRIVATE_HEADER'}, completion); }
    catch { deliverJsonResponse(res, 500, fallback, {}, completion); }
  });
  try {
    const response = await call(live.socketPath);
    assert.equal(response.status, 500);
    assert.equal(response.body.toString(), JSON.stringify(fallback));
    const stages = logsOf(logs);
    assert.ok(stages.some(item => item.stage === 'send_error' && item.status === 200));
    assert.ok(stages.some(item => item.stage === 'repeat_intended' && item.status === 500));
    assertPrivate(logs);
  } finally { completion.close(); await live.close(); }
});
