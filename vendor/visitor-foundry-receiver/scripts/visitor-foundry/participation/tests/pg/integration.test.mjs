import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, fork } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { boot, project, grant, request } from '../../../work-cells/tests/helpers.mjs';
import { vf02Port } from '../../src/vf02-port.mjs';
import { ParticipationSession, continuationHint } from '../../src/index.mjs';
import { tokenFingerprint } from '../../../../../packs/contributor-session-grant/src/hash.mjs';
import { preflightHost, tasks, negotiation } from '../../examples/hosts.mjs';
const key = 'vf05-fixture-only-identity-key-32-bytes';
const hash = x => `sha256:${createHash('sha256').update(JSON.stringify(x)).digest('hex')}`;
const ref = x => ({ uri: `https://fixtures.invalid/vf05/${hash(x).slice(7)}`, digest: hash(x) });
const command = (action, expectedRevision, fields = {}) => ({ schema: 'neomorphic.foundry.work-cell-command.v1', action, expectedRevision, ...fields });
const SENTINEL = 'PRIVATE_VF05_PG_SENTINEL_72e';
async function cli(...args) {
  const child = spawn(process.execPath, ['scripts/visitor-foundry/participation/cli.mjs', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', x => { stdout += x; }); child.stderr.on('data', x => { stderr += x; });
  const [exit] = await once(child, 'exit'); assert.equal(exit, 0, stderr); assert.ok(!stdout.includes(SENTINEL) && !stderr.includes(SENTINEL));
  return JSON.parse(stdout);
}
function session(baseUrl, p, token, port, currentTerms) {
  return new ParticipationSession({ identityKey: key, binding: { origin: baseUrl, tenantId: p.projectId, grantFingerprint: tokenFingerprint(token) }, port, currentTerms });
}

test('separate real HTTP/PG server, VF01 miss, lost ack, cold CLI replay, restart, submission, scoped readback', async t => {
  let host = await boot(); t.after(async () => host.stop());
  const logs = [];
  const capture = h => { h.child.stdout.on('data', x => logs.push(x.toString())); h.child.stderr.on('data', x => logs.push(x.toString())); };
  capture(host);
  const service = fork(new URL('./service-owner-host.mjs', import.meta.url), [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const serviceExit = once(service, 'exit');
  t.after(async () => { if (service.exitCode === null) service.kill('SIGTERM'); await serviceExit; });
  service.stdout.on('data', x => logs.push(x.toString())); service.stderr.on('data', x => logs.push(x.toString()));
  let deadline;
  const [serviceReady] = await Promise.race([once(service, 'message'), new Promise((_, reject) => { deadline = setTimeout(() => reject(Error('embedding startup timeout')), 10000); })]).finally(() => clearTimeout(deadline));
  const discovery = await cli('discovery', serviceReady.baseUrl);
  assert.equal(discovery.mode, 'local-directory'); assert.ok(Array.isArray(discovery.capabilities)); assert.equal(discovery.participation, undefined);
  const ordinary = await fetch(`${serviceReady.baseUrl}/preflight`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskCase: 'original' }) });
  assert.deepEqual(await ordinary.json(), { status: 'unknown' });
  const embedded = await fetch(`${serviceReady.baseUrl}/preflight`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskCase: 'original', negotiation }) });
  const offered = await embedded.json(); assert.equal(offered.original.status, 'unknown'); assert.equal(offered.participation.status, 'genuine-miss');
  const originalHost = host.baseUrl;
  const p = await project(host.baseUrl), writer = await grant(host.baseUrl, p);
  const dir = mkdtempSync(join(tmpdir(), 'vf05-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const asset = preflightHost(); const first = asset.invoke(tasks.preflight.original);
  assert.equal(first.participation.status, 'genuine-miss');
  // TEST ONLY wire projection. Production miss-to-cell belongs exclusively to VF04.
  const gap = first.assessment.gap;
  const wireGap = { schema: 'neomorphic.foundry.work-cell-gap.v1', id: gap.id, contentId: gap.contentId, resolverSnapshot: ref(asset.snapshot), reproducer: ref(tasks.preflight.original), permission: 'synthetic', fundingKind: gap.funding.kind };
  const create = command('create', 0, { gap: wireGap, workScope: 'scope:vf05-preflight' });
  const urls = []; let lose = true;
  const port = vf02Port({ baseUrl: host.baseUrl, projectId: p.projectId, token: writer.token, fetch: async (url, options) => {
    urls.push(url); const response = await fetch(url, options);
    if (options.method === 'POST' && lose) { lose = false; await response.text(); throw Error(SENTINEL); }
    return response;
  } });
  const s = session(host.baseUrl, p, writer.token, port, async () => gap.contentId);
  const intent = s.prepare({ mode: 'counterexample', operation: 'create', body: create, consent: true, termsVersion: gap.contentId });
  writeFileSync(join(dir, 'intent.json'), JSON.stringify(intent), { mode: 0o600 });
  writeFileSync(join(dir, 'token'), writer.token, { mode: 0o600 }); writeFileSync(join(dir, 'identity-key'), key, { mode: 0o600 });
  const config = { baseUrl: host.baseUrl, projectId: p.projectId, tokenFile: join(dir, 'token'), identityKeyFile: join(dir, 'identity-key'), termsVersion: gap.contentId };
  const configPath = join(dir, 'config.json'); writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  const unknown = await s.execute(intent); assert.equal(unknown.status, 'unknown-outcome');
  const replay = await cli('reconcile', configPath, join(dir, 'intent.json'));
  assert.equal(replay.status, 'committed'); assert.equal(replay.replayed, true); assert.equal(replay.revision, 1);
  assert.equal((await cli('resume', configPath, replay.cellId)).revision, 1);
  let cell = (await port.read({ cellId: replay.cellId })).cell;
  const act = async (action, fields, mode = 'maintain-cell', current = cell) => s.execute(s.prepare({ mode, operation: action, cellId: current.id, termsVersion: gap.contentId, consent: true, body: command(action, current.revision, fields) }));
  const claim = await act('claim', { ttlSeconds: 60, voluntaryOptIn: true }); assert.equal(claim.status, 'committed'); cell = claim.receipt.receipt.cell;
  const exactReplay = await act('claim', { ttlSeconds: 60, voluntaryOptIn: true }, 'maintain-cell', { ...cell, revision: 1 }); assert.equal(exactReplay.receipt.replayed, true);
  const stale = await act('claim', { ttlSeconds: 61, voluntaryOptIn: true }, 'maintain-cell', { ...cell, revision: 1 }); assert.equal(stale.status, 'stale-revision');
  const checkpoint = { schema: 'neomorphic.foundry.checkpoint.v1', artifact: ref({ exact: 'synthetic regression data' }), summary: 'Unsupported tilde syntax reproduced', nextStep: 'Propose independent range-grammar coverage test; data only' };
  const cp = await act('checkpoint', { fence: cell.fence, checkpoint }); assert.equal(cp.status, 'committed'); cell = cp.receipt.receipt.cell;
  const beforeRestart = cell;
  await host.stop('SIGKILL'); host = await boot(); capture(host);
  // A new server process on a new loopback port requires fresh host binding, not editing a sealed intent.
  assert.notEqual(host.baseUrl, originalHost); config.baseUrl = host.baseUrl; writeFileSync(configPath, JSON.stringify(config));
  const resumed = await cli('resume', configPath, cell.id); assert.equal(resumed.revision, 3);
  const newPort = vf02Port({ baseUrl: host.baseUrl, projectId: p.projectId, token: writer.token });
  const cold = session(host.baseUrl, p, writer.token, newPort, async () => gap.contentId);
  const read = await cold.resume(continuationHint(cell.id)); assert.deepEqual(read.current.cell.checkpoint, beforeRestart.checkpoint);
  const contribution = { schema: 'neomorphic.foundry.contribution.v1', gapId: gap.id, gapRevision: gap.contentId,
    sourceRevision: hash(asset.version.source), artifact: ref(asset.version.source), rights: 'MIT existing sample; synthetic regression permission',
    testProposal: 'Data: assert unsupported tilde range remains unknown; separately replay >=22.1 on Node 22.0.0. Never execute submitted text.', limitations: 'Existing asset adaptation only; no tilde implementation or independent validation claimed.', operatorScope: 'one bounded engine compatibility counterexample', checkpointRevision: cell.checkpoint.revision };
  const submit = cold.prepare({ mode: 'adapt-artifact', operation: 'submit', cellId: cell.id, termsVersion: gap.contentId, consent: true,
    body: command('submit', cell.revision, { fence: cell.fence, contribution }) });
  const submitted = await cold.execute(submit); assert.equal(submitted.status, 'committed'); assert.equal(submitted.receipt.receipt.cell.status, 'submitted');
  assert.equal((await cold.reconcile(submit)).receipt.replayed, true);
  const foreign = await project(host.baseUrl); const foreignPort = vf02Port({ baseUrl: host.baseUrl, projectId: p.projectId, token: foreign.owner });
  const unauthorized = session(host.baseUrl, p, foreign.owner, foreignPort, async () => gap.contentId);
  assert.equal((await unauthorized.resume(continuationHint(cell.id))).status, 'not-found');
  await assert.rejects(unauthorized.execute(submit), /intent_binding_mismatch/);
  const revoke = await request(host.baseUrl, `/v1/projects/${p.projectId}/grants/${writer.grantId}`, { token: p.owner, method: 'DELETE' }); assert.equal(revoke.status, 204);
  assert.equal((await cold.reconcile(submit)).status, 'stale-grant');
  assert.equal(asset.invoke(tasks.preflight.later).response.body.status, tasks.preflight.later.expected);
  assert.ok(!JSON.stringify([unknown, replay, urls, logs, readFileSync(join(dir, 'intent.json'), 'utf8')]).includes(SENTINEL));
  // No independent verification configured: submitted cannot imply published/paid.
  assert.equal(submitted.receipt.receipt.cell.disposition, null);
});

