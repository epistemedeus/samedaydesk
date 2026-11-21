#!/usr/bin/env node
// Contained zero-value private upgrade for the H120010 bundle.
// Postgres, TLS, and the account file live only in the caller-supplied state
// directory. Nothing here calls a production host, signer, grant, or paid API.
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import pg from 'pg';
import {startCluster, stopCluster} from './root404-pg-cluster.mjs';
import {
  PIN, applyBundle, buildBundle, closureDrift, compareHuman, fail, loadManifest, loadReleaseContract,
  measureProduct, sealMeasuredIdentity, sha256, successorDescriptor, verifyFrozen, closureMember,
} from './h120010-promote.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const TENANT = 'h120010-private-upgrade';
const SCHEMA_011 = 'vendor/hosted-wallet-market/schema/011_capability_composition.sql';
const DEBT = 'vendor/hosted-wallet-market/src/native-debt.mjs';
const LEGACY_OBLIGATION_ID = 'obl_legacy23410001';
const ORIGINAL_OBLIGATION_ID = 'oobl_izUh7nn9vd_APjsR';
const ADDITIVE = ['capability_selection', 'capability_selection_receipt', 'voluntary_predecessor_binding'];
const AUTHORITY = [
  ['cj227_earned_work', 'earned_work_tasks'], ['cj227_earned_work', 'earned_work_terms'],
  ['cj227_earned_work', 'earned_work_reservations'], ['cj227_earned_work', 'earned_work_submissions'],
  ['cj227_earned_work', 'earned_work_verdicts'], ['cj227_earned_work', 'earned_work_obligations'],
  ['cj227_earned_work', 'earned_work_events'], ['cj227_earned_work', 'opportunity_obligations'],
  ['cj227_earned_work', 'opportunity_events'], ['cj227_earned_work', 'opportunity_submissions'],
  ['cj227_earned_work', 'opportunity_claims'], ['cj227_earned_work', 'ae14_market_quotes'],
  ['cj227_earned_work', 'ae14_market_assents'], ['cj227_earned_work', 'ae14_market_funding'],
  ['cj227_earned_work', 'ae14_market_consumers'], ['cj227_earned_work', 'ae14_capture_approvals'],
  ['cj227_earned_work', 'ae14_capture_receipt_bindings'], ['hosted_wallet_market', 'quotes'],
  ['hosted_wallet_market', 'funding_intents'], ['hosted_wallet_market', 'captures'],
  ['hosted_wallet_market', 'native_debt_dispositions'], ['hosted_wallet_market', 'grants'],
  ['hosted_wallet_market', 'reviews'], ['hosted_wallet_market', 'delivery'],
  ['hosted_wallet_market_guard', 'preserved_obligation_ids'], ['hosted_wallet_market_guard', 'obligation_guard_seal'],
];

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function gitFile(repo, commit, path) {
  return execFileSync('git', ['-C', repo, 'show', `${commit}:${path}`], {maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
}

function closureDirty(repo, pinKeys) {
  const lines = execFileSync('git', ['-C', repo, 'status', '--porcelain', '-uall'], {encoding: 'utf8'}).split('\n').filter(Boolean);
  const dirty = [];
  for (const line of lines) {
    let path = line.slice(3).trim();
    if (path.includes(' -> ')) path = path.split(' -> ').pop().trim();
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
    if (closureMember(path, pinKeys)) dirty.push(path);
  }
  return dirty;
}

function memAvailableKiB() {
  const row = readFileSync('/proc/meminfo', 'utf8').split('\n').find(line => line.startsWith('MemAvailable:'));
  return row ? Number(row.split(/\s+/)[1]) : null;
}

async function freePort() {
  const lease = createServer();
  await new Promise(done => lease.listen(0, '127.0.0.1', done));
  const port = lease.address().port;
  await new Promise(done => lease.close(done));
  return port;
}

function writeHttps(dir) {
  const key = join(dir, 'tls.key');
  const cert = join(dir, 'tls.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert], {stdio: 'ignore', timeout: 20000});
  chmodSync(key, 0o600);
  return {key, cert};
}

async function openAppDatabase(cluster) {
  const url = new URL(cluster.connectionString);
  const database = `contributor_journey_staging_h120010_${randomBytes(4).toString('hex')}`;
  const adminEnv = {
    ...process.env,
    PGHOST: '127.0.0.1',
    PGPORT: String(cluster.port),
    PGUSER: cluster.username,
    PGDATABASE: 'postgres',
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: url.searchParams.get('sslrootcert'),
    PGSSLCERT: url.searchParams.get('sslcert'),
    PGSSLKEY: url.searchParams.get('sslkey'),
  };
  execFileSync(join(cluster.pgBin, 'createdb'), ['-h', '127.0.0.1', '-p', String(cluster.port), '-U', cluster.username, database], {
    env: adminEnv, stdio: 'ignore', timeout: 10000,
  });
  const hba = join(cluster.dataDir, 'pg_hba.conf');
  writeFileSync(hba, readFileSync(hba, 'utf8').replaceAll(' clientcert=verify-full', ''));
  execFileSync(join(cluster.pgBin, 'pg_ctl'), ['-D', cluster.dataDir, 'reload'], {stdio: 'ignore', timeout: 10000});
  url.pathname = `/${database}`;
  url.searchParams.delete('sslcert');
  url.searchParams.delete('sslkey');
  return url.href;
}

function freshEnv(databaseUrl, origin) {
  return {
    CONTRIBUTOR_JOURNEY_MODE: 'staging',
    CONTRIBUTOR_JOURNEY_INSTALLED: '1',
    CONTRIBUTOR_JOURNEY_TRUST_PROXY: '0',
    CONTRIBUTOR_JOURNEY_DATABASE_URL: databaseUrl,
    CONTRIBUTOR_JOURNEY_OWNER_TOKEN: randomBytes(24).toString('hex'),
    CONTRIBUTOR_JOURNEY_CORRESPONDENCE_ADMIN_TOKEN: randomBytes(24).toString('hex'),
    CONTRIBUTOR_JOURNEY_PREVIEW_ORIGIN: origin,
    CONTRIBUTOR_JOURNEY_REPLAY_KEY: randomBytes(32).toString('hex'),
    CONTRIBUTOR_JOURNEY_INTEGRITY_KEY: randomBytes(32).toString('hex'),
    CONTRIBUTOR_JOURNEY_CURSOR_KEY: randomBytes(32).toString('hex'),
    CONTRIBUTOR_JOURNEY_FUTURE_ROUNDS: '[]',
    CONTRIBUTOR_JOURNEY_PUBLIC_READS: '0',
    CONTRIBUTOR_JOURNEY_RATE_LIMIT_MAX: '10000',
  };
}

function readState(dir) {
  const state = JSON.parse(readFileSync(join(dir, 'private.json'), 'utf8'));
  if (state?.schema !== 'sds.h120010.private-state.v1') throw fail('state_refused');
  return state;
}

function saveState(dir, state) {
  writeFileSync(join(dir, 'private.json'), JSON.stringify(state), {mode: 0o600});
}

async function withDb(databaseUrl, fn) {
  const client = new pg.Client({connectionString: databaseUrl, connectionTimeoutMillis: 10000});
  await client.connect();
  try { return await fn(client); }
  finally { await client.end(); }
}

async function prepareJourney(productRoot, env) {
  const journey = await import(pathToFileURL(join(productRoot, 'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/index.js')).href);
  return journey.prepareJourneyDeployment({env, enroll: false});
}

async function applyBaselineStore(productRoot, databaseUrl) {
  await withDb(databaseUrl, async client => {
    await client.query('SET search_path TO cj227_earned_work');
    const migrate = await import(pathToFileURL(join(productRoot, 'vendor/hosted-wallet-market/src/migrate.mjs')).href);
    await migrate.applyAdditiveSchema(client);
    const seed = await import(pathToFileURL(join(productRoot, 'vendor/hosted-wallet-market/src/seed.mjs')).href);
    await seed.seedStaging(client);
  });
}

async function additiveTables(databaseUrl) {
  return withDb(databaseUrl, async client => {
    const found = await client.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema='hosted_wallet_market' AND table_name = ANY($1::text[])`, [ADDITIVE]);
    return found.rows.map(row => row.table_name).sort();
  });
}

async function counts(databaseUrl) {
  return withDb(databaseUrl, async client => {
    const accounts = await client.query('SELECT count(*)::int AS n FROM cj227_earned_work.journey_accounts');
    const tasks = await client.query('SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_tasks');
    const legacy = await client.query('SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_obligations WHERE id=$1', [LEGACY_OBLIGATION_ID]);
    return {accounts: accounts.rows[0].n, tasks: tasks.rows[0].n, legacyObligation: legacy.rows[0].n};
  });
}

async function financialSnapshot(databaseUrl) {
  return withDb(databaseUrl, async client => {
    const present = await client.query(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE'`);
    const have = new Set(present.rows.map(row => `${row.table_schema}.${row.table_name}`));
    const missing = AUTHORITY.filter(([schema, name]) => !have.has(`${schema}.${name}`)).map(item => item.join('.'));
    if (missing.length) throw fail('authority_table_absent', {missing});
    const out = {};
    for (const [schema, name] of AUTHORITY) {
      const row = (await client.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) AS digest FROM "${schema}"."${name}" t`)).rows[0];
      out[`${schema}.${name}`] = {count: row.count, digest: row.digest};
    }
    return out;
  });
}

function snapshotDigest(snapshot) {
  const body = Object.keys(snapshot).sort().map(key => [key, snapshot[key].count, snapshot[key].digest]);
  return sha256(Buffer.from(JSON.stringify(body)));
}

async function bootServer(productRoot, state) {
  const rpcMethods = [];
  const rpc = http.createServer((req, res) => {
    let data = '';
    req.on('data', part => { data += part; });
    req.on('end', () => {
      let request = {};
      try { request = JSON.parse(data || '{}'); } catch { request = {}; }
      rpcMethods.push(request.method || null);
      const result = {eth_chainId: '0x2105', eth_blockNumber: '0x10', eth_call: '0x' + (6n).toString(16).padStart(64, '0')}[request.method];
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({jsonrpc: '2.0', id: request.id ?? null, ...(result ? {result} : {error: {code: -32601, message: 'read-only fixture'}})}));
    });
  });
  await new Promise(done => rpc.listen(0, '127.0.0.1', done));
  const profileOut = join(dirname(state.tlsCert), `profile-${randomBytes(4).toString('hex')}.json`);
  const generated = JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=256', join(productRoot, 'vendor/hosted-wallet-market/bin/machine-profile.mjs'),
    '--sds-root', productRoot, '--origin', state.origin, '--tenant', state.tenant, '--money', 'unfunded',
    '--participation', 'voluntary-artifact-v1', '--out', profileOut], {encoding: 'utf8', timeout: 30000, maxBuffer: 65536}));
  const {createSdsApp} = await import(pathToFileURL(join(productRoot, 'server/app.js')).href);
  const env = state.env;
  const app = createSdsApp({
    hostedWalletMarket: {
      env: {...env, HOSTED_WALLET_MARKET_MACHINE_PROFILE: generated.sourceBound},
      mode: 'private', label: 'PRIVATE', chain: 'eip155:8453', payments: 'off', publicReads: '0', fundedTasks: 'off', humanAssets: 'off',
      tls: 'verified-edge', origin: state.origin, tenant: state.tenant, earnedSchema: 'cj227_earned_work', schemaName: 'hosted_wallet_market',
      databaseUrl: state.databaseUrl, rpcUrl: `http://127.0.0.1:${rpc.address().port}`, feeRecipient: '0x' + '11'.repeat(20),
      settlementToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', replayKey: env.CONTRIBUTOR_JOURNEY_REPLAY_KEY,
      ownerToken: env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN,
    },
    neomorphicContributorJourney: {env},
    neomorphicOpportunity: {env: {}},
    correspondence: {env: {}},
    hostedUsefulJourney: {env: {}},
    managedWatch: {env: {}},
  });
  await app.get('hostedWalletMarket').opened;
  const journey = app.get('neoContributorJourney');
  if (typeof journey?.ensure === 'function') await journey.ensure();
  const key = readFileSync(state.tlsKey);
  const cert = readFileSync(state.tlsCert);
  const fault = {dropAction: null, hits: 0};
  const listener = https.createServer({key, cert}, (req, res) => {
    fault.hits += 1;
    if (fault.dropAction && req.url === `/api/neomorphic-contributor-journey/v1/market/${fault.dropAction}`) {
      fault.dropAction = null;
      res.end = () => { res.destroy(); return res; };
    }
    app(req, res);
  });
  await new Promise((done, reject) => {
    listener.once('error', reject);
    listener.listen(state.httpsPort, '127.0.0.1', done);
  });
  return {
    fault,
    generated,
    rpcMethods,
    async stop() {
      listener.closeAllConnections?.();
      await new Promise(done => listener.close(done));
      await app.get('hostedWalletMarket')?.close?.().catch(() => {});
      await app.get('neoContributorJourney')?.close?.().catch(() => {});
      await new Promise(done => rpc.close(done));
    },
  };
}

function cold(client, args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--max-old-space-size=256', client, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, UV_THREADPOOL_SIZE: '1', OMP_NUM_THREADS: '1', NODE_NO_WARNINGS: '1'},
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 30000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', status => {
      clearTimeout(timer);
      let body = null;
      try { body = JSON.parse(stdout); } catch { body = null; }
      resolve({status: status ?? 1, body, detail: body ? null : `${(stderr || stdout).slice(0, 180)}`.replace(/\s+/g, ' ').trim()});
    });
  });
}

