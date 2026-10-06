import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm, symlink, appendFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { runBounded } from '../foundry/bounded-child.mjs';
import { startDisposablePg } from './fixtures/disposable-pg.mjs';
import { original, task, cases } from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/entry-helpers.mjs';
import { bootFoundryServer } from '../foundry/activation/local-journey.mjs';
import { verifyFoundrySource } from './fixtures/verify-foundry-source.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const vendor = 'vendor/visitor-foundry-receiver';
const entryPath = `${vendor}/scripts/visitor-foundry/integration/entry`;
const executionPath = `${vendor}/scripts/visitor-foundry/execution`;
const node218 = process.env.FOUNDRY_TEST_NODE_2218;
const baseHead = '2c26534955fd3fa3c1a1ff12c5c5d4cdc5c2b7c1';
let cluster, dir, oldRoot, newRoot, driftRoot, bundledRoot, pool;
const hosts = new Set();
const fixturePools = new Set();
const evidence = { baseHead, hostingerMeasured: false, transitions: [], generations: [] };
const inherited = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C', LC_ALL: 'C' };
async function command(cwd, node, args, env = {}, expected = 0) {
  const installer = args[0] === 'server/foundry/install.mjs';
  const runArgs = installer ? ['--import', path.join(root, 'server/scripts/fixtures/installer-code.mjs'), ...args] : args;
  const r = await runBounded(node, runArgs, { cwd, env: { ...inherited, ...env }, timeoutMs: 60000,
    capture: true, stdoutLimit: 512000, outputLimit: 1048576 });
  const result = r.stdout.trim() ? JSON.parse(r.stdout.trim().split('\n').at(-1)) : null;
  assert.equal(r.reason, null); assert.equal(r.code, expected, `${args[0]} exit ${r.code}: ${result?.fixtureInstallerFailure ?? 'no_typed_fixture_code'} phase:${result?.fixturePhase ?? 'unknown'}`);
  return result;
}
async function copyRoot(name) {
  const target = path.join(dir, name); await mkdir(target);
  await cp(path.join(root, vendor), path.join(target, vendor), { recursive: true,
    filter: p => !['.runtime', '.python-standalone', '.build'].includes(path.basename(p)) });
  const tracked=await runBounded('git',['ls-files','server','tools/hosted-useful-journey-100346','tools/l08-agent-repair','tools/result-reuse','tools/recurring-job-recipes','client/src/data'],{cwd:root,capture:true,stdoutLimit:100000});assert.equal(tracked.code,0);assert.equal(tracked.reason,null);
  for(const file of tracked.stdout.trim().split('\n')){await mkdir(path.dirname(path.join(target,file)),{recursive:true});await cp(path.join(root,file),path.join(target,file));}
  await mkdir(path.join(target, 'server/scripts/fixtures'), { recursive: true });
  await cp(path.join(root, 'server/scripts/fixtures/generation-host.mjs'), path.join(target, 'server/scripts/fixtures/generation-host.mjs'));
  await cp(path.join(root, 'server/scripts/fixtures/installer-interleaving.mjs'), path.join(target, 'server/scripts/fixtures/installer-interleaving.mjs'));
  await cp(path.join(root, 'package.json'), path.join(target, 'package.json'));
  await symlink(path.join(root, 'node_modules'), path.join(target, 'node_modules'));
  // A sealed deployable runtime deliberately refuses links at its root. Exercise
  // the actual installed representation, not an external checkout shortcut.
  await cp(path.join(root, executionPath, '.runtime'), path.join(target, executionPath, '.runtime'), {recursive:true});
  return target;
}
before(async () => {
  assert.ok(node218 && existsSync(node218), 'FOUNDRY_TEST_NODE_2218 must name official Node22.18.0');
  const v = await runBounded(node218, ['--version'], { capture: true }); assert.equal(v.stdout.trim(), 'v22.18.0');
  dir = await mkdtemp(path.join(tmpdir(), 'sds-generation-'));
  cluster = await startDisposablePg(); pool = new pg.Pool({ connectionString: cluster.url });
  oldRoot = await copyRoot('received'); newRoot = await copyRoot('deployment'); driftRoot = await copyRoot('source-drift');
  bundledRoot = await copyRoot('bundled-runtime');
  // The Python-generation control must remain distinct even when the builder
  // itself already uses the pinned standalone runtime. Build a real system venv
  // using the accepted setup script, only in this disposable fixture.
  const systemRoot=await copyRoot('system-runtime-control');
  await rm(path.join(systemRoot,executionPath,'.runtime'),{recursive:true});
  const system=await runBounded('/usr/bin/python3',[path.join(systemRoot,executionPath,'setup-runtime.py')],{cwd:systemRoot,capture:true,stdoutLimit:4096,timeoutMs:60000});
  assert.equal(system.reason,null);assert.equal(system.code,0);
  for(const target of[oldRoot,newRoot,driftRoot]){await rm(path.join(target,executionPath,'.runtime'),{recursive:true});await cp(path.join(systemRoot,executionPath,'.runtime'),path.join(target,executionPath,'.runtime'),{recursive:true,verbatimSymlinks:true});}
  for (const file of ['server/foundry/install.mjs', `${entryPath}/profile.mjs`, `${entryPath}/receiver.mjs`, `${vendor}/scripts/visitor-foundry/entry/src/contract.mjs`]) {
    const r = await runBounded('git', ['show', `${baseHead}:${file}`], { cwd: root, capture: true, stdoutLimit: 100000 });
    assert.equal(r.code, 0); await writeFile(path.join(oldRoot, file), r.stdout);
  }
  await appendFile(path.join(driftRoot, executionPath, 'src/launch.mjs'), '\n// Disposable receiving source generation change.\n');
  await appendFile(path.join(bundledRoot, executionPath, 'src/launch.mjs'), '\n// Disposable receiving source generation change.\n');
  await rm(path.join(bundledRoot, executionPath, '.runtime'),{recursive:true});
  await command(bundledRoot, node218, ['server/foundry/materialize-runtime.mjs'], { FOUNDRY_RUNTIME_FORCE_STANDALONE: '1' });
  assert.notEqual(createHash('sha256').update(await readFile(path.join(newRoot,executionPath,'.runtime/bin/python'))).digest('hex'),createHash('sha256').update(await readFile(path.join(bundledRoot,executionPath,'.runtime/bin/python'))).digest('hex'));
  evidence.pythonControl={system:'/usr/bin/python3',realDistinctInterpreter:true,wasmtime:49};
});
after(async () => {
  for (const host of hosts) await host.stop();
  for (const p of fixturePools) await p.end();
  await pool?.end(); await cluster?.stop(); if (dir) await rm(dir, { recursive: true, force: true });
  if (process.env.FOUNDRY_GENERATION_TEST_RECEIPT) await writeFile(process.env.FOUNDRY_GENERATION_TEST_RECEIPT, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
});
async function fixture() {
  const db = `generation_${randomUUID().replaceAll('-', '')}`, schema = 'pilot_correspondence';
  await pool.query(`CREATE DATABASE "${db}"`);
  const fixturePool = new pg.Pool({ connectionString: cluster.url.replace('/correspondence', `/${db}`) }); fixturePools.add(fixturePool);
  const privateDir = path.join(dir, db); await mkdir(privateDir, { mode: 0o700 });
  const env = { CORRESPONDENCE_DATABASE_URL: cluster.url.replace('/correspondence', `/${db}`), CORRESPONDENCE_PG_SCHEMA: schema,
    FOUNDRY_HOST_PROFILE_FILE: path.join(privateDir, 'host.json'),
    FOUNDRY_PRIVATE_PROFILE_FILE: path.join(privateDir, 'private.json'),
    FOUNDRY_PARTICIPATION_KEY_FILE: path.join(privateDir, 'key') };
  await writeFile(env.FOUNDRY_HOST_PROFILE_FILE, await readFile(path.join(root, entryPath, 'host-profile.example.json')), { mode: 0o600 });
  await writeFile(env.FOUNDRY_PRIVATE_PROFILE_FILE, await readFile(path.join(root, entryPath, 'private-profile.example.json')), { mode: 0o600 });
  await writeFile(env.FOUNDRY_PARTICIPATION_KEY_FILE, 'private-disposable-correspondence-key-32\n', { mode: 0o600 });
  const query = async (sql, values) => {
    const c = await fixturePool.connect();
    try { await c.query('BEGIN'); await c.query(`SET LOCAL search_path TO "${schema}"`); const r = await c.query(sql, values); await c.query('COMMIT'); return r; }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  };
  const install = (cwd = newRoot, node = process.execPath, extra = [], expected = 0, addEnv = {}) => command(cwd, node,
    ['server/foundry/install.mjs', '--migrate', '--install', ...extra], { ...env, ...addEnv }, expected);
  const inspect = (cwd = newRoot, node = node218) => command(cwd, node, ['server/foundry/install.mjs', '--inspect-installation'], env);
  await command(newRoot, process.execPath, ['server/foundry/install.mjs', '--migrate'], env);
  return { env, schema, privateDir, query, install, inspect };
}
async function identity(f) {
  const { installation: i } = await f.inspect();
  return { FOUNDRY_RECEIVE_EXPECTED_HOST_CONFIG_ID: i.hostConfigId, FOUNDRY_RECEIVE_EXPECTED_ENTRY_TERMS_HASH: i.entryTermsHash };
}
async function snapshot(f) {
  const tables = ['correspondence_vf10_installation', 'correspondence_vf10_registrations', 'correspondence_vf12_host',
    'correspondence_vf12_admissions', 'correspondence_vf12_allocation_receipts', 'correspondence_vf04_pools',
    'correspondence_projects', 'correspondence_grants', 'correspondence_events', 'correspondence_vf04_candidates',
    'correspondence_vf04_attempts', 'correspondence_vf04_publications', 'correspondence_vf04_invocations'];
  const out = {};
  for (const table of tables) out[table] = (await f.query(`SELECT to_jsonb(t) AS record FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows.map(r => r.record);
  return out;
}
async function hostFor(f, cwd = newRoot, node = node218) {
  const child = spawn(node, ['server/scripts/fixtures/generation-host.mjs'], { cwd, env: { ...inherited, ...f.env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.stdout.resume(); child.stderr.resume(); const exited = once(child, 'exit');
  let bootTimer;
  const ready = await Promise.race([once(child, 'message').then(([m]) => m), exited.then(() => { throw new Error('fixture_boot_failed'); }),
    new Promise((_, reject) => { bootTimer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('fixture_boot_deadline')); }, 10000); })]).finally(() => clearTimeout(bootTimer));
  let stopped = false;
  const h = { ...ready, async stop() { if (stopped) return; stopped = true; child.kill('SIGTERM'); const [code] = await exited; assert.equal(code, 0); hosts.delete(h); },
    async rpc(op, projectId, candidateId, generation) {
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('fixture_rpc_deadline')); }, 20000);
        const listener = m => { if (m.id !== id) return; clearTimeout(timer); child.off('message', listener); m.error ? reject(new Error(m.error)) : resolve(m.result); };
        child.on('message', listener); child.send({ id, op, projectId, candidateId, generation });
      });
    } };
  hosts.add(h); return h;
}
async function visitor(f, h, name, node = node218, cwd = newRoot) {
  const r = await fetch(`${h.baseUrl}/v1/visitor-entry`, { signal: AbortSignal.timeout(5000) });
  const d = await r.json(); assert.equal(r.status, 200);
  const config = path.join(f.privateDir, `${name}.json`);
  await writeFile(config, JSON.stringify({ baseUrl: h.baseUrl, directory: path.join(f.privateDir, name), authority: {
    profileId: d.profile.profileId, entryTerms: d.profile.termsHash, contributionTerms: d.profile.contribution.binding.contributionTerms,
    scope: 'synthetic-reusable-components' } }), { mode: 0o600 });
  const run = async (mode, input) => {
    const inputFile = `${config}.${randomUUID()}`;
    if (input !== undefined) await writeFile(inputFile, JSON.stringify(input), { mode: 0o600 });
    return command(path.join(cwd, vendor), node, ['scripts/visitor-foundry/integration/entry/visitor.mjs', mode, config, ...(input === undefined ? [] : [inputFile])]);
  };
  const registered = await run('register'); assert.equal(registered.body.receiver.state, 'ready');
  return { run, config, registered, projectId: registered.body.projectId };
}

test('real unchanged legacy installer replay; Node22.18.0 mismatch reproduced and closed pools', async () => {
  const f = await fixture(); const a = await f.install(oldRoot); const b = await f.install(oldRoot);
  assert.deepEqual(a, b);
  const before = await snapshot(f); await f.install(oldRoot, node218, [], 1); assert.deepEqual(await snapshot(f), before);
  // The old installer closes pools only on success; the fixed installer must close on rejection.
  await f.install(newRoot, node218, [], 1); assert.deepEqual(await snapshot(f), before);
});
test('read-only identity inspection does not migrate or reset legacy enrollment', async () => {
  const f = await fixture(); await f.install(oldRoot); const before = await snapshot(f);
  const i = await f.inspect(); assert.equal(i.migrated, false); assert.equal(i.installation.allocationMatches, false);
  assert.deepEqual(await snapshot(f), before);
});
test('expected-old conflict refuses authority rewrite atomically', async () => {
  const f = await fixture(); await f.install(oldRoot); const before = await snapshot(f); const env = await identity(f);
  await f.install(newRoot, node218, ['--receive-unconsumed'], 1, { ...env, FOUNDRY_RECEIVE_EXPECTED_HOST_CONFIG_ID: `sha256:${'a'.repeat(64)}` });
  assert.deepEqual(await snapshot(f), before);
  await f.install(newRoot, node218, ['--receive-unconsumed'], 1, { ...env, FOUNDRY_RECEIVE_EXPECTED_ENTRY_TERMS_HASH: `sha256:${'b'.repeat(64)}` });
  assert.deepEqual(await snapshot(f), before);
});
test('receiving without expected identities refuses before migration or private enrollment', async () => {
  const f = await fixture(); const before = await snapshot(f);
  await f.install(newRoot, node218, ['--receive-unconsumed'], 2);
  assert.deepEqual(await snapshot(f), before);
});
test('unconsumed transition preserves full original authority/charge/caps; concurrent exact replay', async () => {
  const iterations = Number(process.env.FOUNDRY_CONCURRENT_ITERATIONS ?? 1);
  assert.ok(Number.isInteger(iterations) && iterations >= 1 && iterations <= 100);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const f = await fixture(); await f.install(oldRoot); const before = await snapshot(f); const env = await identity(f);
    const settled = await Promise.allSettled([f.install(newRoot, node218, ['--receive-unconsumed'], 0, env), f.install(newRoot, node218, ['--receive-unconsumed'], 0, env)]);
    // Reap both diagnostic children even when either control fails.
    const results = settled.map(r => { assert.equal(r.status, 'fulfilled', r.reason?.message); return r.value; });
    assert.deepEqual(results.map(r => r.receiving.replayed).sort(), [false, true]);
    assert.equal(results[0].receiving.id, results[1].receiving.id);
    const after = await snapshot(f); const e = after.correspondence_vf10_installation[0], prior = before.correspondence_vf10_installation[0];
    for (const key of Object.keys(prior).filter(k => k !== 'active_profile')) assert.deepEqual(e[key], prior[key]);
    const record = after.correspondence_vf12_allocation_receipts[0].record;
    assert.deepEqual(record.originalInstallation, prior); assert.deepEqual(record.previousHost, before.correspondence_vf12_host[0].config);
    for (const key of ['id','pool','maxAdmissions','maxPhysical','allowance','aggregate','contributionTerms','physicalMemoryMb','sharing','evaluator']) assert.deepEqual(record.nextHost[key], record.previousHost[key]);
    assert.equal(record.evidenceTrusted, false); assert.equal(record.visitorWorkReplayed, false);
    evidence.transitions.push({ ...results[0].receiving, concurrentReplay: true, previousHostConfigId: record.previousHost.configId,
      previousEntryTermsHash: record.previousEntry.termsHash, originalTermsHash: record.originalInstallation.profile.termsHash,
      charged: record.originalInstallation.charged, maxEnrollments: record.originalInstallation.max_enrollments,
      maxAdmissions: record.nextHost.maxAdmissions, maxPhysical: record.nextHost.maxPhysical,
      oldRecordsRetained: true, originalAuthorityPreserved: true });
    assert.equal((await f.install(newRoot, node218)).charged, 0);
    assert.deepEqual(await snapshot(f), after);
  }
});
test('forced owning migration/receive boundary reproduces old deadlock and preserves new lock order', async () => {
  const unsafe = await copyRoot('unsafe-entry-migration');
  const file = `${vendor}/scripts/visitor-foundry/entry/src/store.mjs`;
  const received = await runBounded('git', ['show', `6e901035597bfa46ece12de072a7ae3880703da8:${file}`], { cwd: root, capture: true, stdoutLimit: 100000 });
  assert.equal(received.reason, null); assert.equal(received.code, 0); await writeFile(path.join(unsafe, file), received.stdout);
  for (const [cwd, corrected] of [[unsafe, false], [newRoot, true]]) {
    const f = await fixture(); await f.install(oldRoot); const env = await identity(f); const before = await snapshot(f);
    const result = await command(cwd, node218, ['server/scripts/fixtures/installer-interleaving.mjs'], { ...f.env, ...env });
    assert.equal(result.locks.installationWait, true); assert.equal(result.locks.registrationsHeld, !corrected);
    if (!corrected) assert.ok(result.outcomes.some(r => r.code === '40P01'));
    else {
      assert.ok(result.outcomes.every(r => r.ok)); assert.equal(result.outcomes[0].receipt.replayed, false);
      const replay = await f.install(newRoot, node218, ['--receive-unconsumed'], 0, env);
      assert.equal(replay.receiving.replayed, true); assert.equal(replay.receiving.id, result.outcomes[0].receipt.id);
      const after = await snapshot(f); const prior = before.correspondence_vf10_installation[0];
      for (const key of Object.keys(prior).filter(k => k !== 'active_profile')) assert.deepEqual(after.correspondence_vf10_installation[0][key], prior[key]);
      assert.equal(after.correspondence_vf12_allocation_receipts.length, 1);
      assert.equal(after.correspondence_vf12_admissions.length, 0);
    }
    evidence.transitions.push({ forcedLockOrder: true, corrected, ...result });
  }
});
test('changed allocation caps cannot use the pre-admission transition', async () => {
  const f = await fixture(); await f.install(oldRoot); const env = await identity(f); const before = await snapshot(f);
  const p = JSON.parse(await readFile(f.env.FOUNDRY_HOST_PROFILE_FILE)); p.maxAdmissions--;
  await writeFile(f.env.FOUNDRY_HOST_PROFILE_FILE, JSON.stringify(p));
  await f.install(newRoot, node218, ['--receive-unconsumed'], 1, env); assert.deepEqual(await snapshot(f), before);
});
test('receipt commit failure rolls host/profile updates back together', async () => {
  const f = await fixture(); await f.install(oldRoot); const env = await identity(f);
  await f.query(`CREATE FUNCTION refuse_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'receiving_test_injected_failure'; END $$;
    CREATE TRIGGER refuse_receipt BEFORE INSERT ON correspondence_vf12_allocation_receipts
    FOR EACH ROW EXECUTE FUNCTION refuse_receipt()`);
  const before = await snapshot(f);
  await f.install(newRoot, node218, ['--receive-unconsumed'], 1, env);
  assert.deepEqual(await snapshot(f), before);
});
test('populated legacy admissions refuse transition without rewriting registrations', async () => {
  const f = await fixture(); await f.install(oldRoot); const env = await identity(f);
  const h = await hostFor(f, oldRoot, process.execPath); await visitor(f, h, 'legacy', process.execPath, oldRoot); await h.stop();
  const before = await snapshot(f); assert.equal(before.correspondence_vf10_installation[0].charged, 1);
  await f.install(newRoot, node218, ['--receive-unconsumed'], 1, env); assert.deepEqual(await snapshot(f), before);
});
test('stable allocation installer replays across real Node and changed installed source identities', async () => {
  const f = await fixture(); const first = await f.install(newRoot, process.execPath);
  const before = await snapshot(f); const second = await f.install(newRoot, node218); const third = await f.install(driftRoot, node218);
  assert.deepEqual(second, first); assert.deepEqual(third, first); assert.deepEqual(await snapshot(f), before);
});

test('reserved legacy registration with no project/admission refuses receiving', async () => {
  const f = await fixture(); await f.install(oldRoot); const env = await identity(f);
  const code = `import {PostgresStore} from '@neomorphic/correspondence';
    import {openEntryFacade,closeEntryThenBase} from './server/foundry/compose.js';
    const databaseUrl=process.env.CORRESPONDENCE_DATABASE_URL,pgSchema=process.env.CORRESPONDENCE_PG_SCHEMA;
    const base=new PostgresStore(databaseUrl,{schema:pgSchema,poolMax:1});
    const {mounted}=await openEntryFacade({store:base,config:{databaseUrl,pgSchema,trustProxyHops:0,corsOrigins:[],bodyLimitBytes:524288,rateLimitWindowMs:60000,rateLimitMax:100,adminToken:'fixture-does-not-serve'},env:process.env});
    try{const d=await mounted.entry.describe();await mounted.entry.reserve({schema:d.schema,requestId:'fixture-reservation-100503',profileId:d.profile.profileId,termsHash:d.profile.termsHash},'fixture-reservation-100503','${Buffer.alloc(32, 1).toString('base64url')}');console.log('{}');}finally{await closeEntryThenBase(mounted,base);}`;
  await command(oldRoot, process.execPath, ['--input-type=module', '-e', code], f.env);
  const before = await snapshot(f); assert.equal(before.correspondence_vf10_installation[0].charged, 1);
  assert.equal(before.correspondence_vf12_admissions.length, 0); assert.equal(before.correspondence_projects.length, 0);
  await f.install(newRoot, node218, ['--receive-unconsumed'], 1, env); assert.deepEqual(await snapshot(f), before);
});

test('visitor authority/private correspondence survive Node/source/Python generations with fresh verification', async t => {
  const f = await fixture(); await f.install(oldRoot); const env = await identity(f);
  await f.install(newRoot, process.execPath, ['--receive-unconsumed'], 0, env);
  let h = await hostFor(f, newRoot, process.execPath);
  const a = await visitor(f, h, 'visitor-a', process.execPath);
  const checkpoint = await a.run('checkpoint', { text: 'private visitor A correspondence remains private' });
  assert.ok(checkpoint);
  const contribution = await a.run('contribute', original());
  const candidateId = contribution.submission.admission.candidateId; assert.ok(candidateId);
  await t.test('already reserved job blocks maintenance; the exact admitted job completes once', async () => {
    const reserved = await h.rpc('reserve', a.projectId);
    const p = (await command(newRoot, process.execPath, ['server/foundry/generation.mjs', '--inspect'], f.env)).pools[0];
    assert.equal(p.outstandingPhysical, 1);
    const file = path.join(f.privateDir, 'busy.json');
    await writeFile(file, JSON.stringify({ projectId: a.projectId, expectedVerificationId: p.verificationId,
      revision: 'vf09:busy-must-not-change', validityMs: p.validityMs, key: 'busy-maintenance-request', candidates: [] }), { mode: 0o600 });
    const before = await snapshot(f);
    await command(newRoot, process.execPath, ['server/foundry/generation.mjs', '--apply'], { ...f.env, FOUNDRY_GENERATION_REQUEST_FILE: file }, 2);
    assert.deepEqual(await snapshot(f), before);
    await h.rpc('verify-reserved', a.projectId, reserved.assignment.id);
    assert.equal((await snapshot(f)).correspondence_vf04_attempts.length, 1);
  });
  await h.rpc('publish', a.projectId, candidateId);
  const first = await a.run('use', task(cases[0].input)); assert.deepEqual(first.invocation.output, cases[0].expected);
  const originalInstallation = (await snapshot(f)).correspondence_vf10_installation[0];
  const privateRecords = (await snapshot(f)).correspondence_events;
  const receipt = (await snapshot(f)).correspondence_vf12_allocation_receipts;
  const identities = [];
  for (const [index, cwd, node] of [[2, newRoot, node218], [3, driftRoot, node218], [4, bundledRoot, node218]]) {
    await h.stop();
    await t.test(`generation ${index}: stale evidence blocked; explicit renewal does not execute or refill`, async () => {
      const prior = await snapshot(f);
      const inspection = await command(cwd, node, ['server/foundry/generation.mjs', '--inspect'], f.env);
      const p = inspection.pools.find(p => p.projectId === a.projectId);
      assert.equal(p.installedVerificationMatches, false); assert.equal(p.outstandingPhysical, 0);
      assert.deepEqual(await snapshot(f), prior);
      if (index > 2) {
        await command(cwd, node, ['server/foundry/generation.mjs', '--apply'], { ...f.env,
          FOUNDRY_GENERATION_REQUEST_FILE: path.join(f.privateDir, `generation-${index - 1}.json`) }, 2);
        assert.deepEqual(await snapshot(f), prior);
      }
      assert.equal((await f.install(cwd, node)).charged, originalInstallation.charged);
      h = await hostFor(f, cwd, node);
      const config = JSON.parse(await readFile(a.config)); config.baseUrl = h.baseUrl;
      // CLI continuation seals the actual origin; use its saved tokens through the
      // same private client with a new transport after process restart.
      const secret = (await readFile(path.join(f.privateDir, 'visitor-a/registration.secret'), 'utf8')).trim();
      const { grantToken } = await import('../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/contract.mjs');
      const token = grantToken(secret, a.registered.body.registrationId, 'writer');
      const request = task(cases[0].input);
      const discovery = await fetch(`${h.baseUrl}/v1/projects/${a.projectId}/foundry/task`, { method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ request, negotiation: { accepts: [] }, sharing: null }), signal: AbortSignal.timeout(10000) });
      const d = await discovery.json(); assert.equal(d.manifest ?? null, null);
      assert.equal((await snapshot(f)).correspondence_vf04_invocations.length, prior.correspondence_vf04_invocations.length);
      const file = path.join(f.privateDir, `generation-${index}.json`);
      await writeFile(file, JSON.stringify({ projectId: a.projectId, expectedVerificationId: p.verificationId,
        revision: `vf09:receiving-100503-${index}`, validityMs: p.validityMs, key: `receive-generation-${index}`,
        candidates: [{ candidateId, expectedGeneration: index - 1, key: `revalidate-generation-${index}`, reason: 'verification_changed' }] }), { mode: 0o600 });
      const applied = await command(cwd, node, ['server/foundry/generation.mjs', '--apply'], { ...f.env, FOUNDRY_GENERATION_REQUEST_FILE: file });
      assert.equal(applied.published, false); assert.equal(applied.freshExecutionRequired, true);
      const afterApply = await snapshot(f);
      assert.equal(afterApply.correspondence_vf04_attempts.length, prior.correspondence_vf04_attempts.length);
      assert.equal(afterApply.correspondence_vf04_invocations.length, prior.correspondence_vf04_invocations.length);
      assert.equal(afterApply.correspondence_vf04_candidates[0].generation, index);
      assert.deepEqual(afterApply.correspondence_vf10_installation, prior.correspondence_vf10_installation);
      assert.deepEqual(afterApply.correspondence_vf12_admissions, prior.correspondence_vf12_admissions);
      assert.deepEqual(afterApply.correspondence_events, privateRecords);
      const replay = await command(cwd, node, ['server/foundry/generation.mjs', '--apply'], { ...f.env, FOUNDRY_GENERATION_REQUEST_FILE: file });
      assert.equal(replay.verificationId, applied.verificationId); assert.equal(replay.candidates[0].replayed, true);
      assert.deepEqual(await snapshot(f), afterApply);
      await command(cwd, node, ['server/foundry/worker.mjs', 'dispatch', a.projectId], { ...f.env, FOUNDRY_HOST_OPT_IN: '1' });
      const afterVerify = await snapshot(f);
      evidence.generations.push({ generation: index, node: node === node218 ? 'v22.18.0' : process.version,
        verification: afterVerify.correspondence_vf04_pools.find(p => p.project_id === a.projectId).verification,
        receivedSourceChange: index >= 3, bundledPython: index === 4, oldEvidenceRejected: true,
        renewalDidNotExecute: true, originalAuthorityPreserved: true, oldRecordsRetained: true,
        freshVerificationCases: cases.length, compileInstantiateExecute: true });
      for (const table of ['correspondence_vf04_attempts','correspondence_vf04_publications','correspondence_vf04_invocations']) {
        for (const old of prior[table]) assert.ok(afterVerify[table].some(row => JSON.stringify(row) === JSON.stringify(old)), `${table} history preserved`);
      }
      const current = afterVerify.correspondence_vf04_attempts.find(x => x.generation === index);
      assert.equal(current.state, 'reconciled'); identities.push(current.verification.runtimePin);
      assert.equal(afterVerify.correspondence_vf04_publications.find(p => p.generation === index).state, 'published');
      assert.deepEqual(afterVerify.correspondence_events, privateRecords);
      assert.deepEqual(afterVerify.correspondence_vf12_allocation_receipts, receipt);
      assert.equal(afterVerify.correspondence_vf04_publications.length, index);
      if (index === 2) {
        const beforeBoot = await snapshot(f);
        const actual = await bootFoundryServer({ ...inherited, ...f.env, NODE_ENV: 'production', PORT: '0',
          FOUNDRY_HOST_OPT_IN: '1', CORRESPONDENCE_ADMIN_TOKEN: 'disposable-only-admin-token-32chars',
          CORRESPONDENCE_STORE: 'postgres', CORRESPONDENCE_POOL_MAX: '1',
          SUPABASE_URL: 'https://local-baseline.example', SUPABASE_SERVICE_ROLE_KEY: 'local-baseline-stub',
          STRIPE_SECRET_KEY: 'local-baseline-stub', RESEND_API_KEY: 'local-baseline-stub',
        }, node218, newRoot);
        try {
          const health = await fetch(`${actual.origin}/api/correspondence/healthz`, { signal: AbortSignal.timeout(8000) });
          assert.equal((await health.json()).enabled, true);
          assert.deepEqual(await snapshot(f), beforeBoot);
        } finally { await actual.stop(); }
        assert.deepEqual(await snapshot(f), beforeBoot);
      }
    });
  }
  assert.equal(new Set(identities).size, 3);
  await t.test('later visitor acquires/executes after restart; useful negative and changed input retain bindings', async () => {
    await h.stop(); const beforeBoot = await snapshot(f); h = await hostFor(f, bundledRoot, node218);
    assert.deepEqual(await snapshot(f), beforeBoot); // Cold deploy performs no migration/write.
    const b = await visitor(f, h, 'visitor-b', node218, bundledRoot);
    assert.notEqual(a.projectId, b.projectId);
    for (const item of [cases[0], cases[1], cases[3]]) {
      const used = await b.run('use', task(item.input)); assert.deepEqual(used.invocation.output, item.expected);
      const row = (await f.query('SELECT execution FROM correspondence_vf04_invocations WHERE project_id=$1 AND task_id=$2', [b.projectId, used.invocation.taskId])).rows[0];
      assert.equal(row.execution.binding.candidateId, candidateId);
      assert.equal(row.execution.generation, 4);
      assert.deepEqual(row.execution.sample.observation.phasesObserved.map(p => p.phase), ['compile','instantiate','execute']);
      assert.equal(row.execution.sample.observation.termination.exited, true); assert.equal(row.execution.sample.observation.termination.drained, true);
      assert.equal(existsSync(`/proc/${row.execution.sample.observation.processIdentity.pid}`), false);
    }
    const changed = await b.run('use', task({ structuredContent: { changed: 'not held out' } }));
    assert.equal(changed.invocation, null);
    const after = await snapshot(f);
    assert.deepEqual(after.correspondence_events, privateRecords);
    assert.deepEqual(after.correspondence_vf12_allocation_receipts, receipt);
    assert.equal(after.correspondence_vf10_installation[0].charged, 2);
    assert.equal(after.correspondence_vf04_attempts.length, 4);
    assert.equal(after.correspondence_vf04_publications.length, 4);
    const exactReplay = await f.install(bundledRoot, node218, ['--receive-unconsumed'], 0, env);
    assert.equal(exactReplay.receiving.replayed, true); assert.equal(exactReplay.charged, 2);
    assert.deepEqual(await snapshot(f), after);
    const inspect = await command(bundledRoot, node218, ['server/foundry/generation.mjs', '--inspect'], f.env);
    assert.ok(inspect.pools.every(p => p.installedVerificationMatches && p.outstandingPhysical === 0));
  });
});

test('generation request rejects symlink, public path, wrong mode and product database before mutation', async () => {
  const f = await fixture(); await f.install(); const before = await snapshot(f);
  const payload = { projectId: 'unused', expectedVerificationId: null, revision: 'unused', validityMs: 1000, key: 'unused-request', candidates: [] };
  const file = path.join(f.privateDir, 'request.json'); await writeFile(file, JSON.stringify(payload), { mode: 0o600 });
  const link = `${file}.link`; await symlink(file, link);
  await command(newRoot, node218, ['server/foundry/generation.mjs', '--apply'], { ...f.env, FOUNDRY_GENERATION_REQUEST_FILE: link }, 2);
  await chmod(file, 0o644);
  await command(newRoot, node218, ['server/foundry/generation.mjs', '--apply'], { ...f.env, FOUNDRY_GENERATION_REQUEST_FILE: file }, 2);
  await chmod(file, 0o600);
  await command(newRoot, node218, ['server/foundry/generation.mjs', '--apply'], { ...f.env, FOUNDRY_GENERATION_REQUEST_FILE: path.join(newRoot, 'client/public/request.json') }, 2);
  await command(newRoot, node218, ['server/foundry/generation.mjs', '--inspect'], { ...f.env,
    CORRESPONDENCE_DATABASE_URL: 'postgres://fixture@db.arvmcttdegqwiwdaembr.supabase.co/postgres' }, 2);
  assert.deepEqual(await snapshot(f), before);
});

test('all vendored amendments declare exact base/current hashes; execution remains sealed', async () => {
  const pin = await verifyFoundrySource(root);
  const current = pin.localAmendments.find(a => a.package === 'ROOT-SOL-RETAINED-GENERATION-100503');
  assert.equal(current.sdsBase, baseHead);
});

test('actual managed-host named receive build receives the same private unconsumed enrollment', async () => {
  const f = await fixture(); await f.install(oldRoot); const env = await identity(f);
  const before = await snapshot(f);
  // Managed delivery uses its own fresh bundled installation. A local system
  // venv is a separate identity and must never be converted by this test.
  const managedRoot=await copyRoot('managed-receive-build');
  await rm(path.join(managedRoot,executionPath,'.runtime'),{recursive:true});
  await cp(path.join(root,'client'),path.join(managedRoot,'client'),{recursive:true,filter:p=>!['node_modules','build','dist'].includes(path.basename(p))});
  await cp(path.join(root,'server/lib'),path.join(managedRoot,'server/lib'),{recursive:true});
  await cp(path.join(root,'server/scripts/generate-route-shells.js'),path.join(managedRoot,'server/scripts/generate-route-shells.js'));
  await cp(path.join(root,'package-lock.json'),path.join(managedRoot,'package-lock.json'));
  const result = await runBounded('npm', ['run', 'build:managed-foundry-receive'], { cwd: managedRoot,
    env: { ...inherited, ...f.env, ...env, PATH: `${path.dirname(node218)}:${inherited.PATH}` },
    timeoutMs: 180000, capture: true, stdoutLimit: 1048576, outputLimit: 2097152 });
  assert.equal(result.reason, null); assert.equal(result.code, 0);
  const installed = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(installed.receiving.replayed, false); assert.equal(installed.installed, true);
  assert.equal(installed.schema, f.schema); assert.equal(installed.charged, 0);
  const after = await snapshot(f);
  assert.deepEqual(after.correspondence_vf10_installation[0].profile, before.correspondence_vf10_installation[0].profile);
  assert.deepEqual(after.correspondence_vf10_registrations, before.correspondence_vf10_registrations);
  assert.deepEqual(after.correspondence_vf12_allocation_receipts[0].record.originalInstallation, before.correspondence_vf10_installation[0]);
  evidence.namedReceiveBuild = { exit: result.code, schema: installed.schema, ...installed.receiving, activation: false, migratedExplicitly: true };
});
