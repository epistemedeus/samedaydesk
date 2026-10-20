import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chmodSync, mkdirSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import http from 'node:http';
import https from 'node:https';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import test from 'node:test';
import pg from 'pg';
import {openHostedMarket} from '../src/server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const vendor = path.join(root, 'vendor/hosted-wallet-market');
const PREFIX = '/api/neomorphic-contributor-journey';
const FEE = `0x${'22'.repeat(20)}`;
const RAIL = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const REVIEW = `${PREFIX}/v1/review?taskId=task_root1225cancel01&reservationId=rsv_root1225cancel01`;
const COOKIE = '__Host-neo_contributor=root1225-synthetic';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function textOf(args) {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first.text === 'string') return first.text;
  return '';
}
async function waitFor(predicate, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(15);
  }
  assert.fail(`timed out after ${ms}ms`);
}
function listenStub() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { body = {}; }
      const method = body.method;
      let result = null;
      if (method === 'eth_chainId') result = '0x2105';
      else if (method === 'eth_blockNumber') result = '0x324c9c8';
      else if (method === 'eth_call') result = `0x${(6).toString(16).padStart(64, '0')}`;
      else {
        res.end(JSON.stringify({jsonrpc: '2.0', id: body.id ?? 1, error: {code: -32601, message: 'refused'}}));
        return;
      }
      res.end(JSON.stringify({jsonrpc: '2.0', id: body.id ?? 1, result}));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, url: `http://127.0.0.1:${server.address().port}`})));
}
function mockReq({aborted = false, socket = null, cookie = null} = {}) {
  const req = new EventEmitter();
  req.method = 'GET';
  req.url = REVIEW;
  req.originalUrl = REVIEW;
  req.headers = {'x-ae-wire-version': 'c0-1'};
  if (cookie) req.headers.cookie = cookie;
  req.aborted = aborted;
  req.socket = socket;
  return req;
}
function mockRes(overrides = {}) {
  const res = new EventEmitter();
  res.destroyed = false;
  res.writableEnded = false;
  res.closed = false;
  res.headersSent = false;
  res.writable = true;
  res.statusCode = 0;
  res.headers = null;
  res.body = null;
  res.writes = 0;
  Object.assign(res, overrides);
  res.writeHead = (status, headers) => {
    res.writes += 1;
    res.statusCode = status;
    res.headersSent = true;
    res.headers = headers;
  };
  res.end = payload => {
    res.writes += 1;
    res.body = payload ? JSON.parse(Buffer.from(payload).toString()) : null;
    res.writableEnded = true;
  };
  return res;
}
function openRequest(origin, ca, route, {timeout = 20000} = {}) {
  let req;
  const done = new Promise((resolve, reject) => {
    req = https.request(`${origin}${route}`, {
      method: 'GET', ca, rejectUnauthorized: true, timeout,
      headers: {'x-ae-wire-version': 'c0-1', connection: 'close'},
    }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let parsed = null;
        try { parsed = JSON.parse(text || 'null'); } catch { parsed = {raw: text.slice(0, 200)}; }
        resolve({status: incoming.statusCode, body: parsed});
      });
      incoming.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
  req.end();
  return {req, done};
}

test('requester cancellation returns honest 503 and keeps the read slot until drain', {timeout: 180000}, async () => {
  const originalConnect = pg.Pool.prototype.connect;
  const originalQuery = pg.Client.prototype.query;
  const savedMachine = process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE;
  delete process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE;
  let connectCount = 0;
  let holdConnect = null;
  let releaseGate = () => {};
  let releaseHold = () => {};
  const probe = {mode: null};
  let market;
  let httpsServer;
  let stub;
  let cluster;
  let admin;
  let work;
  const {startCluster} = await import(pathToFileURL(path.join(root, 'server/scripts/root404-pg-cluster.mjs')).href);
  const {applyAdditiveSchema, applyServingSchema} = await import(pathToFileURL(path.join(vendor, 'src/migrate.mjs')).href);
  const {seedStaging} = await import(pathToFileURL(path.join(vendor, 'src/seed.mjs')).href);
  const {writeStagingCerts} = await import(pathToFileURL(path.join(vendor, 'src/tls.mjs')).href);
  pg.Client.prototype.query = function (...args) {
    const text = textOf(args);
    if (probe.mode === 'hold' && /journey_account_sessions/i.test(text)) {
      probe.mode = null;
      if (probe.entered) probe.entered();
      return new Promise(resolve => {
        releaseHold = () => resolve({rows: [], rowCount: 0});
      });
    }
    if (probe.mode === 'disk' && /journey_account_sessions/i.test(text)) {
      probe.mode = null;
      throw Object.assign(new Error('disk'), {code: 'XX000'});
    }
    if (probe.mode === 'cancelled' && /journey_account_sessions/i.test(text)) {
      probe.mode = null;
      throw Object.assign(new Error('read_cancelled'), {codeName: 'read_cancelled'});
    }
    return originalQuery.apply(this, args);
  };
  function armGate() {
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const gate = {wait, connects: 0, releases: []};
    holdConnect = gate;
    releaseGate = () => release();
    return gate;
  }
  async function settle() {
    releaseHold();
    releaseGate();
    const deadline = Date.now() + 4000;
    while (market && Date.now() < deadline) {
      if (market.reviewReceivingStatus().review.active === 0) return;
      await sleep(20);
    }
  }
  try {
    work = await mkdtemp(path.join(tmpdir(), 'root1225-cancel-'));
    const registryRoot = path.join(work, 'registry');
    mkdirSync(registryRoot, {recursive: true, mode: 0o700});
    chmodSync(registryRoot, 0o700);
    cluster = await startCluster();
    admin = new pg.Client({connectionString: cluster.connectionString, connectionTimeoutMillis: 10000});
    admin.on('error', () => {});
    await admin.connect();
    await applyServingSchema(admin, {repo: root});
    await applyAdditiveSchema(admin);
    await seedStaging(admin);
    stub = await listenStub();
    const tls = writeStagingCerts(path.join(work, 'tls'));
    market = await openHostedMarket({
      mode: 'private', label: 'STAGING', chain: 'eip155:8453', payments: 'off', publicReads: '0',
      fundedTasks: 'off', humanAssets: 'off', tls: 'files', tenant: 'root1225-cancel',
      earnedSchema: 'cj227_earned_work', schemaName: 'hosted_wallet_market', listenHost: '127.0.0.1',
      databaseUrl: cluster.connectionString, rpcUrl: stub.url, feeRecipient: FEE, settlementToken: RAIL,
      cert: tls.cert, key: tls.key, dischargeRegistry: registryRoot, replayKey: randomBytes(32).toString('hex'),
      ownerToken: `ew_${randomBytes(18).toString('base64url')}`, sdsRoot: root, readAcceptedSource: async () => null,
    });
    pg.Pool.prototype.connect = function (...args) {
      const pending = originalConnect.apply(this, args);
      const gate = holdConnect;
      connectCount += 1;
      if (!gate) return pending;
      holdConnect = null;
      gate.connects += 1;
      return pending.then(client => {
        const release = client.release.bind(client);
        client.release = destroy => {
          gate.releases.push(destroy === true);
          return release(destroy);
        };
        return gate.wait.then(() => client);
      });
    };
    httpsServer = https.createServer({key: tls.key, cert: tls.cert}, (req, res) => market.handle(req, res));
    httpsServer.on('clientError', () => {});
    httpsServer.requestTimeout = 0;
    httpsServer.headersTimeout = 60000;
    httpsServer.timeout = 0;
    await new Promise((resolve, reject) => httpsServer.once('error', reject).listen(0, '127.0.0.1', resolve));
    const origin = `https://127.0.0.1:${httpsServer.address().port}`;
    const slot = () => market.reviewReceivingStatus().review;

    const complete = mockRes();
    await market.handle(mockReq(), complete);
    assert.equal(complete.statusCode, 401, 'normal complete response');
    assert.equal(complete.body?.ok, false);
    assert.equal(complete.body?.code, 'unauthenticated');
    assert.equal(complete.writes, 2);
    assert.equal(slot().active, 0);
    assert.equal(JSON.stringify(complete.body).includes('native_paid'), false);

    const beforeEarly = connectCount;
    const earlyRes = mockRes();
    await market.handle(mockReq({aborted: true}), earlyRes);
    assert.equal(earlyRes.statusCode, 503);
    assert.equal(earlyRes.body?.code, 'review_receiving_unavailable');
    assert.notEqual(earlyRes.body?.code, 'storage_failed');
    assert.equal(connectCount, beforeEarly, 'abort before pool acquire issues no connect');
    assert.equal(slot().active, 0);

    const during = armGate();
    const duringSocket = new EventEmitter();
    duringSocket.destroyed = false;
    const duringReq = mockReq({socket: duringSocket});
    const duringRes = mockRes();
    const duringPending = market.handle(duringReq, duringRes);
    await waitFor(() => during.connects === 1);
    duringSocket.destroyed = true;
    duringSocket.emit('close');
    await duringPending;
    assert.equal(duringRes.statusCode, 503);
    assert.equal(duringRes.body?.code, 'review_receiving_unavailable');
    assert.notEqual(duringRes.body?.code, 'storage_failed');
    assert.deepEqual(during.releases, []);
    releaseGate();
    await waitFor(() => during.releases.length === 1);
    assert.deepEqual(during.releases, [true]);
    await waitFor(() => slot().active === 0);
    const recovered = mockRes();
    await market.handle(mockReq(), recovered);
    assert.equal(recovered.statusCode, 401);
    assert.equal(recovered.body?.code, 'unauthenticated');

    const ignored = armGate();
    const ignoredSocket = new EventEmitter();
    ignoredSocket.destroyed = false;
    const ignoredReq = mockReq({socket: ignoredSocket});
    const ignoredRes = mockRes();
    const ignoredPending = market.handle(ignoredReq, ignoredRes);
    await waitFor(() => ignored.connects === 1);
    ignoredReq.emit('end');
    ignoredReq.emit('close');
    assert.equal(ignoredReq.listenerCount('aborted') > 0, true);
    assert.equal(ignoredSocket.listenerCount('close') > 0, true);
    releaseGate();
    await ignoredPending;
    assert.equal(ignoredRes.statusCode, 401);
    assert.equal(ignoredRes.body?.code, 'unauthenticated');
    assert.equal(slot().active, 0);

    for (const closed of [{destroyed: true}, {writableEnded: true}, {writable: false}]) {
      const closedRes = mockRes(closed);
      await market.handle(mockReq({aborted: true}), closedRes);
      assert.equal(closedRes.writes, 0, JSON.stringify(closed));
      assert.equal(closedRes.statusCode, 0);
      assert.equal(closedRes.body, null);
    }
    assert.equal(slot().active, 0);

    probe.mode = 'disk';
    const disk = mockRes();
    await market.handle(mockReq({cookie: COOKIE}), disk);
    assert.equal(disk.statusCode, 500);
    assert.equal(disk.body?.code, 'storage_failed');
    assert.equal(slot().active, 0);

    probe.mode = 'cancelled';
    const mapped = mockRes();
    await market.handle(mockReq({cookie: COOKIE}), mapped);
    assert.equal(mapped.statusCode, 503);
    assert.equal(mapped.body?.code, 'review_receiving_unavailable');
    assert.notEqual(mapped.body?.code, 'storage_failed');
    assert.equal(JSON.stringify(mapped.body).includes('native_paid'), false);
    assert.equal(slot().active, 0);

    probe.mode = 'hold';
    let entered;
    const enteredPromise = new Promise(resolve => { entered = resolve; });
    probe.entered = entered;
    const heldReq = mockReq({cookie: COOKIE});
    const heldRes = mockRes();
    const held = market.handle(heldReq, heldRes);
    await enteredPromise;
    assert.equal(slot().active, 1);
    const busyStarted = Date.now();
    const busyRes = mockRes();
    await market.handle(mockReq({cookie: COOKIE}), busyRes);
    assert.ok(Date.now() - busyStarted < 1000);
    assert.equal(busyRes.statusCode, 503);
    assert.equal(busyRes.body?.code, 'review_receiving_unavailable');
    assert.equal(slot().active, 1);
    heldReq.aborted = true;
    heldReq.emit('aborted');
    await held;
    assert.equal(heldRes.statusCode, 503);
    assert.equal(heldRes.body?.code, 'review_receiving_unavailable');
    assert.equal(slot().active, 1, 'uncooperative query keeps the one slot');
    const stillBusy = mockRes();
    await market.handle(mockReq(), stillBusy);
    assert.equal(stillBusy.statusCode, 503);
    assert.equal(stillBusy.body?.code, 'review_receiving_unavailable');
    assert.equal(slot().active, 1);
    releaseHold();
    await waitFor(() => slot().active === 0 && slot().drained === true);
    const afterDrain = mockRes();
    await market.handle(mockReq(), afterDrain);
    assert.equal(afterDrain.statusCode, 401);
    assert.equal(afterDrain.body?.code, 'unauthenticated');
    assert.equal(slot().active, 0);

    const httpsComplete = await openRequest(origin, tls.ca, REVIEW).done;
    assert.equal(httpsComplete.status, 401);
    assert.equal(httpsComplete.body?.code, 'unauthenticated');

    const httpsGate = armGate();
    const hanging = openRequest(origin, tls.ca, REVIEW);
    await waitFor(() => httpsGate.connects === 1);
    hanging.req.destroy();
    let destroyed;
    try { destroyed = await hanging.done; } catch (error) { destroyed = {status: 0, error}; }
    assert.notEqual(destroyed.status, 200);
    if (destroyed.body?.code) assert.notEqual(destroyed.body.code, 'storage_failed');
    releaseGate();
    await waitFor(() => httpsGate.releases.includes(true));
    await waitFor(() => slot().active === 0 && slot().drained === true);
    const httpsRecovered = await openRequest(origin, tls.ca, REVIEW).done;
    assert.equal(httpsRecovered.status, 401);
    assert.equal(httpsRecovered.body?.code, 'unauthenticated');
  } finally {
    await settle();
    pg.Pool.prototype.connect = originalConnect;
    pg.Client.prototype.query = originalQuery;
    if (httpsServer) await new Promise(resolve => httpsServer.close(resolve));
    if (market) await market.close().catch(() => {});
    if (stub) await new Promise(resolve => stub.server.close(resolve));
    if (admin) await admin.end().catch(() => {});
    if (cluster) await cluster.stop().catch(() => {});
    if (work) await rm(work, {recursive: true, force: true});
    if (savedMachine === undefined) delete process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE;
    else process.env.HOSTED_WALLET_MARKET_MACHINE_PROFILE = savedMachine;
  }
});
