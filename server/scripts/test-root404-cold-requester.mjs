import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile, execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {mkdtemp, readFile} from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {startCluster} from './root404-pg-cluster.mjs';

const sds = resolve(import.meta.dirname, '../..');
const guide = readFileSync(join(sds, 'vendor/hosted-wallet-market/examples/OPERATOR-TESTS.md'), 'utf8');
const example = join(sds, 'vendor/hosted-wallet-market/examples/cold-requester.mjs');
const profileBin = join(sds, 'vendor/hosted-wallet-market/bin/machine-profile.mjs');
const debtBin = join(sds, 'vendor/hosted-wallet-market/bin/installed-debt.mjs');
const prefix = '/api/neomorphic-contributor-journey';
// Only the first shell block is this legacy fixture; later blocks explain separate recovery exercises.
const fixture = guide.match(/```sh\n([\s\S]*?)\n```/)?.[1] ?? '';
const commands = [...fixture.matchAll(/^node cold-requester\.mjs .+$/gm)].map(match => match[0]);

function opensslCert(dir) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(dir, 'tls.key'), '-out', join(dir, 'tls.crt')], {stdio: 'ignore'});
  chmodSync(join(dir, 'tls.key'), 0o600);
}
async function freePort() {
  const server = http.createServer();
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}
function rpcStub() {
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(data); } catch { /* empty */ }
      let result = '0x0';
      if (body.method === 'eth_chainId') result = '0x2105';
      else if (body.method === 'eth_blockNumber') result = '0x10';
      else if (body.method === 'eth_call') result = '0x' + (6n).toString(16).padStart(64, '0');
      else { res.end(JSON.stringify({jsonrpc: '2.0', id: body.id, error: {code: -32601, message: 'method'}})); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({jsonrpc: '2.0', id: body.id, result}));
    });
  });
  return new Promise(resolveListen => server.listen(0, '127.0.0.1', () => resolveListen(server)));
}
function request(origin, ca, route, {method = 'GET', body, headers = {}} = {}) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolveReq, reject) => {
    const req = https.request(origin + route, {method, ca, headers: {'x-ae-wire-version': 'c0-1', ...(payload ? {'content-type': 'application/json', 'content-length': String(payload.length)} : {}), ...headers}, timeout: 20000}, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => { let parsed = null; try { parsed = JSON.parse(text); } catch { parsed = null; } resolveReq({status: res.statusCode, body: parsed}); });
    });
    req.on('error', reject);
    req.end(payload);
  });
}
function runShell(line, cwd, env) {
  return new Promise(resolve => {
    execFile('sh', ['-c', line], {cwd, env, encoding: 'utf8'}, (error, stdout) => {
      const text = `${stdout || ''}`;
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      resolve({status: error ? error.status ?? 1 : 0, stdout: text, json});
    });
  });
}