test('two authenticated clients, concurrent claims, stale fence, reader denial, revoked grant', async t => {
  const host = await boot(); t.after(() => host.stop());
  const p = await project(host.baseUrl), a = await grant(host.baseUrl, p), b = await grant(host.baseUrl, p), reader = await grant(host.baseUrl, p, 'reader');
  const gap = { schema: 'neomorphic.foundry.work-cell-gap.v1', id: 'gap:contended', contentId: hash('revision'), resolverSnapshot: ref('snapshot'), reproducer: ref('reproducer'), permission: 'synthetic', fundingKind: 'unfunded-request' };
  const make = token => { const port = vf02Port({ baseUrl: host.baseUrl, projectId: p.projectId, token }); return session(host.baseUrl, p, token, port, async () => gap.contentId); };
  const sa = make(a.token), sb = make(b.token), sr = make(reader.token);
  const create = sa.prepare({ mode: 'report-gap', operation: 'create', termsVersion: gap.contentId, consent: true, body: command('create', 0, { gap, workScope: 'scope:race' }) });
  const cell = (await sa.execute(create)).receipt.receipt.cell;
  const claim = s => s.prepare({ mode: 'maintain-cell', operation: 'claim', cellId: cell.id, termsVersion: gap.contentId, consent: true, body: command('claim', 1, { ttlSeconds: 60, voluntaryOptIn: true }) });
  assert.equal((await sr.execute(claim(sr))).status, 'forbidden');
  const outcomes = await Promise.all([sa.execute(claim(sa)), sb.execute(claim(sb))]);
  assert.equal(outcomes.filter(x => x.status === 'committed').length, 1); assert.equal(outcomes.filter(x => x.status === 'stale-revision').length, 1);
  const winnerIndex = outcomes.findIndex(x => x.status === 'committed'), winner = [sa, sb][winnerIndex];
  const state = outcomes[winnerIndex].receipt.receipt.cell;
  const staleFence = winner.prepare({ mode: 'maintain-cell', operation: 'checkpoint', cellId: cell.id, termsVersion: gap.contentId, consent: true, body: command('checkpoint', state.revision, { fence: state.fence + 1, checkpoint: { schema: 'neomorphic.foundry.checkpoint.v1', artifact: ref('a'), summary: 'data', nextStep: 'data' } }) });
  assert.equal((await winner.execute(staleFence)).status, 'stale-fence');
});