function sourceFlags(repository, commit, path) {
  return ['--source-repository', repository, '--source-commit', commit, '--source-path', path];
}

function pins(state, descriptor, repository = descriptor.repository, commit = descriptor.commit, path = descriptor.path) {
  return ['--origin', state.origin, '--ca-file', state.tlsCert, '--descriptor', descriptor.file,
    '--descriptor-sha256', descriptor.sha256, ...sourceFlags(repository, commit, path)];
}

function postJournal(secretFile) {
  const body = JSON.parse(readFileSync(secretFile, 'utf8'));
  const post = body.operations?.post;
  const acquisition = body.acquisition || {};
  if (!post || typeof post.idempotencyKey !== 'string' || post.idempotencyKey.length < 8) {
    return {present: false, state: post?.state ?? null, idempotencyKeySha256: null, taskKnown: false, accountKnown: false,
      acquisitionSourceSha256: acquisition.sourceSha256 ?? null, acquisitionHostSha256: acquisition.hostSha256 ?? null,
      acquisitionDescriptorSha256: acquisition.descriptorSha256 ?? null};
  }
  return {
    present: true, state: post.state, idempotencyKeySha256: sha256(Buffer.from(post.idempotencyKey)),
    taskKnown: typeof body.taskId === 'string' && body.taskId.startsWith('market-'),
    accountKnown: typeof body.accountId === 'string' && body.accountId.length > 0,
    acquisitionSourceSha256: acquisition.sourceSha256 ?? null, acquisitionHostSha256: acquisition.hostSha256 ?? null,
    acquisitionDescriptorSha256: acquisition.descriptorSha256 ?? null,
  };
}

