import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pack } from '../scripts/pack.mjs';
import { assessmentInput } from '../src/input.mjs';
import { directReadiness, envFor, example, noSecrets, refused, root, run, sdsHost, successful } from './helpers.mjs';

const source = process.env.SOL384_EIN_SOURCE;
if (!source) throw new Error('SOL384_EIN_SOURCE must name the isolated exact EIN175 source');
const helpers = await import(pathToFileURL(join(source, 'tools/activation-continuation/test/helpers.mjs')));
const { session, openHost, readRecord, collectionCount, storeDump, humanClaim, writeGrant, startProxy, forward } = helpers;
const { assessFormationNeed } = await import(pathToFileURL(join(source, 'artifacts/api-server/src/lib/formation-assessment.ts')));
const einBin = join(root, 'vendor/ein-activation-continuation/bin/ein-continuation.mjs');
const ein = (command, env, input) => run([command], { env, input: input ?? '', binPath: einBin });

for (const transport of ['http', 'mcp', 'a2a', 'a2a-rest']) {
  test(`actual EIN175 and stripped callers ${transport}: scoped handoff, independently claimed status, useful return`, { timeout: 60000 }, async (t) => {
    const active = await session(t), sds = await sdsHost(t), input = example('qualifying');
    const env = envFor(input.task, sds.base, active.root, {
      EIN_ACTIVATION_BASE_URL: active.base, EIN_CONTINUATION_TRANSPORT: transport,
      ...(['a2a', 'a2a-rest'].includes(transport) ? { EIN_CONTINUATION_CATALOG_TRANSPORT: 'http' } : {}),
    });
    const planned = successful(await run(['plan'], { env, input }));
    assert.equal(planned.qualification.qualified, true);
    assert.equal(planned.category, 'confirmed_formation_goal');
    assert.equal(planned.service.catalogVersion, '2026-10-01');
    assert.equal(planned.service.offer.offerId, 'llc-ein-399');
    assert.equal(planned.nextAction.kind, 'operator_authorized_assess');
    assert.equal(collectionCount(active.store, 'formation_assessments'), 0);
    assert.equal(collectionCount(active.store, 'applications'), 0);
    assert.deepEqual(planned.work.result, await directReadiness(sds.base, input.task.readiness));
    const continued = { ...input, checkpoint: planned.checkpoint };
    // The independent operator executes the EXISTING acquired client, only on this fixture backend.
    const assessed = successful(await ein('assess', env, planned.nextAction.input));
    assert.equal(assessed.assessment.outcome, assessFormationNeed(assessmentInput(input.task)).outcome);
    assert.equal(assessed.assessment.outcome, 'required_for_selected_path');
    const prepared = successful(await ein('prepare', env));
    const repeatedPlan = successful(await run(['plan'], { env, input: continued }));
    assert.equal(repeatedPlan.nextAction.kind, 'human_claim');
    assert.equal(repeatedPlan.checkpoint.einApplicationId, prepared.applicationId);
    const handed = successful(await run(['handoff'], { env, input: continued }));
    assert.equal(handed.nextAction.kind, 'human_claim');
    assert.equal(handed.nextAction.requiredScope.applicationId, prepared.applicationId);
    assert.deepEqual(handed.nextAction.continuationScope.scopes, ['status']);
    assert.equal(handed.claimLink.source, 'original_ein_continuation');
    const later = { ...input, checkpoint: handed.checkpoint };
    refused(await run(['return'], { env, input: later }), 'missing_grant');
    const inventedStatus = structuredClone(later);
    inventedStatus.checkpoint.phase = 'operator_observed';
    refused(await run(['return'], { env, input: inventedStatus }), 'missing_grant');
    refused(await run(['return'], { env, input: { ...later, done: true } }), 'invalid_input');
    refused(await run(['handoff'], { env: { ...env, EIN_CONTINUATION_INTENDED_EMAIL: 'wrong@example.test' }, input: later }), 'recipient_mismatch');
    refused(await run(['handoff'], { env: { ...env, EIN_CONTINUATION_TASK_ID: 'other-task-384' }, input: later }), 'task_mismatch');
    const changed = structuredClone(later); changed.task.goal.value = 'A new company for a different goal';
    refused(await run(['return'], { env, input: changed }), 'source_record_mismatch');
    const sameIdNewInput = structuredClone(input); sameIdNewInput.task.goal.value = 'A new company for a different goal';
    const changedSource = join(active.root, 'changed-goal.sources.private.json');
    writeFileSync(changedSource, JSON.stringify({ schema: 'samedaydesk.caller-source-records.v1', taskId: sameIdNewInput.task.taskId, recipientId: sameIdNewInput.task.recipientId, goal: sameIdNewInput.task.goal, facts: sameIdNewInput.task.facts }), { mode: 0o600 });
    refused(await run(['plan'], { env: { ...env, SDS_ACTIVATION_SOURCE_RECORDS_FILE: changedSource }, input: sameIdNewInput }), 'ein_goal_mismatch');
    refused(await run(['return'], { env: { ...env, SDS_ACTIVATION_SOURCE_RECORDS_FILE: changedSource }, input: { ...sameIdNewInput, checkpoint: handed.checkpoint } }), 'changed_goal');
    const record = readRecord(env.EIN_CONTINUATION_FILE);
    const claim = await humanClaim(active.base, record);
    assert.equal(claim.claimStatus, 200);
    assert.equal(claim.grantStatus, 201);
    assert.deepEqual(claim.grantBody.scopes, ['status']);
    const grant = writeGrant(active.root, claim.grantBody.token);
    const granted = { ...env, EIN_AGENT_GRANT_FILE: grant, EIN_AGENT_GRANT_ORIGIN: active.base };
    const returned = successful(await run(['return'], { env: granted, input: later }));
    assert.equal(returned.nextAction.kind, 'return_to_readiness');
    assert.equal(returned.activation.applicationStatus, 'claimed');
    assert.equal(returned.activation.source, 'grant_status');
    assert.equal(returned.activation.operatorActionObserved, true);
    assert.equal(returned.activation.prerequisiteSatisfied, false);
    assert.equal(returned.activation.paid, false);
    assert.equal(returned.taskCompleted, false);
    assert.equal(returned.revenue, false);
    assert.equal(returned.service, null);
    assert.deepEqual(returned.work.result, await directReadiness(sds.base, input.task.readiness));
    const repaired = await directReadiness(sds.base, returned.nextAction.action.body);
    assert.equal(repaired.observation.checkerOk, true);
    assert.equal(repaired.observation.readinessClaimed, false);
    // A second independent case cannot use the first case's status grant.
    const other = structuredClone(input);
    other.task.taskId = 'qa-other-case-384';
    other.task.goal.authority.taskId = other.task.taskId;
    for (const fact of Object.values(other.task.facts)) fact.authority.taskId = other.task.taskId;
    const otherEnv = envFor(other.task, sds.base, active.root, { EIN_ACTIVATION_BASE_URL: active.base, EIN_CONTINUATION_TRANSPORT: transport,
      ...(['a2a', 'a2a-rest'].includes(transport) ? { EIN_CONTINUATION_CATALOG_TRANSPORT: 'http' } : {}) });
    const otherPlan = successful(await run(['plan'], { env: otherEnv, input: other }));
    successful(await ein('assess', otherEnv, otherPlan.nextAction.input));
    successful(await ein('prepare', otherEnv));
    refused(await run(['return'], { env: { ...otherEnv, EIN_AGENT_GRANT_FILE: grant, EIN_AGENT_GRANT_ORIGIN: active.base },
      input: { ...other, checkpoint: otherPlan.checkpoint } }), 'foreign_grant');
    refused(await run(['return'], { env: { ...granted, EIN_AGENT_GRANT_ORIGIN: 'https://other.example' }, input: later }), 'foreign_credential');
    noSecrets([planned, handed, returned], [env.EIN_CONTINUATION_CUSTOMER_KEY, record.intendedEmail, record.claimUrl, claim.grantBody.token]);
    assert.equal(collectionCount(active.store, 'applications'), 2);
    assert.equal(collectionCount(active.store, 'application_intakes'), 0);
    assert.equal(collectionCount(active.store, 'payment_attempts'), 0);
    const events = Object.values(storeDump(active.store).journey_events ?? {});
    assert.ok(events.some((event) => event.event === 'agent_call'));
    assert.equal(events.some((event) => event.event === 'payment_succeeded'), false);
    const revoked = await fetch(`${active.base}/api/agent/v1/applications/${record.applicationId}/grants/${claim.grantBody.grantId}`, { method: 'DELETE', headers: { authorization: 'Bearer owner' } });
    assert.equal(revoked.status, 204);
    // The local file still holds a claimed status. A fresh read must now refuse it.
    refused(await run(['return'], { env: granted, input: later }), 'grant_rejected');
    await active.stop();
  });
}

