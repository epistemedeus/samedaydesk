import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile, chmod} from 'node:fs/promises';
import {createServer, request} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {startCluster} from './root404-pg-cluster.mjs';
import {issueContributorHttpsQualification} from '../lib/contributor-https-qualification.js';

const root = path.resolve(import.meta.dirname, '../..');
const installation = '/api/neomorphic-contributor-journey/v1/native-debt/installation';
const manifest = JSON.parse(await readFile(new URL('../../vendor/neomorphic-contributor-journey/SOURCE.json', import.meta.url), 'utf8'));
const sourceCommit = manifest.sourceCommit;

function sleep(ms) {
  return new Promise(resolveWait => setTimeout(resolveWait, ms));
}

function rpcStub() {
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(data); } catch { /* empty */ }
      let result = '0x0';
      if (body.method === 'eth_chainId') result = '0x2105';
      else if (body.method === 'eth_blockNumber') result = '0x10';
      else if (body.method === 'eth_call') result = '0x' + (6n).toString(16).padStart(64, '0');
      else {
        res.end(JSON.stringify({jsonrpc: '2.0', id: body.id, error: {code: -32601, message: 'method'}}));
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({jsonrpc: '2.0', id: body.id, result}));
    });
  });
  return new Promise(resolveListen => server.listen(0, '127.0.0.1', () => resolveListen(server)));
}

function get(socketPath, requestPath, {headers = {}} = {}) {
  return new Promise((resolveRequest, reject) => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRequest(value);
    };
    const timer = setTimeout(() => finish({status: 0, headers: {}, body: Buffer.alloc(0), error: 'timeout'}), 8000);
    const req = request({
      socketPath, path: requestPath, method: 'GET', agent: false,
      headers: {host: 'desk.invalid', connection: 'close', 'x-ae-wire-version': 'c0-1', ...headers},
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      const done = () => finish({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)});
      res.on('end', done);
      res.on('aborted', done);
    });
    req.on('error', error => {
      if (!settled && (error.code === 'ECONNRESET' || error.code === 'EPIPE')) {
        finish({status: 0, headers: {}, body: Buffer.alloc(0), error: error.code});
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

function openGet(socketPath, requestPath, headers) {
  let req;
  let settled = false;
  const promise = new Promise(resolveRequest => {
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRequest(value);
    };
    const timer = setTimeout(() => finish({status: 0, headers: {}, body: Buffer.alloc(0), error: 'timeout'}), 8000);
    req = request({
      socketPath, path: requestPath, method: 'GET', agent: false,
      headers: {host: 'desk.invalid', connection: 'close', 'x-ae-wire-version': 'c0-1', ...headers},
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      const done = () => finish({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)});
      res.on('end', done);
      res.on('aborted', done);
    });
    req.on('error', error => finish({status: 0, headers: {}, body: Buffer.alloc(0), error: error.code || 'error'}));
    req.end();
  });
  return {promise, settled: () => settled, destroy: () => req.destroy()};
}

function recordsFrom(text) {
  const records = [];
  for (const line of text.split('\n')) {
    const marker = 'installed_response_completion ';
    if (!line.includes(marker)) continue;
    const entry = JSON.parse(line);
    records.push(JSON.parse(entry.message.slice(marker.length)));
  }
  return records;
}

function assertHandlerFrame(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.body.length > 0, true);
  assert.equal(response.headers['content-length'], String(response.body.length));
  assert.equal(response.headers.connection, 'close');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-ae-wire-version'], 'c0-1');
  assert.equal(response.headers['x-ae-server-class'], 'live');
  assert.equal(response.headers.vary, undefined);
  assert.equal(response.headers['transfer-encoding'], undefined);
  assert.match(response.headers['x-ae-completion'], /^[a-f0-9]{8}$/);
  const body = JSON.parse(response.body.toString());
  assert.deepEqual(body, {ok: false, code});
}