function publishedDescriptor(contract, file) {
  const bytes = readFileSync(file);
  if (bytes.length !== contract.descriptor.bytes || sha256(bytes) !== contract.descriptor.sha256) throw fail('descriptor_pin_refused');
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (parsed.profile !== contract.endpoints.profile || parsed.contract !== contract.endpoints.participationContract) throw fail('endpoint_refused');
  if (parsed.requiredProfile?.sourceSha256 !== contract.source.baselineSourceSha256 || parsed.requiredProfile?.hostSha256 !== contract.source.baselineHostSha256) {
    throw fail('descriptor_pin_refused');
  }
  return {file, sha256: contract.descriptor.sha256, repository: contract.client.repository, commit: contract.client.commit, path: contract.client.path, parsed};
}

function privateSuccessor(contract, file) {
  const bytes = readFileSync(file);
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (parsed.publicationStatus !== 'private_unreleased' || parsed.hostedAcquisitionClaim === true) throw fail('descriptor_contract_refused');
  if (parsed.source?.repository !== contract.client.repository || parsed.source?.commit !== contract.client.commit || parsed.source?.path !== contract.client.path) {
    throw fail('descriptor_provenance_refused');
  }
  if (parsed.sha256 !== contract.client.sha256 || parsed.bytes !== contract.client.bytes) throw fail('descriptor_client_refused');
  if (parsed.profile !== contract.endpoints.profile || parsed.contract !== contract.endpoints.participationContract) throw fail('endpoint_refused');
  if (parsed.requiredProfile?.money !== 'unfunded' || parsed.requiredProfile?.participation !== 'voluntary-artifact-v1') throw fail('descriptor_contract_refused');
  if (parsed.requiredProfile?.sourceSha256 !== contract.source.measuredCandidateSourceSha256 || parsed.requiredProfile?.hostSha256 !== contract.source.measuredCandidateHostSha256) {
    throw fail('descriptor_contract_refused');
  }
  return {file, sha256: sha256(bytes), repository: contract.client.repository, commit: contract.client.commit, path: contract.client.path};
}

async function readRetained(client, state) {
  const args = ['--origin', state.origin, '--ca-file', state.tlsCert, '--secret-file', state.secretFile, '--operation', 'post'];
  let readback = publicCall(await cold(client, ['readback', ...args]));
  let reauthenticated = false;
  if (!readback.ok && ['unauthenticated', 'revoked', 'csrf_required'].includes(readback.code)) {
    const login = publicCall(await cold(client, ['login', '--origin', state.origin, '--ca-file', state.tlsCert, '--secret-file', state.secretFile]));
    if (login.exit !== 0 || !login.ok) throw fail('login_refused', {login, readback});
    readback = publicCall(await cold(client, ['readback', ...args]));
    reauthenticated = true;
  }
  return {...readback, reauthenticated};
}

function publicCall(result) {
  return {exit: result.status, status: Number.isInteger(result.body?.status) ? result.body.status : null,
    ok: result.body?.ok === true, code: result.body?.code ?? null, nextAction: result.body?.nextAction ?? null,
    paidWork: result.body?.paidWork ?? null, taskId: result.body?.taskId ?? null, state: result.body?.state ?? null,
    evidence: result.body?.evidence ?? null, originalBodyRecorded: result.body?.originalBodyRecorded ?? null,
    money: result.body?.money ?? null, signerAuthority: result.body?.signerAuthority ?? null,
    sourceSha256: result.body?.sourceSha256 ?? null, hostSha256: result.body?.hostSha256 ?? null, detail: result.detail ?? null};
}

function probeProfile(state) {
  const ca = readFileSync(state.tlsCert);
  return new Promise(resolve => {
    const req = https.request(`${state.origin}/api/neomorphic-contributor-journey/v1/market/profile`, {
      ca, method: 'GET', timeout: 15000, headers: {'x-ae-wire-version': 'c0-1'},
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, bytes: Buffer.concat(chunks).length}));
    });
    req.on('timeout', () => { req.destroy(); resolve({status: 0, error: 'timeout'}); });
    req.on('error', error => resolve({status: 0, error: String(error.message).slice(0, 160)}));
    req.end();
  });
}