test('actual commit-before-lost-prepare reply: cold restart retains one operation and returns only after granted status', { timeout: 60000 }, async (t) => {
  const active = await session(t, { failpoint: 'after_commit' }), sds = await sdsHost(t), input = example('qualifying');
  let current = active.base;
  const proxy = await startProxy(current, ({ req, res, body }) => forward(new URL(current), req, res, body));
  t.after(() => proxy.close());
  const env = envFor(input.task, sds.base, active.root, { EIN_ACTIVATION_BASE_URL: proxy.base });
  const plan = successful(await run(['plan'], { env, input }));
  successful(await ein('assess', env, plan.nextAction.input));
  refused(await ein('prepare', env), 'prepare_uncertain');
  const before = readRecord(env.EIN_CONTINUATION_FILE);
  const handed = successful(await run(['handoff'], { env, input: { ...input, checkpoint: plan.checkpoint } }));
  assert.equal(handed.nextAction.kind, 'replay_same_bound_prepare');
  assert.equal(collectionCount(active.store, 'applications'), 1);
  await active.stop();
  const restarted = await openHost(t, { store: active.store, spa: active.spa });
  current = restarted.base;
  const resumed = successful(await ein('resume', env));
  assert.equal(resumed.server.recovered, true);
  assert.deepEqual(readRecord(env.EIN_CONTINUATION_FILE).prepareBody, before.prepareBody);
  assert.equal(collectionCount(active.store, 'applications'), 1);
  const record = readRecord(env.EIN_CONTINUATION_FILE);
  const claim = await humanClaim(current, record);
  const grant = writeGrant(active.root, claim.grantBody.token);
  const returned = successful(await run(['return'], { env: { ...env, EIN_AGENT_GRANT_FILE: grant, EIN_AGENT_GRANT_ORIGIN: proxy.base }, input: { ...input, checkpoint: handed.checkpoint } }));
  assert.equal(returned.activation.applicationStatus, 'claimed');
  assert.equal(returned.activation.prerequisiteSatisfied, false);
  assert.equal(returned.nextAction.kind, 'return_to_readiness');
  // Replaying the same caller return after a lost response only rereads the original case.
  const duplicate = successful(await run(['return'], { env: { ...env, EIN_AGENT_GRANT_FILE: grant, EIN_AGENT_GRANT_ORIGIN: proxy.base }, input: { ...input, checkpoint: handed.checkpoint } }));
  assert.equal(duplicate.checkpoint.einApplicationId, record.applicationId);
  assert.equal(collectionCount(active.store, 'applications'), 1);
  assert.equal(collectionCount(active.store, 'payment_attempts'), 0);
  noSecrets([handed, returned, duplicate], [record.claimUrl, claim.grantBody.token, record.intendedEmail]);
  await restarted.stop();
});

