import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {request} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const installation = '/api/neomorphic-contributor-journey/v1/native-debt/installation';
const marker = 'UNIQUE_BODY_MARKER';

function get(socketPath, requestPath, {abort = false, headers = {}} = {}) {
  return new Promise((resolveRequest, reject) => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRequest(value);
    };
    const timer = setTimeout(() => finish({status: 0, headers: {}, body: Buffer.alloc(0), aborted: true, error: 'timeout'}), 4000);
    const req = request({
      socketPath, path: requestPath, method: 'GET', agent: false,
      headers: {host: 'desk.invalid', connection: 'close', 'x-ae-wire-version': 'c0-1', authorization: 'DO_NOT_LOG', ...headers},
    }, res => {
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
        finish({status: 0, headers: {}, body: Buffer.alloc(0), aborted: true});
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

async function report(socketPath) {
  const response = await get(socketPath, '/report', {headers: {authorization: ''}});
  assert.equal(response.status, 200);
  return JSON.parse(response.body.toString());
}

function assertRefusal(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.body.length > 0, true);
  assert.equal(response.headers['content-length'], String(response.body.length));
  assert.equal(response.headers['content-type']?.startsWith('application/json'), true);
  assert.equal(response.headers['x-ae-wire-version'], undefined);
  assert.equal(response.headers['x-ae-server-class'], undefined);
  assert.equal(response.headers['x-ae-completion'], undefined);
  const body = JSON.parse(response.body.toString());
  assert.equal(typeof body.error.code, 'string');
  assert.equal(body.error.code.length > 0, true);
}

function assertFramed(response, status) {
  assert.equal(response.status, status);
  assert.equal(Number(response.headers['content-length']), response.body.length);
  assert.equal(response.body.length > 0, true);
  assert.equal(response.headers.connection, 'close');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-ae-wire-version'], 'c0-1');
  assert.equal(response.headers['x-ae-server-class'], 'live');
  assert.equal(response.headers.vary, undefined);
  assert.equal(response.headers['transfer-encoding'], undefined);
  assert.equal(JSON.parse(response.body.toString()).ok, status === 200);
}

test('composed plaintext guard refuses before vendor send, and an admitted pipe completes', async () => {
  const app = await readFile(path.join(root, 'server/app.js'), 'utf8');
  const mount = await readFile(path.join(root, 'server/lib/hosted-wallet-market-mount.js'), 'utf8');
  assert.match(app, /ingress: \(req,res,next\) => contributor\.guardRequest\(req,res,next\)/);
  assert.match(mount, /if \(req\.socket\?\.encrypted\) return enter\(\)/);
  assert.match(mount, /return options\.ingress\(req, res, enter\)/);
  const directory = await mkdtemp(path.join(tmpdir(), 'root1156-lsnode-'));
  const socketPath = path.join(directory, 'node.sock');
  const loader = path.join(directory, 'lsnode.js');
  await writeFile(loader, `'use strict';
const http = require('node:http');
const net = require('node:net');
const {EventEmitter} = require('node:events');
module.isApplicationLoader = true;
global.LsNode = new EventEmitter();
const original = http.Server.prototype.listen;
http.Server.prototype.realListen = net.Server.prototype.listen;
http.Server.prototype.listen = function litespeedListen(target, callback) {
  return original.call(this, target, callback);
};
import(process.env.ROOT1156_HANDLER).then(handler => handler.start()).catch(error => {
  console.error(error && error.stack || String(error));
  process.exit(1);
});
`);
  const child = spawn(process.execPath, [loader], {
    cwd: root,
    env: {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '/tmp',
      ROOT1156_HANDLER: pathToFileURL(path.join(root, 'server/scripts/fixtures/installed-response-ingress-handler.mjs')).href,
      ROOT1156_SOCK: socketPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const readyAt = Date.now();
    while (!stdout.includes(`READY ${socketPath}`) && Date.now() - readyAt < 8000) {
      if (child.exitCode !== null) throw new Error(stderr || stdout || 'lsnode exited');
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
    assert.equal(stdout.includes(`READY ${socketPath}`), true, stderr);
    const [first, second] = await Promise.all([get(socketPath, installation), get(socketPath, installation)]);
    assertRefusal(first, 503);
    assertRefusal(second, 503);
    const delayed = await get(socketPath, installation);
    assertRefusal(delayed, 503);
    const plain = await get(socketPath, '/plain-off');
    assertRefusal(plain, 426);
    const again = await get(socketPath, '/plain-off');
    assertRefusal(again, 426);
    assert.equal(JSON.parse(plain.body.toString()).error.code, 'https_edge_required');
    let seen = await report(socketPath);
    assert.equal(seen.entered, 0);

    const success = await get(socketPath, '/admitted?case=success');
    assertFramed(success, 200);
    assert.match(success.headers['x-ae-completion'], /^[a-f0-9]{8}$/);
    assert.equal(success.body.toString().includes(marker), true);
    const delayedSuccess = await get(socketPath, '/admitted?case=delayed');
    assertFramed(delayedSuccess, 200);
    const busy = await get(socketPath, '/admitted?case=busy');
    assertFramed(busy, 503);
    assert.equal(JSON.parse(busy.body.toString()).code, 'installation_receiving_unavailable');
    const error = await get(socketPath, '/admitted?case=error');
    assertFramed(error, 500);
    const twice = await get(socketPath, '/admitted?case=twice');
    assertFramed(twice, 200);
    assert.equal(twice.body.toString().includes('FALLTHROUGH_MARKER'), false);
    assert.equal(twice.body.toString().includes('second_end'), false);
    await get(socketPath, '/admitted?case=abort', {abort: true});
    const recovered = await get(socketPath, '/admitted?case=success');
    assertFramed(recovered, 200);
    assert.equal(Number(recovered.headers['content-length']), recovered.body.length);
    const off = await get(socketPath, '/admitted?case=off');
    assertFramed(off, 200);
    assert.equal(off.headers['x-ae-completion'], undefined);
    await get(socketPath, '/admitted?case=destroy').catch(() => {});
    seen = await report(socketPath);
    assert.equal(seen.entered, 0);
    assert.equal(seen.admitted, true);
    assert.deepEqual(seen.second, {sent: false, id: null, bytes: 0});
    assert.equal(seen.fallthrough, 'ERR_STREAM_WRITE_AFTER_END');
    assert.equal(seen.destroyed.sent, false);
    const completionLogs = seen.logs.map(line => JSON.parse(JSON.parse(line).message.slice('installed_response_completion '.length)));
    for (const id of [success, delayedSuccess, busy, error, twice, recovered].map(item => item.headers['x-ae-completion'])) {
      const record = completionLogs.find(item => item.id === id);
      assert.ok(record, id);
      assert.equal(record.ended, true);
      assert.equal(record.finish, true);
      assert.equal(record.close, true);
      assert.equal(record.writableFinished, true);
      assert.equal(record.suppressed, false);
      assert.equal(record.bytesWrittenDelta >= record.declaredBytes, true);
    }
    assert.equal(seen.logs.some(line => line.includes(marker) || line.includes('DO_NOT_LOG') || line.includes(socketPath) || line.includes('authorization')), false);
    assert.equal(seen.logs.some(line => line.includes(off.headers['x-ae-wire-version']) && line.includes('"id":null')), false);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolveExit => child.once('exit', resolveExit));
    }
    await rm(directory, {recursive: true, force: true});
  }
});
