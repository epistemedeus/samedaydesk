import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {machineHost} from './root10940-machine-host.mjs';
import {usefulEvidence} from '../../vendor/hosted-wallet-market/examples/participation-canary.mjs';
import {digest} from '../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const PREFIX = '/api/neomorphic-contributor-journey';
const CLIENT = join(root, 'server/scripts/fixtures/h142010-cold-requester-0.3.1.mjs');
const SOURCE = join(root, 'vendor/hosted-wallet-market/client/accepted-work-source.mjs');
const CLIENT_SHA = 'accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9';
const CLIENT_COMMIT = 'b79f985e83e829288a675407a4b4124e58a11f3a';
const CLIENT_PATH = 'clients/cold-requester-0.3.1.mjs';
const CLIENT_REPOSITORY = 'epistemedeus/neomorphic-io';
const RIGHTS = {license: 'CC0-1.0', scope: 'synthetic-or-authorized-reusable-artifact', attribution: 'Owner QA synthetic compatibility vectors'};
const PRIVATE_SUMMARY = 'Private retained mapping kept off the public page.';
const PUBLIC_SUMMARY = 'Authorized query comparison kept for a later chosen consumer.';
const REVIEW_REASON = 'The exact synthetic mappings meet the requested compatibility criterion.';
const gap = JSON.parse(readFileSync(join(root, 'vendor/hosted-wallet-market/test/fixtures/h142010/empty-value-gap.json'), 'utf8'));
const corpus = JSON.parse(readFileSync(join(root, 'vendor/hosted-wallet-market/test/fixtures/h142010/query-key-collision.json'), 'utf8'));