test('one missing supplied fact resolves the ambiguous task without inventing another goal', async (t) => {
  const active = await session(t), sds = await sdsHost(t), input = example('ambiguous');
  const env = envFor(input.task, sds.base, active.root, { EIN_ACTIVATION_BASE_URL: active.base });
  const unknown = successful(await run(['plan'], { env, input }));
  assert.equal(unknown.service, null);
  assert.deepEqual(unknown.nextAction.requiredInputs, ['facts.providerRequiresUsEntity']);
  const supplied = structuredClone(input);
  supplied.task.facts.providerRequiresUsEntity.value = 'yes';
  supplied.task.facts.providerRequiresUsEntity.source.locator = 'providerRequiresUsEntity.confirmed';
  const record = join(active.root, 'amended.sources.private.json');
  writeFileSync(record, JSON.stringify({ schema: 'samedaydesk.caller-source-records.v1', taskId: supplied.task.taskId, recipientId: supplied.task.recipientId, goal: supplied.task.goal, facts: supplied.task.facts }), { mode: 0o600 });
  const qualified = successful(await run(['plan'], { env: { ...env, SDS_ACTIVATION_SOURCE_RECORDS_FILE: record }, input: { ...supplied, checkpoint: unknown.checkpoint } }));
  assert.equal(qualified.qualification.qualified, true);
  assert.equal(qualified.nextAction.input.goal, input.task.goal.value);
  assert.equal(qualified.nextAction.input.providerRequiresUsEntity, 'yes');
  assert.equal(collectionCount(active.store, 'formation_assessments'), 0);
  assert.equal(collectionCount(active.store, 'applications'), 0);
  await active.stop();
});

test('no-purchase and ambiguity match the current direct EIN engine on the same supplied facts', () => {
  for (const [name, outcome] of [['existing-business', 'already_satisfied'], ['technical', 'insufficient_information'], ['ambiguous', 'insufficient_information']]) {
    const { task } = example(name);
    assert.equal(assessFormationNeed(assessmentInput(task)).outcome, outcome);
  }
});

