import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, example, request } from './support.mjs';

test('canonical checkpoint correction invalidates retrieval, export and later reuse', { timeout: 25000 }, async t => {
  const f = await fixture(); t.after(() => f.close());
  const input = await example('page-watch'); input.taskId = 'receiving-corrected-prior';
  const admitted = await request(f.origin, f.a, '', { method: 'POST', body: input, key: 'receiving-correction-original' });
  const id = admitted.json.jobId;
  const done = await request(f.origin, f.a, `/${id}/run`, { method: 'POST', body: { taskId: input.taskId } });
  assert.equal(done.status, 200);
  const digest = done.json.resultDigest;
  const later = structuredClone(input); later.taskId = 'receiving-dependent-task';
  delete later.input.prior;
  later.input.priorResult = { jobId: id, taskId: input.taskId, digest };
  const queued = await request(f.origin, f.a, '', { method: 'POST', body: later, key: 'receiving-queued-before-correction' });
  assert.equal(queued.status, 201);
  const dependent = structuredClone(later); dependent.taskId = 'receiving-completed-dependent';
  const dep = await request(f.origin, f.a, '', { method: 'POST', body: dependent, key: 'receiving-completed-before-correction' });
  const depDone = await request(f.origin, f.a, `/${dep.json.jobId}/run`, { method: 'POST', body: { taskId: dependent.taskId } });
  assert.equal(depDone.status, 200);
  const command = { schema: 'neomorphic.foundry.work-cell-command.v1' };
  const claim = await f.cells.mutate(f.a, id, { ...command, action: 'claim', expectedRevision: done.json.revision, voluntaryOptIn: true, ttlSeconds: 30 }, 'receiving-correction-claim');
  const corrected = await f.cells.mutate(f.a, id, { ...command, action: 'checkpoint', expectedRevision: claim.receipt.revision, fence: claim.receipt.cell.fence,
    checkpoint: { schema: 'neomorphic.foundry.checkpoint.v1', artifact: { uri: 'https://samedaydesk.invalid/qa/corrected', digest: `sha256:${'1'.repeat(64)}` }, summary: 'Owner corrected the authoritative artifact.', nextStep: 'Refuse reuse of the superseded result.' } }, 'receiving-correction-checkpoint');
  await f.cells.mutate(f.a, id, { ...command, action: 'release', expectedRevision: corrected.receipt.revision, fence: corrected.receipt.cell.fence }, 'receiving-correction-release');
  assert.equal((await request(f.origin, f.a, `/${id}/result?taskId=${input.taskId}`)).status, 409);
  assert.equal((await request(f.origin, f.a, `/${id}/export`, { method: 'POST', body: { taskId: input.taskId, optIn: true, purpose: 'later-task-reuse', resultDigest: digest } })).status, 409);
  const reused = await request(f.origin, f.a, '', { method: 'POST', body: later, key: 'receiving-after-correction' });
  assert.equal(reused.status, 409, JSON.stringify(reused.json));
  const run = await request(f.origin, f.a, `/${queued.json.jobId}/run`, { method: 'POST', body: { taskId: later.taskId } });
  assert.equal(run.status, 409, JSON.stringify(run.json));
  const state = await request(f.origin, f.a, `/${queued.json.jobId}?taskId=${later.taskId}`);
  assert.equal(state.json.fence, 0, 'superseded prior cannot start a child');
  assert.equal((await request(f.origin, f.a, `/${dep.json.jobId}/result?taskId=${dependent.taskId}`)).status, 409);
  assert.equal((await request(f.origin, f.a, `/${dep.json.jobId}/export`, { method: 'POST', body: { taskId: dependent.taskId, optIn: true, purpose: 'later-task-reuse', resultDigest: depDone.json.resultDigest } })).status, 409);
  later.input.priorResult = { jobId: dep.json.jobId, taskId: dependent.taskId, digest: depDone.json.resultDigest };
  assert.equal((await request(f.origin, f.a, '', { method: 'POST', body: later, key: 'receiving-indirect-corrected-prior' })).status, 409);
  // The owning authority may cancel a retained cell, independently of the
  // convenience route's completed-job refusal. The receipt stays in PG.
  const revokedInput = await example('page-watch'); revokedInput.taskId = 'receiving-authority-revoked';
  const revoked = await request(f.origin, f.a, '', { method: 'POST', body: revokedInput, key: 'receiving-revoked-original' });
  const revokedDone = await request(f.origin, f.a, `/${revoked.json.jobId}/run`, { method: 'POST', body: { taskId: revokedInput.taskId } });
  await f.cells.mutate(f.a, revoked.json.jobId, { ...command, action: 'cancel', expectedRevision: revokedDone.json.revision, reason: 'Owner revoked this retained artifact.' }, 'receiving-authority-revocation');
  assert.equal((await request(f.origin, f.a, `/${revoked.json.jobId}/result?taskId=${revokedInput.taskId}`)).status, 410);
  later.input.priorResult = { jobId: revoked.json.jobId, taskId: revokedInput.taskId, digest: revokedDone.json.resultDigest };
  assert.equal((await request(f.origin, f.a, '', { method: 'POST', body: later, key: 'receiving-revoked-prior' })).status, 409);
  assert.equal((await f.sql.query('SELECT count(*)::int AS n FROM correspondence_idempotency WHERE scope=$1 AND project_id=$2 AND key=$3', ['sds:useful:result:v1', f.a.projectId, revoked.json.jobId])).rows[0].n, 1);
});

test('actual admitted deadline expires without replenishing execution or starting a child', { timeout: 15000 }, async t => {
  const f = await fixture(); t.after(() => f.close());
  const input = await example('page-watch'); input.taskId = 'receiving-expired-task'; input.limits = { deadlineMs: 4000 };
  const admitted = await request(f.origin, f.a, '', { method: 'POST', body: input, key: 'receiving-expired-operation' });
  assert.equal(admitted.status, 201);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(admitted.json.deadlineAt) - Date.now()) + 40));
  const run = await request(f.origin, f.a, `/${admitted.json.jobId}/run`, { method: 'POST', body: { taskId: input.taskId } });
  assert.equal(run.status, 410); assert.equal(run.json.error.code, 'job_expired');
  const status = await request(f.origin, f.a, `/${admitted.json.jobId}?taskId=${input.taskId}`);
  assert.equal(status.json.state, 'expired'); assert.equal(status.json.fence, 0);
  assert.equal((await request(f.origin, f.a, `/${admitted.json.jobId}/result?taskId=${input.taskId}`)).status, 409);
});