async function exercise(productRoot, state, paths, mode, server) {
  const contract = paths.contract;
  const baselineDescriptor = paths.baselineDescriptor;
  const measured = await measureProduct(productRoot);
  const probed = await probeProfile(state);
  if (probed.status !== 200) throw fail('profile_probe_refused', {probe: {...probed, hits: server.fault.hits}});
  const profile = publicCall(await cold(paths.client, ['profile', '--origin', state.origin, '--ca-file', state.tlsCert]));
  if (!profile.ok || profile.sourceSha256 !== measured.sourceSha256 || profile.hostSha256 !== measured.hostSha256) {
    throw fail('profile_identity_refused', {profile, measured});
  }
  if (profile.money !== 'unfunded' || profile.signerAuthority !== false) throw fail('zero_value_refused', {profile});
  const wrongRepository = publicCall(await cold(paths.client, ['acquire', ...pins(state, baselineDescriptor, 'example/not-the-source')]));
  const wrongCommit = publicCall(await cold(paths.client, ['acquire', ...pins(state, baselineDescriptor, contract.client.repository, 'a'.repeat(40))]));
  if (wrongRepository.code !== 'acquisition_source_mismatch' || wrongCommit.code !== 'acquisition_source_mismatch') {
    throw fail('wrong_source_refused', {wrongRepository, wrongCommit});
  }
  const report = {
    ok: true, phase: mode, money: profile.money, signerAuthority: profile.signerAuthority,
    sourceSha256: profile.sourceSha256, hostSha256: profile.hostSha256,
    wrongRepository: wrongRepository.code, wrongCommit: wrongCommit.code, secondPost: false,
  };
  if (mode === 'before') {
    const acquired = publicCall(await cold(paths.client, ['acquire', ...pins(state, baselineDescriptor)]));
    if (!acquired.ok) throw fail('baseline_acquire_refused', {acquired});
    const beforeAccounts = await counts(state.databaseUrl);
    if (beforeAccounts.accounts !== 0) throw fail('account_created_by_refusal', {beforeAccounts});
    const signup = publicCall(await cold(paths.client, ['signup', ...pins(state, baselineDescriptor), '--secret-file', state.secretFile,
      '--display-name', 'h120010-private-requester', '--role', 'requester']));
    if (!signup.ok) throw fail('signup_refused', {signup});
    server.fault.dropAction = 'post';
    const lost = publicCall(await cold(paths.client, ['post', ...pins(state, baselineDescriptor), '--secret-file', state.secretFile,
      '--title', 'Disposable promotion readback', '--summary', 'Synthetic unfunded continuity. No payment.', '--criterion', 'preserve-mapping']));
    const afterLost = await counts(state.databaseUrl);
    const journal = postJournal(state.secretFile);
    if (lost.exit !== 2 || lost.code !== 'unknown_outcome' || lost.nextAction !== 'readback') throw fail('lost_response_refused', {lost});
    if (journal.state !== 'unknown' || journal.taskKnown !== false || !journal.idempotencyKeySha256) throw fail('lost_post_resolved_early', {journal});
    if (afterLost.tasks !== 1 || afterLost.accounts !== 1 || afterLost.legacyObligation !== 1) throw fail('task_duplicated', {afterLost});
    Object.assign(report, {acquire: acquired, signup: {ok: true, status: signup.exit},
      lost: {status: lost.exit, code: lost.code, nextAction: lost.nextAction},
      readback: {performed: false}, journal, counts: afterLost});
  } else if (mode === 'after') {
    const stale = publicCall(await cold(paths.client, ['acquire', ...pins(state, baselineDescriptor)]));
    if (stale.ok || stale.code !== 'acquisition_profile_mismatch') throw fail('stale_descriptor_control_failed', {stale});
    const successor = paths.successorDescriptor;
    const acquired = publicCall(await cold(paths.client, ['reacquire', ...pins(state, successor), '--secret-file', state.secretFile]));
    if (!acquired.ok || acquired.sourceSha256 !== measured.sourceSha256 || acquired.hostSha256 !== measured.hostSha256) {
      throw fail('candidate_acquire_refused', {acquired});
    }
    const unresolved = postJournal(state.secretFile);
    if (unresolved.state !== 'unknown' || unresolved.acquisitionDescriptorSha256 !== successor.sha256) throw fail('candidate_journal_refused', {journal: unresolved});
    const readback = await readRetained(paths.client, state);
    const fund = publicCall(await cold(paths.client, ['fund', '--origin', state.origin, '--ca-file', state.tlsCert, '--secret-file', state.secretFile]));
    const seen = await counts(state.databaseUrl);
    const journal = postJournal(state.secretFile);
    if (readback.exit !== 0 || !readback.ok || !readback.taskId) throw fail('readback_refused', {readback});
    if (journal.state !== 'received' || journal.idempotencyKeySha256 !== unresolved.idempotencyKeySha256 || journal.taskKnown !== true) {
      throw fail('readback_refused', {readback, journal});
    }
    if (seen.tasks !== 1 || seen.accounts !== 1 || seen.legacyObligation !== 1) throw fail('retained_state_refused', {seen});
    if (fund.paidWork !== false || fund.ok !== false || fund.code !== 'qualified_selection_required') throw fail('fund_refused', {fund});
    Object.assign(report, {staleDescriptor: stale.code, publishedDescriptorContinuity: false, acquire: acquired,
      readback: {performed: true, ok: true, taskId: readback.taskId, evidence: readback.evidence, originalBodyRecorded: readback.originalBodyRecorded},
      reauthenticated: readback.reauthenticated, journal,
      fund: {status: fund.status, code: fund.code, paidWork: fund.paidWork}, counts: seen});
  } else if (mode === 'rollback') {
    const successor = paths.successorDescriptor;
    const stale = publicCall(await cold(paths.client, ['acquire', ...pins(state, successor)]));
    if (stale.ok || stale.code !== 'acquisition_profile_mismatch') throw fail('restored_descriptor_control_failed', {stale});
    const acquired = publicCall(await cold(paths.client, ['reacquire', ...pins(state, baselineDescriptor), '--secret-file', state.secretFile]));
    if (!acquired.ok || acquired.sourceSha256 !== measured.sourceSha256 || acquired.hostSha256 !== measured.hostSha256) {
      throw fail('rollback_acquire_refused', {acquired});
    }
    const beforeRead = postJournal(state.secretFile);
    const readback = await readRetained(paths.client, state);
    const fund = publicCall(await cold(paths.client, ['fund', '--origin', state.origin, '--ca-file', state.tlsCert, '--secret-file', state.secretFile]));
    const seen = await counts(state.databaseUrl);
    const journal = postJournal(state.secretFile);
    if (readback.exit !== 0 || !readback.ok) throw fail('readback_refused', {readback});
    if (journal.state !== 'received' || journal.idempotencyKeySha256 !== beforeRead.idempotencyKeySha256) throw fail('readback_refused', {journal});
    if (journal.acquisitionDescriptorSha256 !== baselineDescriptor.sha256) throw fail('rollback_acquire_refused', {journal});
    if (seen.tasks !== 1 || seen.accounts !== 1 || seen.legacyObligation !== 1) throw fail('retained_state_refused', {seen});
    if (fund.paidWork !== false || fund.ok !== false || fund.code !== 'selection_required') throw fail('fund_refused', {fund});
    Object.assign(report, {staleSuccessor: stale.code, acquire: acquired,
      readback: {performed: true, ok: true, taskId: readback.taskId, evidence: readback.evidence, originalBodyRecorded: readback.originalBodyRecorded},
      reauthenticated: readback.reauthenticated, journal,
      fund: {status: fund.status, code: fund.code, paidWork: fund.paidWork}, counts: seen});
  } else throw fail('phase_refused');
  const additive = await additiveTables(state.databaseUrl);
  const snapshot = await financialSnapshot(state.databaseUrl);
  report.additive = additive;
  report.legacyObligation = report.counts.legacyObligation;
  report.financialDigest = snapshotDigest(snapshot);
  report.financial = snapshot;
  report.rpcObserved = server.rpcMethods.length;
  if (mode === 'before' && additive.length !== 0) throw fail('schema_011_unexpected', {additive});
  if (mode !== 'before' && additive.length !== ADDITIVE.length) throw fail('schema_011_missing', {additive});
  if (report.legacyObligation !== 1) throw fail('legacy_obligation_missing');
  return report;
}

