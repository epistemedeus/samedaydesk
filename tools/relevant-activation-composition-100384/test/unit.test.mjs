import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { compose } from '../src/composition.mjs';
import { relevance, validateTask } from '../src/input.mjs';
import { scopeFor } from '../src/budget.mjs';
import { bin, directReadiness, envFor, example, refused, run, scratch, sdsHost, successful } from './helpers.mjs';

for (const [name, category] of [['existing-business', 'existing_business_setup'], ['technical', 'technical_integration'], ['ambiguous', 'unknown_prerequisite']]) {
  test(`stripped caller ${name}: actual SDS task and equal-input direct route`, async (t) => {
    const sds = await sdsHost(t), dir = scratch(t), input = example(name);
    const env = envFor(input.task, sds.base, dir);
    const output = successful(await run(['plan'], { env, input }));
    assert.equal(output.category, category);
    assert.equal(output.service, null);
    assert.deepEqual(output.work.result, await directReadiness(sds.base, input.task.readiness));
    assert.equal(output.work.result.checkerSafety.paymentSent, false);
    assert.deepEqual(output.work.result.repair.applied.map((a) => a.requiredPath), ['data.status']);
    const repaired = await directReadiness(sds.base, output.work.nextAction.body);
    assert.deepEqual(repaired.observation.findings, []);
    assert.equal(repaired.observation.checkerOk, true);
    assert.equal(repaired.observation.readinessClaimed, false);
    if (name === 'ambiguous') assert.deepEqual(output.nextAction.requiredInputs, ['facts.providerRequiresUsEntity']);
    else assert.equal(output.nextAction.kind, 'continue_readiness');
    assert.equal(output.taskCompleted, false);
    assert.equal(output.revenue, false);
  });
}

test('model, goal keywords, foreign sources and caller done cannot qualify', async (t) => {
  const input = example('qualifying'), dir = scratch(t);
  const env = envFor(input.task, 'http://127.0.0.1:1', dir);
  const model = structuredClone(input);
  model.task.goal.authority.kind = 'model';
  refused(await run(['plan'], { env, input: model }), 'authority_refused');
  const foreign = structuredClone(input);
  foreign.task.facts.providerRequiresUsEntity.authority.taskId = 'other-task-384';
  refused(await run(['plan'], { env, input: foreign }), 'fact_scope_mismatch');
  const hallucinated = structuredClone(input);
  hallucinated.task.facts.hasUsEntity.value = 'yes';
  // Authority labels still look valid: the independently held receiving record rejects the invented fact.
  refused(await run(['plan'], { env, input: hallucinated }), 'source_record_mismatch');
  refused(await run(['plan'], { env: { ...env, SDS_ACTIVATION_SOURCE_RECORDS_FILE: '' }, input }), 'source_records_required');
  refused(await run(['plan'], { env, input: { ...input, done: true } }), 'invalid_input');
  const keywords = example('technical');
  validateTask(keywords.task, envFor(keywords.task, env.SDS_ACTIVATION_BASE_URL, dir));
  assert.equal(relevance(keywords.task).qualified, false);
  const req = structuredClone(keywords.task);
  req.facts.providerRequiresUsEntity.value = 'yes';
  assert.equal(relevance(req).qualified, false);
});

test('existing entity without EIN and EIN-only path have useful no-purchase outcomes', async (t) => {
  const sds = await sdsHost(t), dir = scratch(t);
  for (const [name, edit, reason] of [
    ['existing-business', (task) => { task.facts.hasEin.value = 'no'; }, 'existing_entity_no_second_llc'],
    ['ambiguous', (task) => { task.facts.providerRequiresUsEntity.value = 'no'; }, 'ein_only_no_llc_service'],
  ]) {
    const input = example(name); edit(input.task);
    const env = envFor(input.task, sds.base, dir);
    const output = successful(await run(['plan'], { env, input }));
    assert.equal(output.qualification.reason, reason);
    assert.equal(output.service, null);
    assert.equal(output.documentationAction.kind, 'existing_documentation');
    assert.ok(output.work.nextAction.body);
  }
});

