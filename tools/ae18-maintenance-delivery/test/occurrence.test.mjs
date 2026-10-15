import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHarness, save, exec } from '../bin/harness.mjs';
import { prepareInputs, createReadOnlyCheck, assertRouteScopes } from '../src/index.mjs';

async function mounted(t, options) { const h = await createHarness(options); t.after(() => h.close()); await h.start(); return h; }
function assessed(reply) {
  assert.equal(reply.status, 200); assert.equal(reply.body.status, 'completed', JSON.stringify(reply.body.error));
  assert.equal(reply.body.payment.state, 'not_required');
  assert.deepEqual(reply.body.output.effects, { paymentAttempts: 0, captures: 0, obligations: 0, paidTaskIncrement: 0, repairExecutions: 0 });
  return reply.body;
}
test('changed mounted source -> real recipe/template -> explicit reviewer -> durable new-process handback', async t => {
  const h = await mounted(t);
  const priorBytes = readFileSync(h.priorPath);
  assert.notDeepEqual(h.before, h.after);
  const a = assessed(await h.execute('assess', h.assessInput));
  const out = a.output;
  assert.equal(out.disposition, 'bounded_assessment'); assert.equal(out.acceptance, 'approval_pending');
  assert.equal(out.assessment.template.detected, 'changed'); assert.equal(out.assessment.template.acceptance, 'approval_pending');
  assert.equal(out.assessment.recipe.recipeId, 'source-change-alert'); assert.equal(out.assessment.merchant.verdict, 'changed');
  assert.equal(out.assessment.merchant.report.claims.complete, true); assert.equal(out.assessment.reuse.publicSafeCertified, false);
  assert.equal(out.assessment.reuse.observation.execute, false); assert.equal(out.assessment.repairOutput, 'not_supplied_by_E02');
  const b = assessed(await h.execute('review', h.reviewInput(a), 'reviewer'));
  assert.equal(b.output.acceptance, 'accepted'); assert.equal(b.output.assessment.assessmentDigest, a.output.digest);
  const gets = h.sourceGets;
  await h.stop(); await h.start();
  const back = await h.api(`/v1/receipts/${b.id}`, null, 'reviewer');
  assert.deepEqual(back.body, b);
  assert.equal(h.sourceGets, gets);
  assert.deepEqual(readFileSync(h.priorPath), priorBytes);
});
test('unchanged is not-yet-due and cannot acquire acceptance', async t => {
  const h = await mounted(t, { disposition: 'unchanged' });
  const a = assessed(await h.execute('assess', h.assessInput));
  assert.equal(a.output.disposition, 'not_yet_due'); assert.equal(a.output.useful, false);
  const b = assessed(await h.execute('review', h.reviewInput(a), 'reviewer')); assert.equal(b.output.acceptance, 'not_applicable');
});
test('stale prior executes recipe stale path without source fetch', async t => {
  const h = await mounted(t, { priorPatch: { createdAt: '2026-01-01T00:00:00.000Z' } }); const gets = h.sourceGets;
  const a = assessed(await h.execute('assess', h.assessInput)); assert.equal(a.output.disposition, 'stale_baseline');
  assert.equal(a.output.assessment.recipe.outcome, 'stale_baseline'); assert.equal(h.sourceGets, gets);
});
test('partial fields retain coverage and cannot masquerade as complete useful delivery', async t => {
  const h = await mounted(t, { fields: { title: 'extract-contract-v2' } });
  const a = assessed(await h.execute('assess', h.assessInput)); assert.equal(a.output.disposition, 'partial_fields');
  assert.deepEqual(a.output.assessment.missing, ['description']); assert.equal(a.output.assessment.merchant.report.claims.complete, false);
  assert.equal(a.output.assessment.reuse.incomplete, true); assert.equal(a.output.useful, false);
});
test('insufficient reuse rights produce useful no-fit', async t => {
  const h = await mounted(t, { rightsPatch: { reuseAllowed: false } });
  const a = assessed(await h.execute('assess', h.assessInput)); assert.equal(a.output.disposition, 'useful_no_fit');
  assert.ok(a.output.assessment.reasons.includes('retained_reuse_not_entitled')); assert.equal(a.output.useful, true);
});
test('authorized reviewer can reject bounded assessment', async t => {
  const h = await mounted(t); const a = assessed(await h.execute('assess', h.assessInput));
  const b = assessed(await h.execute('review', { ...h.reviewInput(a), decision: 'reject' }, 'reviewer'));
  assert.equal(b.output.acceptance, 'rejected'); assert.equal(b.output.review.acceptanceWinner, false);
});
test('expiry wins over late approval', async t => {
  const h = await mounted(t, { expiry: new Date(Date.now() - 1000).toISOString() });
  const a = assessed(await h.execute('assess', h.assessInput)); const b = assessed(await h.execute('review', h.reviewInput(a), 'reviewer'));
  assert.equal(b.output.acceptance, 'expiry_winner'); assert.equal(b.output.review.expiryWinner, true);
});
test('revoked mandate after observation defeats approval under current rights', async t => {
  const h = await mounted(t); const a = assessed(await h.execute('assess', h.assessInput));
  save(h.rightsPath, { ...h.rights, revision: 'rights-revoked', mandateState: 'revoked' });
  const b = assessed(await h.execute('review', h.reviewInput(a), 'reviewer'));
  assert.equal(b.output.acceptance, 'authority_refused'); assert.ok(b.output.review.reasons.includes('revoked_mandate'));
});
test('ambiguous prior payment is reconciliation work and causes no replay', async t => {
  const h = await mounted(t, { priorPatch: { payment: { attempted: true, receiptId: 'unknown-prior-attempt' } } });
  const a = assessed(await h.execute('assess', h.assessInput)); assert.equal(a.output.disposition, 'reconciliation_required');
  assert.equal(a.output.assessment.priorSpend, 'outcome_unknown'); assert.equal(a.output.assessment.recipe.payment.attempted, false);
  assert.match(a.output.assessment.nextAction, /never retry/);
});
test('foreign task, digest, source and reviewer never become accepted handback', async t => {
  for (const patch of [{ taskId: 'foreign-task' }, { assessmentDigest: '0'.repeat(64) }, { sourceDigest: '0'.repeat(64) }, { reviewer: 'foreign-reviewer' }]) {
    const h = await mounted(t); const a = assessed(await h.execute('assess', h.assessInput));
    const reply = await h.execute('review', { ...h.reviewInput(a), ...patch }, 'reviewer');
    assert.equal(reply.body.status, 'failed'); assert.equal(reply.body.output, null);
  }
});
test('retry and new idempotency key after restart read same effect without another source observation', async t => {
  const h = await mounted(t); const input = h.assessInput;
  const quote = await h.api('/v1/quote', { routeId: `${h.routePrefix}.assess`, input });
  const body = { quoteId: quote.body.quoteId, input, maxUnits: 0 }, key = 'ae18-stable-key-00000001';
  const a = assessed(await h.api('/v1/execute', body, 'owner', key)); const gets = h.sourceGets;
  await h.stop(); await h.start();
  const replay = await h.api('/v1/execute', body, 'owner', key); assert.equal(replay.replay, 'true'); assert.deepEqual(replay.body, a);
  const newKey = assessed(await h.execute('assess', input)); assert.deepEqual(newKey.output, a.output); assert.equal(h.sourceGets, gets);
});
test('one finite review cannot flip acceptance with another key', async t => {
  const h = await mounted(t); const a = assessed(await h.execute('assess', h.assessInput));
  const review = h.reviewInput(a); const b = assessed(await h.execute('review', review, 'reviewer'));
  await h.stop(); await h.start();
  const same = assessed(await h.execute('review', review, 'reviewer')); assert.deepEqual(same.output, b.output);
  const flip = await h.execute('review', { ...review, decision: 'reject' }, 'reviewer'); assert.equal(flip.body.status, 'failed');
});
test('owner cannot self-review and reviewer cannot observe; foreign mount scopes are refused', async t => {
  const h = await mounted(t); const a = assessed(await h.execute('assess', h.assessInput));
  assert.equal((await h.execute('review', h.reviewInput(a))).status, 403);
  assert.equal((await h.execute('assess', h.assessInput, 'reviewer')).status, 403);
  const ops = { routePrefix: h.routePrefix };
  assert.throws(() => assertRouteScopes([{ id: 'intruder', routes: [`${h.routePrefix}.review`] }], ops, 'owner', 'reviewer'));
});
test('source drift and tampered immutable prior fail without fabricating output', async t => {
  for (const kind of ['source', 'prior']) {
    const h = await mounted(t);
    if (kind === 'source') save(h.sourcePath, { fields: { title: 'unexpected-version' } });
    else save(h.priorPath, { ...h.prior, payload: { fields: { title: 'tampered' } } });
    const reply = await h.execute('assess', h.assessInput); assert.equal(reply.body.status, 'failed'); assert.equal(reply.body.output, null);
  }
});
test('read-only callable check reports due with no durable operation or scheduler', async t => {
  const h = await mounted(t);
  const inputs = await prepareInputs(h.config.inputs);
  const check = createReadOnlyCheck({ inputs, ...h.config.maintenance });
  const result = await check(); assert.equal(result.due, true); assert.equal(result.execute, false); assert.equal(result.schedulesCreated, 0);
  // No gateway receipt was admitted by the check: first actual operation still observes.
  const gets = h.sourceGets; assessed(await h.execute('assess', h.assessInput)); assert.equal(h.sourceGets, gets + 1);
});
test('reviewer may accept a useful rights no-fit without reusing or reading restricted content', async t => {
  const h = await mounted(t, { rightsPatch: { reuseAllowed: false } }); const gets = h.sourceGets;
  const a = assessed(await h.execute('assess', h.assessInput));
  assert.equal(h.sourceGets, gets); assert.equal(a.output.assessment.sourceRequests, 0);
  const b = assessed(await h.execute('review', h.reviewInput(a), 'reviewer')); assert.equal(b.output.acceptance, 'accepted');
  assert.equal(b.output.disposition, 'useful_no_fit');
});
test('revoked read rights and revoked mandate yield useful no-fit before fetching source', async t => {
  for (const patch of [{ readAllowed: false }, { mandateState: 'revoked' }]) {
    const h = await mounted(t, { rightsPatch: patch }); const gets = h.sourceGets;
    const a = assessed(await h.execute('assess', h.assessInput)); assert.equal(a.output.disposition, 'useful_no_fit');
    assert.equal(h.sourceGets, gets);
  }
});
test('lost operation response and interrupted owner remain recoverable and never repeat observation', async t => {
  const h = await mounted(t); const input = h.assessInput;
  const quote = await h.api('/v1/quote', { routeId: `${h.routePrefix}.assess`, input });
  const body = { quoteId: quote.body.quoteId, input, maxUnits: 0 }, key = 'ae18-interrupted-operation';
  const dispatched = h.holdNextSource();
  const lost = h.api('/v1/execute', body, 'owner', key).catch(() => null);
  await dispatched; await h.crashOwnRuntime(); await lost;
  const gets = h.sourceGets; await h.start();
  const replay = await h.api('/v1/execute', body, 'owner', key);
  assert.ok(['running', 'uncertain'].includes(replay.body.status)); assert.equal(replay.body.output, null);
  const replacement = await h.execute('assess', input);
  assert.equal(replacement.status, 429); assert.equal(replacement.body.error.code, 'concurrency_limit');
  await new Promise(resolve => setTimeout(resolve, Math.max(1, replay.body.deadlineAt - Date.now() + 30)));
  const expired = await h.api('/v1/execute', body, 'owner', key);
  assert.equal(expired.body.status, 'uncertain'); assert.equal(expired.body.output, null);
  const afterExpiry = await h.execute('assess', input);
  assert.equal(afterExpiry.body.status, 'failed'); assert.equal(afterExpiry.body.output, null);
  assert.equal(h.sourceGets, gets); assert.equal(replay.body.payment.state, 'not_required');
});
test('request and rights descriptors are bound to owner, prior identity and supplied version', async t => {
  for (const kind of ['descriptor', 'rights', 'prior']) {
    const h = await mounted(t);
    if (kind === 'descriptor') save(h.descriptorPath, { ...h.descriptor, taskId: 'foreign-task' });
    if (kind === 'rights') save(h.rightsPath, { ...h.rights, taskId: 'foreign-task' });
    if (kind === 'prior') save(h.priorPath, { ...h.prior, taskId: 'foreign-task' });
    const reply = await h.execute('assess', h.assessInput); assert.equal(reply.body.status, 'failed'); assert.equal(reply.body.output, null);
  }
});
test('mounted source snapshot runs through the unmodified template HTTP and CLI contracts', async t => {
  const h = await mounted(t); const a = assessed(await h.execute('assess', h.assessInput));
  const request = { ...a.output.assessment.templateRequest, priorPath: h.priorPath, currentFixturePath: h.sourcePath };
  const requestPath = join(h.dir, 'e11-request.json'); save(requestPath, request);
  const cli = await exec(process.execPath, [join(h.config.inputs.sdsRoot, 'tools/ae14-compat-maintenance/cli.mjs'), 'run', '--request', requestPath]);
  const original = JSON.parse(cli.stdout); assert.equal(original.digest, a.output.assessment.template.digest);
  const { listenLocal } = await import(new URL(`file://${h.config.inputs.sdsRoot}/tools/ae14-compat-maintenance/src/http.mjs`));
  const server = await listenLocal(); t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/occurrence`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  const http = await response.json(); assert.equal(http.digest, original.digest); assert.equal(http.detected, 'changed');
  assert.equal(http.acceptance, 'approval_pending'); assert.equal(http.paidTaskIncrement, 0);
});