test('actual pending application status is unpaid and cannot complete the prerequisite', async t => {
  const active = await session(t), sds = await sdsHost(t), input = example('qualifying');
  const env = envFor(input.task, sds.base, active.root, { EIN_ACTIVATION_BASE_URL: active.base });
  const planned = successful(await run(['plan'], { env, input }));
  successful(await ein('assess', env, planned.nextAction.input));
  successful(await ein('prepare', env));
  const record = readRecord(env.EIN_CONTINUATION_FILE);
  const claim = await humanClaim(active.base, record);
  const grant = writeGrant(active.root, claim.grantBody.token);
  await active.stop();
  const dump = storeDump(active.store);
  dump.applications[record.applicationId].status = 'async_pending';
  writeFileSync(active.store, JSON.stringify(dump));
  const restarted = await openHost(t, { store: active.store, spa: active.spa });
  assert.notEqual(restarted.base, active.base);
  // The same persisted application/grant is reached on the restarted fixture
  // through its original origin, via a forwarding-only loopback proxy.
  const original = new URL(active.base);
  const { createServer } = await import('node:http');
  const proxy = createServer((req, res) => {
    const target = new URL(restarted.base);
    forward(target, req, res, Buffer.alloc(0));
  });
  await new Promise(resolve => proxy.listen(Number(original.port), '127.0.0.1', resolve));
  t.after(async () => { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); });
  const returned = successful(await run(['return'], { env: { ...env, EIN_AGENT_GRANT_FILE: grant, EIN_AGENT_GRANT_ORIGIN: active.base }, input: { ...input, checkpoint: planned.checkpoint } }));
  assert.equal(returned.activation.applicationStatus, 'async_pending');
  assert.equal(returned.activation.paid, false);
  assert.equal(returned.activation.prerequisiteSatisfied, false);
  assert.equal(returned.activation.complete, false);
  assert.equal(returned.revenue, false);
  assert.equal(collectionCount(active.store, 'payment_attempts'), 0);
});

test('two independent minimal exported profiles complete actual operator-status continuation with stripped environments', async (t) => {
  const active = await session(t), sds = await sdsHost(t), input = example('qualifying');
  const profile = pack(join(active.root, 'export'), 'qa-source');
  const bins = [];
  for (const name of ['first', 'later']) {
    const dir = join(active.root, name); mkdirSync(dir);
    assert.equal(spawnSync('tar', ['-xzf', join(active.root, 'export', profile.archive), '-C', dir]).status, 0);
    bins.push(join(dir, profile.name));
  }
  const env = envFor(input.task, sds.base, active.root, { EIN_ACTIVATION_BASE_URL: active.base });
  const plan = successful(await run(['plan'], { env, input, cwd: bins[0], binPath: join(bins[0], 'bin/sds-activation.mjs') }));
  const acquiredEin = join(bins[0], 'vendor/ein-activation-continuation/bin/ein-continuation.mjs');
  successful(await run(['assess'], { env, input: plan.nextAction.input, binPath: acquiredEin, cwd: bins[0] }));
  successful(await run(['prepare'], { env, input: '', binPath: acquiredEin, cwd: bins[0] }));
  const carried = { ...input, checkpoint: plan.checkpoint };
  const handoff = successful(await run(['handoff'], { env, input: carried, cwd: bins[1], binPath: join(bins[1], 'bin/sds-activation.mjs') }));
  const record = readRecord(env.EIN_CONTINUATION_FILE);
  const human = await humanClaim(active.base, record);
  const file = writeGrant(active.root, human.grantBody.token);
  const returned = successful(await run(['return'], { env: { ...env, EIN_AGENT_GRANT_FILE: file, EIN_AGENT_GRANT_ORIGIN: active.base }, input: { ...input, checkpoint: handoff.checkpoint }, cwd: bins[1], binPath: join(bins[1], 'bin/sds-activation.mjs') }));
  assert.equal(returned.activation.operatorActionObserved, true);
  assert.equal(returned.activation.prerequisiteSatisfied, false);
  assert.equal(returned.nextAction.kind, 'return_to_readiness');
  assert.equal(collectionCount(active.store, 'applications'), 1);
  assert.equal(collectionCount(active.store, 'payment_attempts'), 0);
  noSecrets([plan, handoff, returned], [record.claimUrl, human.grantBody.token, record.intendedEmail]);
  await active.stop();
});