test('ready plaintext installation GET covers authority failure, unbound read, delay, and recovery', {timeout: 120_000}, async () => {
  const cluster = await startCluster();
  const rpc = await rpcStub();
  const directory = await mkdtemp(path.join(tmpdir(), 'root1156-ready-'));
  const socketPath = path.join(directory, 'node.sock');
  const loader = path.join(directory, 'lsnode.js');
  const envFile = path.join(directory, 'env.json');
  const readyFile = path.join(directory, 'ready');
  const ownerToken = `cj227-fixture-owner-${randomBytes(12).toString('hex')}`;
  const adminToken = `cj227-fixture-admin-${randomBytes(12).toString('hex')}`;
  let child = null;
  let holder = null;
  try {
    const database = `contributor_journey_staging_root1156_${randomBytes(3).toString('hex')}`;
    const adminUrl = new URL(cluster.connectionString);
    const adminEnv = {
      ...process.env,
      PGHOST: '127.0.0.1', PGPORT: String(cluster.port), PGUSER: cluster.username, PGDATABASE: 'postgres',
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: adminUrl.searchParams.get('sslrootcert'),
      PGSSLCERT: adminUrl.searchParams.get('sslcert'), PGSSLKEY: adminUrl.searchParams.get('sslkey'),
    };
    execFileSync(path.join(cluster.pgBin, 'createdb'), ['-h', '127.0.0.1', '-p', String(cluster.port), '-U', cluster.username, database], {env: adminEnv, stdio: 'ignore'});
    const hba = path.join(cluster.dataDir, 'pg_hba.conf');
    await writeFile(hba, (await readFile(hba, 'utf8')).replaceAll(' clientcert=verify-full', ''));
    execFileSync(path.join(cluster.pgBin, 'pg_ctl'), ['-D', cluster.dataDir, 'reload'], {stdio: 'ignore'});
    const url = new URL(cluster.connectionString);
    url.pathname = `/${database}`;
    url.searchParams.delete('sslcert');
    url.searchParams.delete('sslkey');
    const databaseUrl = url.href;
    const journey = await import(pathToFileURL(path.join(root, 'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js')).href);
    const preparedEnv = {
      CONTRIBUTOR_JOURNEY_MODE: 'staging', CONTRIBUTOR_JOURNEY_INSTALLED: '1', CONTRIBUTOR_JOURNEY_TRUST_PROXY: '0',
      CONTRIBUTOR_JOURNEY_DATABASE_URL: databaseUrl, CONTRIBUTOR_JOURNEY_OWNER_TOKEN: ownerToken,
      CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN: adminToken, CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN: 'https://desk.invalid',
      CONTRIBUTOR_JOURNEY_REPLAY_KEY: randomBytes(32).toString('hex'), CONTRIBUTOR_JOURNEY_INTEGRITY_KEY: randomBytes(32).toString('hex'),
      CONTRIBUTOR_JOURNEY_CURSOR_KEY: randomBytes(32).toString('hex'), CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS: '[]',
      CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX: '10000', CONTRIBUTOR_JOURNEY_PUBLIC_READS: '0',
    };
    const prepared = await journey.prepareJourneyDeployment({env: preparedEnv, enroll: false});
    assert.equal(prepared.enrolled, false);
    assert.equal(prepared.createsPayments, false);
    const migrator = new pg.Client({connectionString: databaseUrl});
    await migrator.connect();
    await migrator.query('SET search_path TO cj227_earned_work');
    const {applyAdditiveSchema} = await import(pathToFileURL(path.join(root, 'vendor/hosted-wallet-market/src/migrate.mjs')).href);
    await applyAdditiveSchema(migrator);
    await migrator.end();
    const seeder = new pg.Client({connectionString: databaseUrl});
    await seeder.connect();
    const {seedStaging} = await import(pathToFileURL(path.join(root, 'vendor/hosted-wallet-market/src/seed.mjs')).href);
    await seedStaging(seeder);
    await seeder.end();

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
    const loaderSha256 = createHash('sha256').update(await readFile(loader)).digest('hex');
    const sdsCommit = '5'.repeat(40);
    const checks = Object.fromEntries(['providerHttpsPolicy', 'certificateVerifiedHttps', 'plaintextRefusal', 'backendIsolation']
      .map(name => [name, {
        receivedAt: new Date().toISOString(),
        receiptSha256: createHash('sha256').update(`distinct ready fixture receipt ${name}`).digest('hex'),
      }]));
    const issueEnv = {
      ...preparedEnv,
      CONTRIBUTOR_JOURNEY_MODE: 'disabled',
      CONTRIBUTOR_DESK_MANAGED_ENABLED: '0',
      CONTRIBUTOR_JOURNEY_PUBLIC_READS: '0',
      CONTRIBUTOR_JOURNEY_ORIGIN: 'https://desk.invalid',
      CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT: sdsCommit,
      CONTRIBUTOR_JOURNEY_SOURCE_COMMIT: sourceCommit,
      CONTRIBUTOR_DESK_INSTALLATION_ID: 'synthetic-installation-v2',
      CONTRIBUTOR_JOURNEY_STORE_ID: 'ready-fixture-store',
      CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA: 'cj227_earned_work',
      CONTRIBUTOR_JOURNEY_CORRESPONDENCE_SCHEMA: 'cj227_correspondence',
    };
    const {qualification} = await issueContributorHttpsQualification({
      schema: 'sds.contributor-https-only-receiving.v2', profile: 'staging',
      installationId: 'synthetic-installation-v2', sdsCommit, loaderSha256, checks,
    }, issueEnv);
    const serving = {
      ...issueEnv,
      CONTRIBUTOR_JOURNEY_MODE: 'staging',
      CONTRIBUTOR_DESK_MANAGED_ENABLED: '1',
      CONTRIBUTOR_DESK_INGRESS_MODE: 'litespeed-https-only',
      CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS: '[]',
      CONTRIBUTOR_DESK_ASSETS_ENABLED: '0',
      CONTRIBUTOR_DESK_HTTPS_QUALIFICATION: qualification,
      HOSTED_WALLET_MARKET_ORIGIN: 'https://desk.invalid',
      HOSTED_WALLET_MARKET_TENANT: 'ready-fixture',
      HOSTED_WALLET_MARKET_RPC: `http://127.0.0.1:${rpc.address().port}`,
      HOSTED_WALLET_MARKET_FEE_RECIPIENT: `0x${'11'.repeat(20)}`,
      HOSTED_WALLET_MARKET_SETTLEMENT_TOKEN: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    };
    await writeFile(envFile, JSON.stringify(serving), {mode: 0o600});
    await chmod(envFile, 0o600);
    child = spawn(process.execPath, [loader], {
      cwd: root,
      env: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '/tmp',
        ROOT1156_HANDLER: pathToFileURL(path.join(root, 'server/scripts/fixtures/installed-response-ready-handler.mjs')).href,
        ROOT1156_SOCK: socketPath,
        ROOT1156_ENV_FILE: envFile,
        ROOT1156_READY_FILE: readyFile,
        HOSTED_WALLET_MARKET_RESPONSE_COMPLETION_LIMIT: '8',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const readyAt = Date.now();
    let ready = false;
    while (Date.now() - readyAt < 30000) {
      if (child.exitCode !== null) throw new Error((stderr || stdout || 'lsnode exited').slice(-1500));
      try { ready = (await readFile(readyFile, 'utf8')).trim() === 'ready'; } catch { ready = false; }
      if (ready && stdout.includes(`READY ${socketPath}`)) break;
      await sleep(20);
    }
    assert.equal(ready, true, (stderr || stdout || 'ready file missing').slice(-1500));
    assert.equal(stdout.includes(`READY ${socketPath}`), true, (stderr || 'ready line missing').slice(-1500));

    const auth = {authorization: `Bearer ${ownerToken}`};
    const [first, second] = await Promise.all([
      get(socketPath, installation),
      get(socketPath, installation),
    ]);
    assertHandlerFrame(first, 403, 'authority_required');
    assertHandlerFrame(second, 403, 'authority_required');
    assert.equal(first.body.toString(), second.body.toString());
    assert.notEqual(first.headers['x-ae-completion'], second.headers['x-ae-completion']);

    // enroll:false. The real handler's completed read is the unbound refusal, not a 200 envelope.
    const unbound = await get(socketPath, installation, {headers: auth});
    assertHandlerFrame(unbound, 409, 'discharge_consumer_unbound');
    assert.equal(unbound.body.toString().includes(ownerToken), false);

    holder = new pg.Client({connectionString: databaseUrl});
    await holder.connect();
    await holder.query('BEGIN');
    await holder.query('LOCK TABLE hosted_wallet_market.consumer_enrollment IN ACCESS EXCLUSIVE MODE');
    const started = Date.now();
    let delayedSettled = false;
    const delayedPromise = get(socketPath, installation, {headers: auth}).then(value => {
      delayedSettled = true;
      return value;
    });
    const watcher = new pg.Client({connectionString: databaseUrl});
    await watcher.connect();
    let waiting = false;
    while (Date.now() - started < 2000) {
      const found = await watcher.query("SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%consumer_enrollment%'");
      if (found.rowCount > 0) { waiting = true; break; }
      await sleep(15);
    }
    await watcher.end();
    assert.equal(waiting, true);
    await sleep(40);
    assert.equal(delayedSettled, false);
    await holder.query('ROLLBACK');
    await holder.end();
    holder = null;
    const delayed = await delayedPromise;
    assert.equal(Date.now() - started >= 40, true);
    assertHandlerFrame(delayed, 409, 'discharge_consumer_unbound');
    assert.equal(delayed.body.toString(), unbound.body.toString());

    const again = new pg.Client({connectionString: databaseUrl});
    await again.connect();
    await again.query('BEGIN');
    await again.query('LOCK TABLE hosted_wallet_market.consumer_enrollment IN ACCESS EXCLUSIVE MODE');
    holder = again;
    const early = openGet(socketPath, installation, auth);
    const watcher2 = new pg.Client({connectionString: databaseUrl});
    await watcher2.connect();
    let blocked = false;
    const earlyStart = Date.now();
    while (Date.now() - earlyStart < 2000) {
      const found = await watcher2.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%consumer_enrollment%'");
      if (found.rows[0].n > 0) { blocked = true; break; }
      await sleep(15);
    }
    await watcher2.end();
    assert.equal(blocked, true);
    assert.equal(early.settled(), false);
    early.destroy();
    await holder.query('ROLLBACK');
    await holder.end();
    holder = null;
    const aborted = await early.promise;
    assert.equal(aborted.status === 200 && aborted.body.length === 0, false);
    if (aborted.status !== 0) assertHandlerFrame(aborted, aborted.status, JSON.parse(aborted.body.toString()).code);
    const recovered = await get(socketPath, installation, {headers: auth});
    assertHandlerFrame(recovered, 409, 'discharge_consumer_unbound');
    assert.equal(recovered.body.toString(), unbound.body.toString());

    const loggedAt = Date.now();
    let seen = recordsFrom(stdout);
    while (Date.now() - loggedAt < 1000 && [first, second, unbound, delayed, recovered].some(response => !seen.some(item => item.id === response.headers['x-ae-completion']))) {
      await sleep(20);
      seen = recordsFrom(stdout);
    }
    const framed = [first, second, unbound, delayed, recovered].concat(aborted.status ? [aborted] : []);
    for (const response of framed) {
      const record = seen.find(item => item.id === response.headers['x-ae-completion']);
      assert.ok(record, response.headers['x-ae-completion']);
      assert.equal(record.suppressed, false);
      assert.equal(record.declaredBytes, response.body.length);
      assert.equal(Number.isSafeInteger(record.bytesWrittenDelta) && record.bytesWrittenDelta > record.declaredBytes, true);
      assert.equal(record.finish, true);
      assert.equal(record.close, true);
    }
    for (const record of seen) {
      assert.equal(record.suppressed === true || record.suppressed === false, true);
      if (record.suppressed) {
        assert.equal(record.declaredBytes, null);
        assert.equal(record.bytesWrittenDelta, null);
        assert.equal(record.finish, false);
      }
      for (const value of Object.values(record)) {
        assert.equal(value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number', true);
      }
    }
    assert.equal(seen.length <= 8, true);
    const rendered = stdout.split('\n').filter(line => line.includes('installed_response_completion ')).join('\n');
    assert.equal(rendered.includes(ownerToken), false);
    assert.equal(rendered.includes(adminToken), false);
    assert.equal(rendered.includes(databaseUrl), false);
    assert.equal(rendered.includes(socketPath), false);
    assert.equal(rendered.includes('Bearer'), false);
    assert.equal(rendered.includes(qualification), false);
    assert.equal(rendered.includes(installation), false);
  } finally {
    if (holder) {
      await holder.query('ROLLBACK').catch(() => {});
      await holder.end().catch(() => {});
    }
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const exited = await Promise.race([
        new Promise(resolveExit => child.once('exit', resolveExit)),
        sleep(1000).then(() => null),
      ]);
      if (exited === null && child.exitCode === null) child.kill('SIGKILL');
      if (child.exitCode === null) await new Promise(resolveExit => child.once('exit', resolveExit));
    }
    await new Promise(resolveClose => rpc.close(resolveClose));
    await cluster.stop().catch(() => {});
    await rm(directory, {recursive: true, force: true});
  }
});