test('cold requester signup, unfunded post, discovery, and funnel on the real mount', async () => {
  assert.equal(commands.length, 18);
  const cluster = await startCluster();
  const rpc = await rpcStub();
  const scratch = await mkdtemp(join(tmpdir(), 'root404-cold-'));
  opensslCert(scratch);
  const database = `contributor_journey_staging_root404_${randomBytes(3).toString('hex')}`;
  const empty = mkdtempSync(join(tmpdir(), 'root404-empty-'));
  copyFileSync(example, join(empty, 'cold-requester.mjs'));
  let httpsServer;
  let app;
  const relativeProfile = 'var/root404-mount-capability.json';
  try {
    const adminUrl = new URL(cluster.connectionString);
    const adminEnv = {...process.env, PGHOST: '127.0.0.1', PGPORT: String(cluster.port), PGUSER: cluster.username, PGDATABASE: 'postgres', PGSSLMODE: 'verify-full', PGSSLROOTCERT: adminUrl.searchParams.get('sslrootcert'), PGSSLCERT: adminUrl.searchParams.get('sslcert'), PGSSLKEY: adminUrl.searchParams.get('sslkey')};
    execFileSync(join(cluster.pgBin, 'createdb'), ['-h', '127.0.0.1', '-p', String(cluster.port), '-U', cluster.username, database], {env: adminEnv, stdio: 'ignore'});
    const hba = join(cluster.dataDir, 'pg_hba.conf');
    writeFileSync(hba, readFileSync(hba, 'utf8').replaceAll(' clientcert=verify-full', ''));
    execFileSync(join(cluster.pgBin, 'pg_ctl'), ['-D', cluster.dataDir, 'reload'], {stdio: 'ignore'});
    const url = new URL(cluster.connectionString);
    url.pathname = '/' + database;
    url.searchParams.delete('sslcert');
    url.searchParams.delete('sslkey');
    const databaseUrl = url.href;
    const port = await freePort();
    const origin = `https://127.0.0.1:${port}`;
    const journeyEnv = {
      CONTRIBUTOR_JOURNEY_MODE: 'staging', CONTRIBUTOR_JOURNEY_INSTALLED: '1', CONTRIBUTOR_JOURNEY_TRUST_PROXY: '0',
      CONTRIBUTOR_JOURNEY_DATABASE_URL: databaseUrl, CONTRIBUTOR_JOURNEY_OWNER_TOKEN: randomBytes(18).toString('hex'),
      CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN: randomBytes(18).toString('hex'), CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN: origin,
      CONTRIBUTOR_JOURNEY_REPLAY_KEY: randomBytes(32).toString('hex'), CONTRIBUTOR_JOURNEY_INTEGRITY_KEY: randomBytes(32).toString('hex'),
      CONTRIBUTOR_JOURNEY_CURSOR_KEY: randomBytes(32).toString('hex'), CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS: '[]',
      CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX: '10000', CONTRIBUTOR_JOURNEY_PUBLIC_READS: '0',
    };
    const journey = await import(pathToFileURL(join(sds, 'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js')).href);
    const prepared = await journey.prepareJourneyDeployment({env: journeyEnv, enroll: false});
    assert.equal(prepared.createsAccounts, false);
    assert.equal(prepared.createsPayments, false);
    const migrator = new pg.Client({connectionString: databaseUrl});
    await migrator.connect();
    await migrator.query('SET search_path TO cj227_earned_work');
    const {applyAdditiveSchema} = await import(pathToFileURL(join(sds, 'vendor/hosted-wallet-market/src/migrate.mjs')).href);
    await applyAdditiveSchema(migrator);
    await migrator.end();
    const seeder = new pg.Client({connectionString: databaseUrl});
    await seeder.connect();
    const {seedStaging} = await import(pathToFileURL(join(sds, 'vendor/hosted-wallet-market/src/seed.mjs')).href);
    const {LEGACY_OBLIGATION_ID, LEGACY_TERMS_VERSION} = await import(pathToFileURL(join(sds, 'vendor/hosted-wallet-market/src/preserve.mjs')).href);
    await seedStaging(seeder);
    const before = await seeder.query('SELECT reward_amount, terms_version, payout_state FROM cj227_earned_work.earned_work_obligations WHERE id = $1', [LEGACY_OBLIGATION_ID]);
    assert.equal(before.rows[0].terms_version, LEGACY_TERMS_VERSION);
    await seeder.end();
    const ca = await readFile(join(scratch, 'tls.crt'));
    const key = await readFile(join(scratch, 'tls.key'));
    const market = extra => ({
      mode: 'private', label: 'PRIVATE', chain: 'eip155:8453', payments: 'off', publicReads: '0', fundedTasks: 'off', humanAssets: 'off',
      tls: 'verified-edge', origin, tenant: 'root404-cold', earnedSchema: 'cj227_earned_work', schemaName: 'hosted_wallet_market',
      databaseUrl, rpcUrl: `http://127.0.0.1:${rpc.address().port}`, feeRecipient: '0x' + '11'.repeat(20),
      settlementToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', replayKey: journeyEnv.CONTRIBUTOR_JOURNEY_REPLAY_KEY,
      ownerToken: journeyEnv.CONTRIBUTOR_JOURNEY_OWNER_TOKEN, ...extra,
    });
    const {createSdsApp} = await import(pathToFileURL(join(sds, 'server/app.js')).href);
    async function boot(extra = {}) {
      app = createSdsApp({
        hostedWalletMarket: market({env: {...journeyEnv, ...(extra.env || {})}, ...extra.options}),
        neomorphicContributorJourney: {env: journeyEnv},
        neomorphicOpportunity: {env: {}}, correspondence: {env: {}}, hostedUsefulJourney: {env: {}}, managedWatch: {env: {}},
      });
      const mounted = app.get('hostedWalletMarket');
      if (extra.awaitOpen !== false && mounted.opened) await mounted.opened;
      await app.get('neoContributorJourney').ensure();
      httpsServer = https.createServer({key, cert: ca}, app);
      await new Promise(resolveListen => httpsServer.listen(port, '127.0.0.1', resolveListen));
      return mounted;
    }
    async function stop() {
      if (httpsServer) await new Promise(resolveClose => httpsServer.close(resolveClose));
      httpsServer = null;
      if (app) await app.get('hostedWalletMarket')?.close?.();
      await app?.get('neoContributorJourney')?.close?.();
      app = null;
    }
    await boot({env: {HOSTED_WALLET_MARKET_MACHINE_PROFILE: ''}});
    const journeyState = app.get('neoContributorJourney').state;
    assert.equal(journeyState.status, 'ready', JSON.stringify(journeyState.diagnostic || journeyState.reason));
    const absent = await request(origin, ca, prefix + '/v1/market/profile');
    const absentDiscover = await request(origin, ca, prefix + '/v1/market/discover?limit=1');
    const wrongWire = await request(origin, ca, prefix + '/v1/market/profile', {headers: {'x-ae-wire-version': '1'}});
    assert.equal(absent.status, 404);
    assert.equal(absent.body?.error?.code, 'not_found');
    assert.equal(absentDiscover.status, 404);
    assert.equal(wrongWire.status, 409);
    assert.equal(wrongWire.body?.code, 'wire_version_unsupported');
    await stop();

    let switchCode = null;
    try { await boot({env: {HOSTED_WALLET_MARKET_MACHINE_PROFILE: '1'}}); }
    catch (error) { switchCode = error.codeName || error.code || error.message; }
    assert.equal(switchCode, 'machine_profile_refused');
    await stop();

    mkdirSync(join(sds, 'var'), {recursive: true, mode: 0o700});
    const generated = JSON.parse(execFileSync(process.execPath, [profileBin, '--sds-root', sds, '--origin', origin, '--tenant', 'root404-cold', '--money', 'unfunded', '--out', relativeProfile], {encoding: 'utf8'}));
    assert.equal(generated.signerAuthority, false);
    assert.equal(statSync(join(sds, relativeProfile)).mode & 0o777, 0o600);
    let authorityCode = null;
    try { await boot({env: {HOSTED_WALLET_MARKET_MACHINE_PROFILE: generated.sourceBound}, options: {machineAuthority: {networkClass: 'sandbox'}}}); }
    catch (error) { authorityCode = error.codeName || error.code || error.message; }
    assert.equal(authorityCode, 'machine_authority_refused');
    await stop();
    await boot({env: {HOSTED_WALLET_MARKET_MACHINE_PROFILE: generated.sourceBound}});
    const health = await request(origin, ca, prefix + '/healthz');
    assert.equal(health.body?.value?.publicEnabled, false);
    assert.equal(health.body?.value?.paymentsActivation, false);
    assert.equal(health.body?.value?.fundedTasks, 'off');
    assert.equal(health.body?.value?.humanAssets, 'off');
    assert.equal(health.body?.value?.machineCapability?.signerAuthority, false);
    assert.equal(health.body?.value?.machineCapability?.publicMoney, false);

    const caFile = join(empty, 'ca.crt');
    writeFileSync(caFile, ca);
    const expectedFailure = new Set(['wrong-wire', 'conflict-post', 'post-without-csrf', 'fund']);
    const results = [];
    const shellEnv = {...process.env, ORIGIN: origin, CA: caFile, PATH: process.env.PATH};
    for (const line of commands) {
      const parts = line.split(/\s+/);
      assert.equal(parts[0], 'node');
      assert.equal(parts[1], 'cold-requester.mjs');
      const args = parts.slice(2);
      const command = args[0];
      const secret = args.includes('--secret-file') ? args[args.indexOf('--secret-file') + 1] : '';
      const outcome = await runShell(line, empty, shellEnv);
      const contributorPost = command === 'post' && secret === 'contributor.json';
      const expectFail = expectedFailure.has(command) || contributorPost;
      assert.equal(outcome.status, expectFail ? 1 : 0, `${line} ${outcome.stdout}`);
      assert.equal(outcome.stdout.includes('password'), false, line);
      assert.equal(outcome.stdout.includes('recoveryCode'), false, line);
      assert.equal(outcome.stdout.includes('__Host-neo_contributor'), false, line);
      results.push({key: secret ? `${command}:${secret}` : command, json: outcome.json});
    }
    const last = key => results.filter(row => row.key === key).at(-1).json;
    const byName = new Map(results.map(row => [row.key, row.json]));
    assert.equal(byName.get('profile').money, 'unfunded');
    assert.equal(byName.get('profile').signerAuthority, false);
    assert.equal(byName.get('wrong-wire').code, 'wire_version_unsupported');
    assert.equal(byName.get('signup:requester.json').role, 'requester');
    assert.equal(byName.get('replay-signup:requester.json').replay, true);
    assert.equal(byName.get('readback:requester.json').recoveryStored, true);
    assert.equal(last('login:requester.json').ok, true);
    assert.equal(byName.get('recover:requester.json').ok, true);
    assert.equal(byName.get('post:requester.json').state, 'unfunded_interest');
    assert.equal(byName.get('replay-post:requester.json').replay, true);
    assert.equal(byName.get('conflict-post:requester.json').code, 'operation_conflict');
    assert.equal(byName.get('post-without-csrf:requester.json').code, 'csrf_required');
    assert.equal(byName.get('discover:requester.json').matched, true);
    assert.equal(byName.get('discover:requester.json').moneyQualified, false);
    assert.equal(byName.get('discover:requester.json').fundingState, 'unfunded_interest');
    assert.equal(byName.get('discover:requester.json').assigned, false);
    assert.equal(byName.get('post:contributor.json').code, 'requester_required');
    assert.equal(byName.get('interest:contributor.json').state, 'unfunded_interest');
    assert.equal(byName.get('interest:contributor.json').commissioned, false);
    assert.notEqual(byName.get('fund:requester.json').status, 200);
    assert.equal(byName.get('fund:requester.json').paidWork, false);
    assert.equal(byName.get('signup:abandoned.json').role, 'requester');
    for (const name of ['requester.json', 'contributor.json', 'abandoned.json']) {
      assert.equal(statSync(join(empty, name)).mode & 0o777, 0o600);
    }
    const requester = JSON.parse(readFileSync(join(empty, 'requester.json'), 'utf8'));
    const contributor = JSON.parse(readFileSync(join(empty, 'contributor.json'), 'utf8'));
    const abandoned = JSON.parse(readFileSync(join(empty, 'abandoned.json'), 'utf8'));
    const cookie = String(requester.cookie || '');
    const login = await request(origin, ca, prefix + '/v1/market/post', {method: 'POST', headers: {origin, cookie, 'idempotency-key': 'root404-no-origin-omitted'}});
    assert.equal(login.status, 401);
    const legacy = await request(origin, ca, prefix + '/v1/tasks', {
      method: 'POST', headers: {origin, cookie, 'x-cj-csrf': requester.csrf, 'idempotency-key': 'root404legacy1'},
      body: {title: 'Legacy route', publicText: 'Old task route.', grossAtomic: '20', railCostAtomic: '0', feeRecipient: '0x' + '11'.repeat(20), captures: ['once']},
    });
    assert.equal(legacy.status, 400);
    assert.equal(legacy.body?.code, 'atomic_refused');
    const reader = new pg.Client({connectionString: databaseUrl});
    await reader.connect();
    const obligation = await reader.query('SELECT reward_amount, terms_version, payout_state FROM cj227_earned_work.earned_work_obligations WHERE id = $1', [LEGACY_OBLIGATION_ID]);
    assert.deepEqual(obligation.rows[0], before.rows[0]);
    assert.equal((await reader.query('SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_tasks')).rows[0].n, 1);
    assert.equal((await reader.query("SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_funding")).rows[0].n, 0);
    const cohort = await reader.query('SELECT spec->>\'cohort\' AS cohort FROM cj227_earned_work.ae14_market_tasks');
    assert.deepEqual(cohort.rows.map(row => row.cohort), ['unknown']);
    await reader.end();
    const funnelEnv = {...process.env, DATABASE_URL: databaseUrl, HOSTED_WALLET_MARKET_EARNED_SCHEMA: 'cj227_earned_work', HOSTED_WALLET_MARKET_TENANT: 'root404-cold'};
    const openFunnel = JSON.parse(execFileSync(process.execPath, [debtBin, 'funnel'], {env: funnelEnv, encoding: 'utf8'}));
    assert.equal(openFunnel.result.cohort, 'unknown');
    assert.equal(openFunnel.result.signups, 3);
    assert.equal(openFunnel.result.requesterSignupsWithoutListing, 1);
    assert.equal(openFunnel.result.unfundedListings, 1);
    assert.equal(openFunnel.result.interests, 1);
    assert.equal(openFunnel.result.discoveryImpressions >= 1, true);
    assert.equal(openFunnel.result.impressionIdentity, 'listing_event');
    assert.equal(openFunnel.result.funding, 0);
    assert.equal(openFunnel.result.paidWork, false);
    assert.equal(openFunnel.secretPrinted, false);
    const exclude = {accountIds: [requester.accountId, contributor.accountId, abandoned.accountId], taskIds: [requester.taskId], operationIds: [requester.operations.signup.idempotencyKey, contributor.operations.signup.idempotencyKey, abandoned.operations.signup.idempotencyKey, requester.operations.post.idempotencyKey]};
    const excludeFile = join(scratch, 'exclude.json');
    writeFileSync(excludeFile, JSON.stringify(exclude), {mode: 0o600});
    const closedFunnel = JSON.parse(execFileSync(process.execPath, [debtBin, 'funnel', '--exclude', excludeFile], {env: funnelEnv, encoding: 'utf8'}));
    assert.equal(closedFunnel.result.signups, 0);
    assert.equal(closedFunnel.result.requesterSignupsWithoutListing, 0);
    assert.equal(closedFunnel.result.unfundedListings, 0);
    assert.equal(closedFunnel.result.interests, 0);
    assert.equal(closedFunnel.result.discoveryImpressions, 0);
    assert.equal(closedFunnel.result.funding, 0);
    assert.equal(JSON.stringify(closedFunnel).includes(requester.accountId), false);
    assert.equal(JSON.stringify(closedFunnel).includes(requester.taskId), false);
  } finally {
    try { if (httpsServer) httpsServer.close(); } catch { /* closed */ }
    try { if (app) await app.get('hostedWalletMarket')?.close?.(); } catch { /* closed */ }
    try { await app?.get('neoContributorJourney')?.close?.(); } catch { /* closed */ }
    try { rpc.close(); } catch { /* closed */ }
    try { await cluster.stop(); } catch { /* closed */ }
    rmSync(scratch, {recursive: true, force: true});
    rmSync(empty, {recursive: true, force: true});
    rmSync(join(sds, relativeProfile), {force: true});
    try { rmSync(join(sds, 'var')); } catch { /* retained directory */ }
  }
});
