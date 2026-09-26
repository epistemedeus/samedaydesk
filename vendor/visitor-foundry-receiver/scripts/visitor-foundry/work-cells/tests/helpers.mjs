import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const require = createRequire(new URL('../../../../services/correspondence/package.json', import.meta.url));
export const pg = require('pg');
export const root = fileURLToPath(new URL('../../../../', import.meta.url));
export const databaseUrl = process.env.VF02_TEST_DATABASE_URL;
export const schema = process.env.VF02_TEST_SCHEMA;
export const ADMIN = 'vf02-disposable-test-admin-not-production';
export const digest = `sha256:${'a'.repeat(64)}`;
export const ref = { uri: 'https://fixtures.invalid/synthetic', digest };
export const gap = { schema: 'neomorphic.foundry.work-cell-gap.v1', id: 'vf01:synthetic-gap', contentId: digest,
  resolverSnapshot: ref, reproducer: ref, permission: 'synthetic', fundingKind: 'unfunded-request' };
export const checkpoint = { schema: 'neomorphic.foundry.checkpoint.v1', artifact: ref,
  summary: 'synthetic failure isolated', nextStep: 'resume the bounded regression proposal' };
export const command = (action, expectedRevision, fields = {}) => ({ schema: 'neomorphic.foundry.work-cell-command.v1', action, expectedRevision, ...fields });
export const contribution = (cell) => ({ schema: 'neomorphic.foundry.contribution.v1', gapId: cell.gap.id,
  gapRevision: cell.gap.contentId, sourceRevision: digest, artifact: ref, rights: 'CC0 synthetic fixture',
  testProposal: 'Data only: independently reproduce the synthetic regression.', limitations: 'Owner-controlled fixture, no external useful reuse measured.',
  operatorScope: 'one synthetic regression', checkpointRevision: cell.checkpoint.revision });

export async function request(base, path, { token = ADMIN, body, key = randomUUID(), method = body ? 'POST' : 'GET', timeout = 10000 } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`,
    ...(body ? { 'content-type': 'application/json', 'idempotency-key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout) });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, body: payload, retryAfter: response.headers.get('retry-after') };
}
export async function boot({ receipts = false } = {}) {
  assert.ok(databaseUrl && schema?.startsWith('vf02_'), 'requires explicitly disposable VF02 env');
  const child = fork(new URL('./fixture-host.mjs', import.meta.url), [], {
    env: { ...process.env, VF02_FIXTURE_RECEIPTS: receipts ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data.toString(); });
  child.stdout.resume();
  const exited = once(child, 'exit');
  let deadline;
  const ready = await Promise.race([
    once(child, 'message').then(([m]) => m),
    exited.then(([code]) => { throw new Error(`fixture host exited ${code}: ${stderr}`); }),
    new Promise((_, reject) => { deadline = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('host startup exceeded 15s')); }, 15000); }),
  ]).finally(() => clearTimeout(deadline));
  return { ...ready, child, async stop(signal = 'SIGTERM') {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill(signal);
    const force = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exited.finally(() => clearTimeout(force));
  } };
}
export async function project(base) {
  const r = await request(base, '/v1/projects', { body: { title: 'VF02 disposable project', summary: 'Owner-controlled nonfinancial work-cell fixture' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { projectId: r.body.project.id, owner: r.body.ownerToken };
}
export async function grant(base, p, role = 'writer', expiresAt) {
  const r = await request(base, `/v1/projects/${p.projectId}/grants`, { token: p.owner, body: { role, ...(expiresAt ? { expiresAt } : {}) } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
export const path = (p, cellId = '') => `/v1/projects/${p.projectId}/work-cells${cellId ? `/${cellId}` : ''}`;
export async function create(base, p, workScope = `scope:${randomUUID()}`, key = randomUUID(), gapPatch = {}) {
  return request(base, path(p), { token: p.owner, key, body: command('create', 0, { gap: { ...gap, ...gapPatch }, workScope }) });
}
export async function mutate(base, p, cell, token, action, fields = {}, key = randomUUID()) {
  return request(base, `${path(p, cell.id)}/commands`, { token, key, body: command(action, cell.revision, fields) });
}
export const state = (r) => { assert.ok([200, 201].includes(r.status), JSON.stringify(r)); return r.body.receipt.cell; };
export const code = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r)); assert.equal(r.body.error.code, code); assert.ok(r.body.error.nextStep); };

export async function submitted(base, p, writer) {
  let cell = state(await create(base, p));
  cell = state(await mutate(base, p, cell, writer.token, 'claim', { ttlSeconds: 60, voluntaryOptIn: true }));
  cell = state(await mutate(base, p, cell, writer.token, 'checkpoint', { fence: cell.fence, checkpoint }));
  return state(await mutate(base, p, cell, writer.token, 'submit', { fence: cell.fence, contribution: contribution(cell) }));
}
