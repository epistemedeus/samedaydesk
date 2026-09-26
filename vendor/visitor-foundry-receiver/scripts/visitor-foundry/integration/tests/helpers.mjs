import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { hash } from '../../capabilities/src/index.mjs';
import { identity, wireSchema } from '../src/wire.mjs';
import { capabilityFor, ENV } from '../src/recipe.mjs';
export const frozen = JSON.parse(readFileSync(new URL('../fixtures/frozen-owner-qa.json', import.meta.url)));
export const recipe = { kind: 'preflight-engine-v1', maxRangeLength: 128 };
export const digest = hash;
export const requestFor = (input = frozen.originalTask.input, taskId = frozen.originalTask.taskId, overrides = {}) => ({ schema: 'neomorphic.foundry.capability-request.v1', taskId,
  outcome: 'node-engine-compatibility', input, environment: ENV, output: null, capabilityId: null, ...overrides });
export const path = p => `/v1/projects/${p.projectId}/foundry`;
export async function request(host, path, { token = 'vf04-owner-qa-bootstrap', body, key = randomUUID(), method = body ? 'POST' : 'GET', timeout = 10000 } = {}) {
  const r = await fetch(`${host.baseUrl}${path}`, { method, redirect: 'error', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout) });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; } return { status: r.status, body: data };
}
export function ok(r) { assert.ok([200,201].includes(r.status), JSON.stringify(r)); return r.body; }
export function code(r, expected) { assert.equal(r.body.error?.code, expected, JSON.stringify(r)); }
export async function boot() {
  const child = fork(new URL('./fixture-host.mjs', import.meta.url), [], { stdio: ['ignore','ignore','pipe','ipc'] });
  let stderr = ''; child.stderr.on('data', b => { stderr += b.toString(); });
  const exit = once(child, 'exit');
  let timer;
  const ready = await Promise.race([once(child, 'message').then(([m]) => m), exit.then(([c]) => { throw new Error(`host exit ${c}: ${stderr}`); }),
    new Promise((_,reject) => { timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('host boot timeout')); },15000); })]).finally(() => clearTimeout(timer));
  const pending = new Map();
  child.on('message', m => { if (m.id && pending.has(m.id)) { const { resolve, reject, timer } = pending.get(m.id); clearTimeout(timer); pending.delete(m.id); m.error ? reject(new Error(m.error)) : resolve(m.result); } });
  child.on('exit', () => { for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('host exited before acknowledgement')); } pending.clear(); });
  return { ...ready, child, rpc(op, ...args) { return new Promise((resolve,reject) => {
    const id = randomUUID(); const timer = setTimeout(() => { pending.delete(id); reject(new Error('RPC timeout')); },10000);
    pending.set(id,{resolve,reject,timer}); child.send({id,op,args}); }); },
    async stop(signal='SIGTERM') { if (child.exitCode!==null || child.signalCode!==null) return; child.kill(signal); await exit; } };
}
export async function project(host, options = {}) {
  const created = ok(await request(host, '/v1/projects', { body: { title: 'VF04 owner QA', summary: 'Disposable voluntary foundry test' } }));
  const p = { projectId: created.project.id, owner: created.ownerToken };
  p.writer = ok(await request(host, `/v1/projects/${p.projectId}/grants`, { token: p.owner, body: { role: 'writer' } }));
  p.beneficiary = ok(await request(host, `/v1/projects/${p.projectId}/grants`, { token: p.owner, body: { role: 'writer' } }));
  p.reader = ok(await request(host, `/v1/projects/${p.projectId}/grants`, { token: p.owner, body: { role: 'reader' } }));
  await host.rpc('enroll', p.projectId, frozen, options);
  p.cellGap = ok(await request(host, `${path(p)}/gap`, { token: p.writer.token, body: requestFor() })).cellGap;
  return p;
}
export const cmd = (action, expectedRevision, fields = {}) => ({ schema: 'neomorphic.foundry.work-cell-command.v1', action, expectedRevision, ...fields });
export const cellPath = (p, cell) => `/v1/projects/${p.projectId}/work-cells${cell ? `/${cell.id}/commands` : ''}`;
export async function cellCommand(host, p, cell, action, fields = {}, token = p.writer.token) {
  return ok(await request(host, cellPath(p, cell), { token, body: cmd(action, cell?.revision ?? 0, fields) })).receipt.cell;
}
export async function checkpointed(host, p, artifact = recipe, scope = randomUUID()) {
  const cellGap = p.cellGap ?? ok(await request(host, `${path(p)}/gap`, { token: p.writer.token, body: requestFor() })).cellGap;
  let cell = await cellCommand(host, p, null, 'create', { gap: cellGap, workScope: `scope:${scope}` });
  cell = await cellCommand(host, p, cell, 'claim', { ttlSeconds: 120, voluntaryOptIn: true });
  cell = await cellCommand(host, p, cell, 'checkpoint', { fence: cell.fence, checkpoint: { schema: 'neomorphic.foundry.checkpoint.v1',
    artifact: { uri: 'https://fixtures.invalid/owner-qa-recipe', digest: hash(artifact) }, summary: 'Owner QA bounded preflight adapter configuration', nextStep: 'Submit the immutable recipe after restart' } });
  return cell;
}
export async function submit(host, p, cell, artifact = recipe, dependencies = []) {
  const v = capabilityFor(artifact, dependencies);
  cell = await cellCommand(host, p, cell, 'submit', { fence: cell.fence, contribution: { schema: 'neomorphic.foundry.contribution.v1',
    gapId: cell.gap.id, gapRevision: cell.gap.contentId, sourceRevision: hash(v.source),
    artifact: { uri: 'https://fixtures.invalid/owner-qa-recipe', digest: hash(artifact) }, rights: 'MIT sample allowlist; owner-authorized JSON recipe',
    testProposal: 'Replay installed preflight boundary checks; this text is data only.', limitations: 'Owner QA, no independent operator.',
    operatorScope: 'installed bounded recipe', checkpointRevision: cell.checkpoint.revision } });
  return { cell, body: { schema:wireSchema('candidate-admission'), cellId: cell.id, workflowRevision: cell.revision, fence: cell.fence, artifact, identity:identity(v,dependencies) } };
}
export async function candidate(host, p, artifact = recipe, dependencies = []) {
  const submission = await submit(host,p,await checkpointed(host,p,artifact),artifact,dependencies);
  const admitted = ok(await request(host, `${path(p)}/candidates`, { token:p.writer.token, body:submission.body }));
  return {...submission,...admitted};
}