test('empty data publishes through the mounted store and the 0.3.1 client', {timeout: 240000}, async () => {
  const clientBytes = readFileSync(CLIENT);
  assert.equal(clientBytes.length, 30187);
  assert.equal(createHash('sha256').update(clientBytes).digest('hex'), CLIENT_SHA);
  assert.equal(gap.case.left[0][1], '');
  assert.equal(corpus.cases.length, 12);
  const host = await machineHost();
  const directory = mkdtempSync(join(tmpdir(), 'h142010-receive-'));
  const file = name => join(directory, name);
  const secrets = {};
  let seq = 0;
  async function cold(program, args) {
    try {
      const {stdout} = await exec(process.execPath, ['--max-old-space-size=256', program, ...args], {
        encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024,
        env: {...process.env, UV_THREADPOOL_SIZE: '1', OMP_NUM_THREADS: '1'},
      });
      return {status: 0, body: JSON.parse(stdout)};
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 1;
      return {status, body: JSON.parse(error.stdout || '{}')};
    }
  }
  const pins = ['--origin', host.origin, '--ca-file', host.caFile];
  async function act(name, action, input) {
    const path = file(action + '-' + name + '-' + (++seq) + '.json');
    writeFileSync(path, JSON.stringify(input));
    const response = await cold(CLIENT, ['act', ...pins, '--secret-file', secrets[name], '--action', action, '--input', path]);
    assert.equal(response.body.ok, true, JSON.stringify(response.body));
    assert.equal(response.body.paidWork, false);
    return response.body;
  }
  async function source(name, command, extra = []) {
    const args = [command, ...pins, ...extra];
    if (name) args.push('--secret-file', secrets[name]);
    return cold(SOURCE, args);
  }
  function permitBody(taskId, termsDigest, revision, artifact, text = PUBLIC_SUMMARY) {
    return {
      taskId, termsDigest, expectedRevision: revision, summary: text, summaryDigest: digest(text),
      publicArtifact: artifact, publicArtifactDigest: digest(artifact), rightsDigest: digest(RIGHTS),
      artifactDigest: digest(usefulEvidence()), publicationConsent: true,
    };
  }
  async function permit(name, body) {
    const path = file('permit-' + name + '-' + (++seq) + '.json');
    writeFileSync(path, JSON.stringify(body));
    return source(name, 'permit', ['--input', path]);
  }
  const revisionOf = async taskId => Number((await host.query(`SELECT voluntary->>'revision' AS revision FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [taskId])).rows[0].revision);
  const termsOf = async taskId => (await host.query(`SELECT voluntary->>'termsDigest' AS terms FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [taskId])).rows[0].terms;
  try {
    const booted = await host.boot({acceptedWorkPublic: true});
    const beforeMoney = await host.financialSnapshot();
    assert.equal(booted.money, 'unfunded');
    assert.equal(booted.signerAuthority, false);
    const descriptor = {
      schema: 'neomorphic.machine-participation.acquisition.v1', version: '0.3.1', bytes: clientBytes.length, sha256: CLIENT_SHA,
      source: {repository: CLIENT_REPOSITORY, commit: CLIENT_COMMIT, path: CLIENT_PATH},
      requiredProfile: {money: 'unfunded', participation: 'voluntary-artifact-v1', sourceSha256: booted.sourceSha256, hostSha256: booted.hostSha256},
    };
    const descriptorPath = file('acquisition.json');
    writeFileSync(descriptorPath, JSON.stringify(descriptor));
    const descriptorSha = createHash('sha256').update(readFileSync(descriptorPath)).digest('hex');
    const acquire = ['--descriptor', descriptorPath, '--descriptor-sha256', descriptorSha, '--source-repository', CLIENT_REPOSITORY, '--source-commit', CLIENT_COMMIT, '--source-path', CLIENT_PATH];
    const acquired = await cold(CLIENT, ['acquire', ...pins, ...acquire]);
    assert.equal(acquired.body.ok, true, JSON.stringify(acquired.body));
    assert.equal(acquired.body.accountCreated, false);
    assert.equal(acquired.body.version, '0.3.1');
    assert.equal(acquired.body.clientSha256, CLIENT_SHA);
    assert.equal(acquired.body.money, 'unfunded');
    const profile = await host.request(PREFIX + '/v1/market/profile', {method: 'GET'});
    assert.equal(profile.body.value.acceptedWork.paidWork, false);
    assert.equal(profile.body.value.acceptedWork.signerAuthority, false);
    assert.equal(profile.body.value.capability.money, 'unfunded');
    for (const [name, role] of [['requester', 'requester'], ['contributor', 'contributor']]) {
      secrets[name] = file(name + '.json');
      const created = await cold(CLIENT, ['signup', ...pins, '--secret-file', secrets[name], '--display-name', 'h142010 ' + name, '--role', role, ...acquire]);
      assert.equal(created.body.ok, true, JSON.stringify(created.body));
    }
    const account = name => JSON.parse(readFileSync(secrets[name], 'utf8')).accountId;
    async function acceptTask(title) {
      const posted = await cold(CLIENT, ['post', ...pins, '--secret-file', secrets.requester, '--title', title, '--summary', PRIVATE_SUMMARY, '--criterion', 'preserve-mapping']);
      assert.equal(posted.body.ok, true, JSON.stringify(posted.body));
      const taskId = posted.body.taskId;
      const interest = await cold(CLIENT, ['interest', ...pins, '--secret-file', secrets.contributor, '--task-id', taskId, '--note', 'I can share the authorized synthetic fixture voluntarily.']);
      assert.equal(interest.body.ok, true, JSON.stringify(interest.body));
      let state = await act('requester', 'offerVoluntary', {taskId, contributorId: account('contributor'), authorizedToRequest: true, rights: RIGHTS});
      const specOut = file('spec-' + taskId.slice(-8) + '.json');
      const inspected = await cold(CLIENT, ['inspect', ...pins, '--secret-file', secrets.contributor, '--task-id', taskId, '--out', specOut]);
      assert.equal(inspected.body.ok, true, JSON.stringify(inspected.body));
      const spec = JSON.parse(readFileSync(specOut, 'utf8')).spec;
      state = await act('contributor', 'assentVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, authorizedToShare: true, spec});
      state = await act('contributor', 'deliverVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, evidence: usefulEvidence()});
      state = await act('requester', 'reviewVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, artifactDigest: state.artifactDigest, accepted: true, exportAuthorized: false, reason: REVIEW_REASON});
      return state;
    }
    const main = await acceptTask('h142010 empty query value');
    const termsBefore = await termsOf(main.taskId);
    const revisionBefore = await revisionOf(main.taskId);
    assert.equal((await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, gap, ''))).body.code, 'publication_refused');
    assert.equal((await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, {'': 'kept'}))).body.code, 'publication_refused');
    assert.equal((await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, {note: PRIVATE_SUMMARY}))).body.code, 'private_field_refused');
    assert.equal((await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, usefulEvidence()))).body.code, 'private_evidence_refused');
    assert.equal(await revisionOf(main.taskId), revisionBefore);
    assert.equal(await termsOf(main.taskId), termsBefore);
    const hidden = await source(null, 'artifact', ['--task-id', main.taskId]);
    assert.equal(hidden.status, 1);
    assert.equal(hidden.body.code, 'not_found');
    const one = await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, gap));
    assert.equal(one.body.ok, true, JSON.stringify(one.body));
    assert.equal(one.body.acceptedWorkVisible, false);
    assert.equal(one.body.paidWork, false);
    const readback = await source('requester', 'readback', ['--operation', 'permitAcceptedWork']);
    assert.equal(readback.body.ok, true, JSON.stringify(readback.body));
    assert.equal(readback.body.acceptedWorkVisible, false);
    assert.equal((await source(null, 'artifact', ['--task-id', main.taskId])).body.code, 'not_found');
    const both = await permit('contributor', permitBody(main.taskId, main.termsDigest, one.body.revision, gap));
    assert.equal(both.body.ok, true, JSON.stringify(both.body));
    assert.equal(both.body.acceptedWorkVisible, true);
    const visible = await source(null, 'artifact', ['--task-id', main.taskId]);
    assert.equal(visible.body.ok, true, JSON.stringify(visible.body));
    assert.deepEqual(visible.body.value.publicArtifact, gap);
    assert.equal(visible.body.value.publicArtifact.case.left[0][1], '');
    assert.equal(JSON.stringify(visible.body.value).includes(account('requester')), false);
    assert.equal(JSON.stringify(visible.body.value).includes(PRIVATE_SUMMARY), false);
    assert.equal(await termsOf(main.taskId), termsBefore);
    writeFileSync(file('withdraw.json'), JSON.stringify({taskId: main.taskId, termsDigest: main.termsDigest, expectedRevision: both.body.revision, reason: 'Stop the public artifact.'}));
    const stopped = await source('contributor', 'withdraw-publication', ['--input', file('withdraw.json')]);
    assert.equal(stopped.body.ok, true, JSON.stringify(stopped.body));
    assert.equal(stopped.body.acceptedWorkVisible, false);
    assert.equal((await source(null, 'artifact', ['--task-id', main.taskId])).body.code, 'not_found');
    const again = await permit('requester', permitBody(main.taskId, main.termsDigest, stopped.body.revision, gap));
    assert.equal(again.body.acceptedWorkVisible, false);
    assert.equal((await source(null, 'artifact', ['--task-id', main.taskId])).body.code, 'not_found');
    const restored = await permit('contributor', permitBody(main.taskId, main.termsDigest, again.body.revision, gap));
    assert.equal(restored.body.acceptedWorkVisible, true);
    assert.equal((await source(null, 'artifact', ['--task-id', main.taskId])).body.value.publicArtifact.case.id, 'key-holds-equals');
    const older = await acceptTask('h142010 retained nonempty corpus');
    const oldOne = await permit('requester', permitBody(older.taskId, older.termsDigest, older.revision, corpus, 'Approved reusable query comparison sample.'));
    assert.equal(oldOne.body.acceptedWorkVisible, false);
    const oldBoth = await permit('contributor', permitBody(older.taskId, older.termsDigest, oldOne.body.revision, corpus, 'Approved reusable query comparison sample.'));
    assert.equal(oldBoth.body.ok, true, JSON.stringify(oldBoth.body));
    assert.equal(oldBoth.body.acceptedWorkVisible, true);
    const oldVisible = await source(null, 'artifact', ['--task-id', older.taskId]);
    assert.equal(oldVisible.body.value.publicArtifact.cases.length, 12);
    assert.equal(oldVisible.body.value.publicArtifact.cases.some(item => item.id === 'key-holds-equals'), false);
    assert.deepEqual(await host.financialSnapshot(), beforeMoney);
  } finally {
    await host.close();
  }
});