async function phaseBefore(paths) {
  mkdirSync(paths.state, {recursive: true, mode: 0o700});
  chmodSync(paths.state, 0o700);
  const cluster = await startCluster();
  let persisted = false;
  try {
    const tls = writeHttps(paths.state);
    const databaseUrl = await openAppDatabase(cluster);
    const httpsPort = await freePort();
    const origin = `https://127.0.0.1:${httpsPort}`;
    const state = {
      schema: 'sds.h120010.private-state.v1',
      cluster: {scratch: cluster.scratch, dataDir: cluster.dataDir, pid: cluster.pid, pgBin: cluster.pgBin},
      databaseUrl, origin, httpsPort, tlsKey: tls.key, tlsCert: tls.cert, tenant: TENANT,
      secretFile: join(paths.state, 'requester.json'), env: freshEnv(databaseUrl, origin),
    };
    saveState(paths.state, state);
    persisted = true;
    await prepareJourney(paths.productRoot, state.env);
    await applyBaselineStore(paths.productRoot, databaseUrl);
    const server = await bootServer(paths.productRoot, state);
    try { return await exercise(paths.productRoot, state, paths, 'before', server); }
    finally { await server.stop(); }
  } catch (error) {
    if (!persisted) await cluster.stop().catch(() => {});
    throw error;
  }
}

async function phaseMigrate(paths) {
  const state = readState(paths.state);
  const bytes = readFileSync(join(paths.productRoot, SCHEMA_011));
  const manifest = loadManifest(paths.bundle, paths.contract);
  const member = manifest.members.find(item => item.path === SCHEMA_011);
  if (!member || sha256(bytes) !== member.candidateSha256) throw fail('schema_member_refused');
  const present = await additiveTables(state.databaseUrl);
  if (present.length) throw fail('schema_011_already_present', {present});
  await withDb(state.databaseUrl, client => client.query(bytes.toString('utf8')));
  const after = await additiveTables(state.databaseUrl);
  if (after.length !== ADDITIVE.length) throw fail('schema_011_incomplete', {after});
  return {ok: true, phase: 'migrate', additive: after, reappliedEarlierSchemas: false, dropped: false};
}

async function phaseBoot(paths, mode) {
  const state = readState(paths.state);
  await prepareJourney(paths.productRoot, state.env);
  const server = await bootServer(paths.productRoot, state);
  try { return await exercise(paths.productRoot, state, paths, mode, server); }
  finally { await server.stop(); }
}

async function phaseDestroy(paths) {
  const file = join(paths.state, 'private.json');
  if (!existsSync(file)) return {ok: true, phase: 'destroy', stopped: false};
  const state = readState(paths.state);
  await stopCluster(state.cluster);
  return {ok: true, phase: 'destroy', stopped: true};
}

function publicError(error) {
  const message = String(error?.message || 'receive_failed').replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]').slice(0, 400);
  const compact = value => value && typeof value === 'object'
    ? {exit: value.exit ?? null, status: value.status ?? null, ok: value.ok ?? null, code: value.code ?? null, nextAction: value.nextAction ?? null,
      money: value.money ?? null, signerAuthority: value.signerAuthority ?? null, sourceSha256: value.sourceSha256 ?? null, hostSha256: value.hostSha256 ?? null, detail: value.detail ?? null}
    : null;
  return {ok: false, code: error?.codeName || 'receive_failed', message, path: error?.path ?? null,
    profile: compact(error?.profile), probe: error?.probe ?? null, lost: compact(error?.lost), readback: compact(error?.readback), fund: compact(error?.fund),
    acquired: compact(error?.acquired), additive: error?.additive ?? null, missing: error?.missing ?? null};
}