test('every mutation reconciles a lost ack with one durable transition and fresh client', async t => {
  const host = await boot(); t.after(() => host.stop());
  const p = await project(host.baseUrl), writer = await grant(host.baseUrl, p);
  const gap = { schema: 'neomorphic.foundry.work-cell-gap.v1', id: 'gap:all-acks', contentId: hash('terms'), resolverSnapshot: ref('snapshot'), reproducer: ref('reproducer'), permission: 'synthetic', fundingKind: 'voluntary' };
  const urls = []; let drop = true;
  const port = vf02Port({ baseUrl: host.baseUrl, projectId: p.projectId, token: writer.token, fetch: async (url, options) => {
    urls.push(url); const response = await fetch(url, options);
    if (options.method === 'POST' && drop) { drop = false; await response.text(); throw Error(SENTINEL); }
    return response;
  } });
  let cell;
  for (const op of ['create', 'claim', 'checkpoint', 'submit']) {
    const fields = op === 'create' ? { gap, workScope: 'scope:all-acks' }
      : op === 'claim' ? { ttlSeconds: 60, voluntaryOptIn: true }
      : op === 'checkpoint' ? { fence: cell.fence, checkpoint: { schema: 'neomorphic.foundry.checkpoint.v1', artifact: ref('checkpoint'), summary: 'Synthetic checkpoint', nextStep: 'Submit pinned regression data' } }
      : { fence: cell.fence, contribution: { schema: 'neomorphic.foundry.contribution.v1', gapId: gap.id, gapRevision: gap.contentId, sourceRevision: hash('source'), artifact: ref('source'), rights: 'Synthetic fixture', testProposal: 'Data only', limitations: 'Owner QA only', operatorScope: 'one regression', checkpointRevision: cell.checkpoint.revision } };
    const a = session(host.baseUrl, p, writer.token, port, async () => gap.contentId);
    const intent = a.prepare({ mode: 'maintain-cell', operation: op, cellId: cell?.id ?? null, termsVersion: gap.contentId, consent: true, body: command(op, cell?.revision ?? 0, fields) });
    drop = true; assert.equal((await a.execute(intent)).status, 'unknown-outcome');
    const b = session(host.baseUrl, p, writer.token, port, async () => gap.contentId);
    const replayed = await b.reconcile(JSON.parse(JSON.stringify(intent))); assert.equal(replayed.status, 'committed'); assert.equal(replayed.receipt.replayed, true);
    cell = (await b.resume(continuationHint(replayed.receipt.receipt.cell.id))).current.cell;
  }
  const receipts = await request(host.baseUrl, `/v1/projects/${p.projectId}/work-cells/${cell.id}/receipts?limit=25`, { token: writer.token });
  assert.equal(receipts.status, 200); assert.equal(receipts.body.receipts.length, 4); assert.equal(cell.revision, 4);
  assert.ok(!JSON.stringify(urls).includes(SENTINEL));
});