test('changed goal, wrong recipient/task/caller and cancellation are local refusals', async (t) => {
  const sds = await sdsHost(t), dir = scratch(t), input = example('existing-business');
  const env = envFor(input.task, sds.base, dir);
  const output = successful(await run(['plan'], { env, input }));
  const continued = { ...input, checkpoint: output.checkpoint };
  const changed = structuredClone(continued); changed.task.goal.value = 'Different operator goal';
  refused(await run(['plan'], { env, input: changed }), 'source_record_mismatch');
  refused(await run(['plan'], { env: { ...env, SDS_ACTIVATION_RECIPIENT_ID: 'other-operator-384' }, input: continued }), 'recipient_mismatch');
  refused(await run(['plan'], { env: { ...env, EIN_CONTINUATION_TASK_ID: 'other-task-384' }, input: continued }), 'task_mismatch');
  refused(await run(['plan'], { env: { ...env, EIN_CONTINUATION_CUSTOMER_KEY: 'different-caller-sol384' }, input: continued }), 'caller_mismatch');
  const before = sds.hits.length;
  const cancelled = successful(await run(['cancel'], { env, input: continued }));
  assert.equal(cancelled.serverCaseCancelled, false);
  assert.equal(sds.hits.length, before);
  refused(await run(['plan'], { env, input: { ...input, checkpoint: cancelled.checkpoint } }), 'cancelled');
  refused(await run(['return'], { env, input: continued }), 'qualification_required');
});

test('stdin, all SDS setup reads and response bodies share one total budget', async (t) => {
  const sds = await sdsHost(t), dir = scratch(t), input = example('technical');
  const env = envFor(input.task, sds.base, dir, { SDS_ACTIVATION_DEADLINE_MS: '160' });
  let calls = 0;
  const delayed = async (url, init) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    init.signal.throwIfAborted();
    return fetch(url, init);
  };
  const began = performance.now();
  await assert.rejects(compose('plan', input, { env, fetch: delayed }), (error) => ['timeout', 'deadline_exceeded'].includes(error.code));
  assert.ok(performance.now() - began < 800);
  assert.equal(calls, 2);
  assert.equal(sds.hits.some((hit) => hit.method === 'POST'), false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(compose('plan', input, { env, signal: controller.signal }), (error) => error.code === 'cancelled');
  const runningController = new AbortController();
  const pending = compose('plan', input, { env, fetch: delayed, signal: runningController.signal });
  setTimeout(() => runningController.abort(), 30);
  await assert.rejects(pending, (error) => error.code === 'cancelled');
  const stdin = new PassThrough();
  await assert.rejects(scopeFor(env, { stdin }).run(() => new Promise(() => {})), (error) => error.code === 'timeout');
  assert.equal(stdin.destroyed, true);
  const child = spawn(process.execPath, [bin, 'plan'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('owned stdin child did not exit')); }, 2000);
    child.on('close', (code) => { clearTimeout(timer); resolve(code); });
  });
  child.stdin.destroy();
  assert.equal(code, 2);
  assert.equal(JSON.parse(output).error.code, 'timeout');
});

test('raw response allowance is cumulative across SDS setup and actual checker reply', async (t) => {
  const sds = await sdsHost(t), dir = scratch(t), input = example('technical');
  const first = await (await fetch(sds.base + '/discovery/task-readiness.json')).text();
  const second = await (await fetch(sds.base + '/api/public-readiness/healthz')).text();
  const max = Math.max(Buffer.byteLength(first), Buffer.byteLength(second)) + 20;
  const env = envFor(input.task, sds.base, dir, { SDS_ACTIVATION_MAX_RESPONSE_BYTES: String(max) });
  await assert.rejects(compose('plan', input, { env }), (error) => error.code === 'body_limit');
  assert.equal(sds.hits.some((hit) => hit.method === 'POST'), false);
});