async function phaseMain() {
  const phase = arg('--phase');
  try {
    const contract = loadReleaseContract(resolve(arg('--contract')));
    const descriptor = resolve(arg('--descriptor'));
    const paths = {
      productRoot: resolve(arg('--product-root')),
      state: resolve(arg('--state')),
      client: resolve(arg('--client')),
      descriptor,
      bundle: arg('--bundle') ? resolve(arg('--bundle')) : undefined,
      contract,
      baselineDescriptor: publishedDescriptor(contract, descriptor),
      successorDescriptor: arg('--successor') ? privateSuccessor(contract, resolve(arg('--successor'))) : undefined,
    };
    let value;
    if ((phase === 'after' || phase === 'rollback') && !paths.successorDescriptor) throw fail('descriptor_required');
    if (phase === 'before') value = await phaseBefore(paths);
    else if (phase === 'migrate') value = await phaseMigrate(paths);
    else if (phase === 'after' || phase === 'rollback') value = await phaseBoot(paths, phase);
    else if (phase === 'destroy') value = await phaseDestroy(paths);
    else throw fail('phase_refused');
    process.stdout.write(`${JSON.stringify(value)}\n`);
    process.exitCode = 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(publicError(error))}\n`);
    process.exitCode = 1;
  }
}

function requireFile(file) {
  if (!file || !existsSync(file) || !lstatSync(file).isFile()) throw fail('input_required', {path: file});
}

function phaseFailure(name, phase) {
  throw fail(name, {message: `${name} ${JSON.stringify(phase.body)} ${phase.stderr}`.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]').slice(0, 900)});
}

function spawnPhase(phase, paths) {
  const args = ['--max-old-space-size=768', SCRIPT, 'phase', '--phase', phase, '--product-root', paths.destination,
    '--state', paths.state, '--client', paths.client, '--descriptor', paths.descriptor, '--contract', paths.contractPath];
  if (paths.bundle) args.push('--bundle', paths.bundle);
  if (paths.successor) args.push('--successor', paths.successor);
  const run = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: phase === 'migrate' || phase === 'destroy' ? 90000 : 240000,
    maxBuffer: 8 * 1024 * 1024,
    env: {...process.env, UV_THREADPOOL_SIZE: '1', OMP_NUM_THREADS: '1', NODE_NO_WARNINGS: '1', FORCE_COLOR: '0', GIT_TERMINAL_PROMPT: '0'},
  });
  const lines = String(run.stdout || '').split('\n').map(line => line.trim()).filter(line => line.startsWith('{'));
  let body = null;
  try { body = lines.length ? JSON.parse(lines.at(-1)) : null; } catch { body = null; }
  const stderr = String(run.stderr || '').replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]').slice(0, 800);
  return {phase, status: run.status ?? 1, body, stderr, signal: run.signal ?? null};
}

function assertSecretFree(text, state) {
  if (/postgres(?:ql)?:\/\//i.test(text)) throw fail('receipt_secret_refused');
  for (const value of Object.values(state.env)) {
    if (typeof value === 'string' && value.length >= 16 && text.includes(value)) throw fail('receipt_secret_refused');
  }
  if (text.includes(state.databaseUrl) || text.includes(state.secretFile)) throw fail('receipt_secret_refused');
}

function renderResult(report) {
  const human = report.human;
  const release = report.release;
  const source = release.source;
  const unchanged = human.byteEqual === true && human.preservedInventoryAgrees === true && human.baseline.status === 0 && human.candidate.status === 0;
  const before = report.phases.before;
  const after = report.phases.after;
  const rolled = report.phases.rollback;
  return `# H120010 promotion result

## RESULT
Amended machine-only promotion package for ${source.baselineCommit.slice(0, 12)} to ${source.candidateCommit.slice(0, 12)}. The original completion remains ${report.originalHead}. This run repeated the contained zero-value upgrade and rollback. Production was not changed. ${unchanged ? 'Emitted human bytes are unchanged.' : 'Emitted human bytes need a separate Root decision.'} The published 0.3.1 descriptor was not released. A private successor descriptor was exercised and is not a public descriptor.

## Original failures
These are the gaps in the original completion at ${report.originalHead}. They are not reclassified as success.
- Candidate continuity was not established. Acquire with the published descriptor against candidate code returned acquisition_profile_mismatch. That run resolved the lost baseline POST before promotion and then read it back with the same published descriptor. The mismatch was a real refusal, not successful candidate continuity.
- applyBundle validated each member while writing earlier members. A corrupt late member could leave a mixed tree that neither install nor rollback accepted. Writing the pin last was not atomic, and there was no task progress journal.
- The reviewed pair was baked into helper source constants, so each promotion required an edit of those constants.

## Corrected outcome
- The published client stayed byte-identical (${release.client.sha256}, ${release.client.bytes} bytes). Wrong repository and wrong commit still return acquisition_source_mismatch before a request.
- The lost baseline POST stayed unresolved in the client journal until after the code promotion. Journal state before promotion: ${before.journal.state}. No readback was performed in that phase.
- After promotion, the published descriptor still returned ${after.staleDescriptor}. That stale-descriptor refusal is a positive control. publishedDescriptorContinuity: ${after.publishedDescriptorContinuity}.
- Acquire and the retained readback then used the private successor descriptor ${report.successor.sha256}. The same idempotency key was read back with no second POST. Task count stayed ${after.counts.tasks}. Readback evidence: ${after.readback.evidence}; originalBodyRecorded: ${after.readback.originalBodyRecorded}.
- After code rollback, the successor descriptor returned ${rolled.staleSuccessor}. The baseline descriptor was restored, acquire succeeded, and the same key was read back again. Task count stayed ${rolled.counts.tasks}.
- File repair now validates the complete bundle and the destination before the first payload write. Interrupted progress can finish the exact candidate or return to the exact predecessor. pinLastAloneAtomic: ${report.progress.pinLastAloneAtomic}. Credentials, obligations, terms, and database authority stay outside that repair.
- The checked-in release contract binds this pair. A wrong, missing, or contradictory contract fails before writes.

## Source
- Repository: ${release.repository}
- Baseline commit: ${source.baselineCommit}
- Candidate commit: ${source.candidateCommit}
- Promotion head at the run: ${report.promotionHead}
- Runtime pin: ${release.runtime.journeyCommit}
- Desk pin: ${release.runtime.deskCommit} (publicEnabled left false)
- Measured candidate source: ${report.measured.sourceSha256}
- Measured candidate host: ${report.measured.hostSha256}
- Recorded SOURCE.json constant: ${source.recordedCandidateSourceSha256}
- recordedSourceConstantAuthority: false
- recordedSourceConstantAgrees: ${report.sealed.recordedSourceConstantAgrees}
- native-debt.mjs byte-identical across the two commits: ${report.debtEqual}
- Original obligation id ${ORIGINAL_OBLIGATION_ID} remains in that unchanged source constant. This run did not read or write the production row.
- Synthetic continuity obligation ${LEGACY_OBLIGATION_ID} stayed present. Authority digest ${report.financialDigest}.

## Bundle
- Location: docs/machine-promotion/bundle
- Manifest digest: ${report.sealed.sha256}
- Members: ${report.sealed.members.length}
- Excluded from the machine closure: ${report.sealed.excluded.length}
- Human paths in the payload: none
- Schema 011 is additive and was applied once. Rollback restored code bytes and left the 011 tables in place. Schemas 006-010 were not reapplied.
- Progress owner: ${report.progress.owner}. Final progress phase: ${report.progress.phase}. Final progress role: ${report.progress.role}.

## Release contract
- File: docs/machine-promotion/release-contract.json
- SHA256: ${report.contractSha256}
- Paths are caller inputs. The helper does not trust whichever files happen to be present.
- Frozen flags stay off. Runtime and desk commits are bound by the contract.

## Two-artifact order
- Order: ${release.releaseOrder.artifacts.join(' then ')}.
- Descriptor publication: ${release.releaseOrder.descriptorPublication}.
- Partial code repair: ${release.releaseOrder.partialCodeRepair}.
- Schema 011: ${release.releaseOrder.schema011}.
- Rule: ${release.releaseOrder.rule}

## Human comparison
- Build: ${release.human.build}
- viteInvoked: ${human.viteInvoked}
- Baseline exit: ${human.baseline.status}
- Candidate exit: ${human.candidate.status}
- Inventory: ${human.baseline.body?.inventorySha256 ?? 'absent'}
- Files: ${human.files}
- Bytes: ${human.leftBytes}
- byteEqual: ${human.byteEqual}
- preservedInventoryAgrees: ${human.preservedInventoryAgrees}
- Projection: ${unchanged ? 'unchanged' : 'coupled'}
- The published descriptor still requires source ${source.baselineSourceSha256} and host ${source.baselineHostSha256}. That refusal is unchanged and is not a human-byte change.

## Contained receiving
- Wrong repository and wrong commit: ${before.wrongRepository} before any request, on the baseline, candidate, and restored baseline.
- Lost post response: exit ${before.lost.status}, code ${before.lost.code}, nextAction ${before.lost.nextAction}. Journal remained ${before.journal.state} until after promotion.
- Idempotency key hash unchanged across promotion and rollback: ${report.journalKeyStable}.
- Candidate readback reused that stored key. Task count stayed ${after.counts.tasks}. secondPost: false.
- Fund while the lost post was unresolved: not called. Candidate code after readback: ${after.fund.code}, paidWork ${after.fund.paidWork}. Restored baseline code: ${rolled.fund.code}, paidWork ${rolled.fund.paidWork}. No funding row was written.
- Money stayed unfunded and signerAuthority stayed false. Qualified capability was not set.
- Account count stayed 1 after signup. Legacy obligation count stayed 1.
- Financial digest equal across before, candidate, and rollback: ${report.financialEqual}
- 011 tables after migration: ${report.phases.migrate.additive.join(', ')}
- 011 tables after code rollback: ${rolled.additive.join(', ')}

## Rollback
- File role baseline restored the measured installed identity ${source.baselineSourceSha256}.
- The private successor descriptor was refused with ${rolled.staleSuccessor}.
- The restored baseline descriptor acquired successfully and the same account readback succeeded.
- No schema was dropped.

## Private descriptor
- File: docs/machine-promotion/evidence/private-successor-descriptor.json
- SHA256: ${report.successor.sha256}
- Published: false
- Client source provenance: ${release.client.repository} ${release.client.commit} ${release.client.path}
- Required profile source: ${source.measuredCandidateSourceSha256}
- Required profile host: ${source.measuredCandidateHostSha256}
- Public endpoints in the descriptor were not changed.

## Installed boundary
- Live source remains ${source.baselineCommit}.
- Live runtime remains ${release.runtime.journeyCommit}.
- Live desk remains ${release.runtime.deskCommit}.
- Linked installation id remains ${release.installedHostinger}.
- Public, funded, payment, and human-asset flags stay off.
- This assignment did not deploy, sign, grant, fund, pay, publish, or merge.

## Commands
${report.commands.map(command => `- ${command.name}: exit ${command.status}`).join('\n')}

## File inventory
- server/scripts/h120010-promote.mjs
- server/scripts/h120010-receive.mjs
- server/scripts/h120010-promotion.test.mjs
- server/scripts/h120010-promotion-result.md
- docs/machine-promotion/README.md
- docs/machine-promotion/ROOT-COMMANDS.md
- docs/machine-promotion/BOUNDARY.md
- docs/machine-promotion/release-contract.json
- docs/machine-promotion/bundle/
- docs/machine-promotion/evidence/

## Boundaries
- Source package: this branch. It is not an installed release.
- Contained receiving: disposable private Postgres, destroyed before this receipt was sealed.
- Actual deployment: not performed. Root owns production credentials and the install root.
- Financial activation: not performed. Accepted money logic was not edited.
- Descriptor publication: not performed. The successor file is private evidence.
- Outside use: not performed. No external user task and no human publication.
- Revenue: none.

## NEXT
Root installs the code bundle only onto a tree that still measures as the baseline identity, then applies schema/011_capability_composition.sql once. Root publishes the acquisition descriptor only after the installed tree measures as the candidate identity in the release contract. Until that publication, clients fail closed. Pin-last is not atomic: an interrupted install is finished or returned from the task progress file, and that repair does not touch credentials, obligations, terms, or the database. If code is rolled back, Root restores the baseline descriptor in the same decision and does not drop schema 011. The recorded SOURCE.json constant remains a nonauthoritative disagreement. No default merge.
`;
}

export async function runReceive(paths) {
  const repo = resolve(paths.repo);
  const destination = resolve(paths.destination);
  const state = resolve(paths.state);
  const startedKiB = memAvailableKiB();
  if (!paths.contract) throw fail('contract_required');
  const contractBytes = readFileSync(paths.contract);
  const release = loadReleaseContract(paths.contract);
  if (destination === repo || destination.startsWith(repo + sep) || state === repo || state.startsWith(repo + sep)) throw fail('destination_refused');
  if (existsSync(destination)) throw fail('destination_exists');
  if (existsSync(state)) throw fail('state_exists');
  requireFile(paths.client);
  requireFile(paths.descriptor);
  const clientBytes = readFileSync(paths.client);
  if (clientBytes.length !== release.client.bytes || sha256(clientBytes) !== release.client.sha256) throw fail('client_pin_refused');
  const published = publishedDescriptor(release, paths.descriptor);
  const successor = successorDescriptor(published.parsed, release);
  const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const drift = closureDrift(repo, release.source.candidateCommit);
  if (drift.length) throw fail('candidate_tree_drift', {drift: drift.slice(0, 8)});
  const candidatePin = JSON.parse(gitFile(repo, release.source.candidateCommit, PIN).toString('utf8'));
  const dirty = closureDirty(repo, new Set(Object.keys(candidatePin.files)));
  if (dirty.length) throw fail('writer_closure_dirty', {dirty});
  const measured = await measureProduct(repo);
  if (measured.sourceSha256 !== release.source.measuredCandidateSourceSha256 || measured.hostSha256 !== release.source.measuredCandidateHostSha256) {
    throw fail('measured_identity_refused', {measured});
  }
  const baselineDebt = gitFile(repo, release.source.baselineCommit, DEBT);
  const candidateDebt = gitFile(repo, release.source.candidateCommit, DEBT);
  const debtEqual = sha256(baselineDebt) === sha256(candidateDebt) && candidateDebt.includes(Buffer.from(ORIGINAL_OBLIGATION_ID));
  if (!debtEqual) throw fail('obligation_source_changed');
  mkdirSync(paths.bundle, {recursive: true});
  await buildBundle({repo, out: paths.bundle, contract: release});
  const sealed = sealMeasuredIdentity(paths.bundle, measured, release);
  if (sealed.recordedSourceConstantAgrees !== false) throw fail('recorded_constant_was_rewritten');
  if (sealed.measuredCandidateSourceSha256 !== measured.sourceSha256) throw fail('measured_identity_refused');
  const created = {worktree: false, symlink: false, state: false};
  let destroyedOnce = false;
  const commands = [];
  const record = (name, status) => commands.push({name, status});
  const phasePaths = {destination, state, client: paths.client, descriptor: paths.descriptor, bundle: paths.bundle, contractPath: paths.contract};
  try {
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', destination, release.source.baselineCommit], {
      stdio: 'ignore', timeout: 180000, env: {...process.env, GIT_TERMINAL_PROMPT: '0'},
    });
    created.worktree = true;
    const link = join(destination, 'node_modules');
    symlinkSync(join(repo, 'node_modules'), link);
    created.symlink = true;
    verifyFrozen(destination, release);
    verifyFrozen(repo, release);
    const predecessor = await measureProduct(destination);
    if (predecessor.sourceSha256 !== release.source.baselineSourceSha256 || predecessor.hostSha256 !== release.source.baselineHostSha256) {
      throw fail('predecessor_refused', {before: predecessor});
    }
    const human = compareHuman(destination, repo, release);
    if (human.baseline.status !== 0 || human.candidate.status !== 0 || human.viteInvoked !== false ||
      human.baseline.body?.viteInvoked !== false || human.candidate.body?.viteInvoked !== false) {
      throw fail('human_comparison_failed', {baseline: human.baseline.status, candidate: human.candidate.status, viteInvoked: human.viteInvoked, stderr: human.candidate.stderr || human.baseline.stderr});
    }
    const before = spawnPhase('before', phasePaths);
    record('phase-before', before.status);
    if (before.status !== 0 || before.body?.ok !== true || before.body?.readback?.performed !== false) phaseFailure('phase_before_failed', before);
    if (before.body.sourceSha256 !== release.source.baselineSourceSha256 || before.body.hostSha256 !== release.source.baselineHostSha256) throw fail('baseline_profile_refused');
    const successorFile = join(state, 'successor-descriptor.json');
    writeFileSync(successorFile, successor.bytes, {mode: 0o600});
    chmodSync(successorFile, 0o600);
    phasePaths.successor = successorFile;
    const progressFile = join(state, 'apply-progress.json');
    const installed = await applyBundle({bundleDir: paths.bundle, destination, role: 'candidate', contract: release, progressFile});
    record('install', installed.ok ? 0 : 1);
    if (installed.pinLastAloneAtomic !== false) throw fail('progress_refused');
    const migrated = spawnPhase('migrate', phasePaths);
    record('phase-migrate', migrated.status);
    if (migrated.status !== 0 || migrated.body?.reappliedEarlierSchemas !== false) phaseFailure('phase_migrate_failed', migrated);
    const after = spawnPhase('after', phasePaths);
    record('phase-after', after.status);
    if (after.status !== 0 || after.body?.publishedDescriptorContinuity !== false || after.body?.staleDescriptor !== 'acquisition_profile_mismatch') {
      phaseFailure('phase_after_failed', after);
    }
    if (after.body?.sourceSha256 !== measured.sourceSha256 || after.body?.hostSha256 !== measured.hostSha256 || after.body?.acquire?.ok !== true) {
      phaseFailure('phase_after_failed', after);
    }
    const restored = await applyBundle({bundleDir: paths.bundle, destination, role: 'baseline', contract: release, progressFile});
    record('rollback', restored.ok ? 0 : 1);
    const rolled = spawnPhase('rollback', phasePaths);
    record('phase-rollback', rolled.status);
    if (rolled.status !== 0 || rolled.body?.sourceSha256 !== release.source.baselineSourceSha256 || rolled.body?.staleSuccessor !== 'acquisition_profile_mismatch') {
      phaseFailure('phase_rollback_failed', rolled);
    }
    const financialEqual = before.body.financialDigest === after.body.financialDigest && after.body.financialDigest === rolled.body.financialDigest;
    if (!financialEqual) throw fail('financial_snapshot_changed');
    const journalKey = before.body.journal.idempotencyKeySha256;
    const journalKeyStable = Boolean(journalKey) && journalKey === after.body.journal.idempotencyKeySha256 && journalKey === rolled.body.journal.idempotencyKeySha256;
    if (!journalKeyStable || after.body.secondPost !== false || rolled.body.secondPost !== false) throw fail('journal_key_changed');
    const progress = JSON.parse(readFileSync(progressFile, 'utf8'));
    if (progress.phase !== 'complete' || progress.pinLastAloneAtomic !== false || progress.owner !== 'h120010-apply') throw fail('progress_refused');
    const privateState = readState(state);
    const publicReport = {
      schema: 'sds.h120010.receive.v1',
      originalHead: 'bdbae58688b857eb8bf3ebf408768daa3a088af4',
      promotionHead: head,
      contractSha256: sha256(contractBytes),
      measured,
      release: {
        schema: release.schema, repository: release.repository, source: release.source, runtime: release.runtime,
        client: release.client, human: release.human, endpoints: release.endpoints, releaseOrder: release.releaseOrder,
        installedHostinger: release.installedHostinger,
      },
      successor: {sha256: successor.sha256, bytes: successor.bytes.length, published: false},
      progress: {schema: progress.schema, owner: progress.owner, phase: progress.phase, role: progress.role, pinLastAloneAtomic: false},
      sealed: {sha256: sealed.sha256, members: sealed.members, excluded: sealed.excluded, recordedSourceConstantAgrees: sealed.recordedSourceConstantAgrees,
        measuredCandidateSourceSha256: sealed.measuredCandidateSourceSha256, measuredCandidateHostSha256: sealed.measuredCandidateHostSha256},
      debtEqual, financialEqual, financialDigest: before.body.financialDigest, journalKeyStable, human, commands,
      phases: {before: before.body, migrate: migrated.body, after: after.body, rollback: rolled.body},
      limits: {modelChildren: 0, serial: true, aggregateBudgetKiB: 2097152, paidProviderCalls: 0, productionDeployment: false,
        memAvailableKiBStart: startedKiB, memAvailableKiBEnd: memAvailableKiB()},
    };
    assertSecretFree(JSON.stringify(publicReport), privateState);
    const destroyed = spawnPhase('destroy', phasePaths);
    record('phase-destroy', destroyed.status);
    publicReport.commands = commands;
    if (destroyed.status !== 0) phaseFailure('phase_destroy_failed', destroyed);
    destroyedOnce = true;
    mkdirSync(paths.evidence, {recursive: true});
    writeFileSync(join(paths.evidence, 'human-comparison.json'), `${JSON.stringify(human, null, 2)}\n`);
    writeFileSync(join(paths.evidence, 'source-constant.json'), `${JSON.stringify({
      schema: 'sds.h120010.source-constant.v1',
      recordedCandidateSourceSha256: release.source.recordedCandidateSourceSha256,
      measuredCandidateSourceSha256: measured.sourceSha256,
      measuredCandidateHostSha256: measured.hostSha256,
      recordedSourceConstantAuthority: false,
      recordedSourceConstantAgrees: false,
      sourceFile: 'vendor/hosted-wallet-market/SOURCE.json',
      amended: false,
    }, null, 2)}\n`);
    writeFileSync(join(paths.evidence, 'private-successor-descriptor.json'), successor.bytes, {mode: 0o600});
    writeFileSync(join(paths.evidence, 'receive.json'), `${JSON.stringify(publicReport, null, 2)}\n`);
    writeFileSync(join(paths.evidence, 'limits.json'), `${JSON.stringify(publicReport.limits, null, 2)}\n`);
    const markdown = renderResult(publicReport);
    assertSecretFree(markdown, privateState);
    writeFileSync(paths.result, markdown);
    return {ok: true, manifestSha256: sealed.sha256, members: sealed.members.length, financialDigest: before.body.financialDigest,
      humanUnchanged: human.byteEqual === true && human.preservedInventoryAgrees === true, recordedSourceConstantAgrees: false,
      publishedDescriptorContinuity: false, privateSuccessorReadback: true, pinLastAloneAtomic: false, productionDeployment: false};
  } finally {
    try {
      if (!destroyedOnce && existsSync(join(state, 'private.json'))) {
        const late = spawnPhase('destroy', {...phasePaths, successor: undefined});
        if (late.status !== 0 && existsSync(join(state, 'private.json'))) {
          try { await stopCluster(readState(state).cluster); } catch { /* cluster already stopped */ }
        }
      }
    } catch { /* destroy is best-effort after the receipt */ }
    if (created.symlink) {
      const link = join(destination, 'node_modules');
      if (existsSync(link) && lstatSync(link).isSymbolicLink()) unlinkSync(link);
    }
    if (created.worktree) {
      try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', destination], {stdio: 'ignore', timeout: 60000}); }
      catch { rmSync(destination, {recursive: true, force: true}); }
    }
    if (existsSync(state)) rmSync(state, {recursive: true, force: true});
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv[2] === 'phase') await phaseMain();
