// VM-only. Needs the repository npm install and the disposable local PostgreSQL
// used by server/scripts/root10940-machine-host.mjs. Not part of the light suite.
// It carries one residual need from `residual` through the existing unfunded
// rails with the existing cold client and checks that no money row moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {machineHost} from '../../../server/scripts/root10940-machine-host.mjs';
import {bindUsefulDecision} from '../src/export.mjs';
import {residualNeed} from '../src/residual.mjs';
import {runSourceChangeAlert} from '../../recurring-job-recipes/recipes/source-change-alert.mjs';

const exec = promisify(execFile);
const repo = resolve(import.meta.dirname, '../../..');
const CLIENT = join(repo, 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs');
const SOURCE_COMMIT = '0593026ad155352f263e4749dc889a1578d91675';
const SOURCE_REPOSITORY = 'https://github.com/epistemedeus/samedaydesk.git';
const SOURCE_PATH = 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs';
const CLOCK = '2026-09-09T08:00:00.000Z';
const opts = {taskId: 'residual-vm', subject: 'residual-vm-decision', sequence: 1, clock: CLOCK, horizonHours: 168, optIn: true};

async function residualCase(dir) {
  const priorPath = join(repo, 'tools/recurring-job-recipes/fixtures/priors/source-change.prior.json');
  const prior = JSON.parse(readFileSync(priorPath, 'utf8'));
  const capture = {url: 'https://example.com/', status: 200, title: 'Example Domain',
    fields: {title: 'Example Domain'}, contentHash: 'sha256:residual-vm-v1'};
  const capturePath = join(dir, 'capture.json');
  writeFileSync(capturePath, JSON.stringify(capture));
  const manifest = {recipeId: 'source-change-alert', recipeVersion: 'samedaydesk.recurring-job-recipe-result.v1', fields: ['title'],
    prior: {sha256: prior.sha256, sequence: prior.sequence, createdAt: prior.createdAt,
      payload: {url: prior.payload.url, status: prior.payload.status, title: prior.payload.title, fields: prior.payload.fields, contentHash: prior.payload.contentHash}},
    capture};
  const produced = await runSourceChangeAlert({priorPath, currentFixturePath: capturePath, fields: ['title'], clock: CLOCK, horizonHours: 168});
  const bound = bindUsefulDecision(manifest, produced, opts);
  assert.equal(bound.ok, true, bound.message);
  const result = residualNeed(bound.observation, manifest, {...opts, want: ['title', 'price']});
  assert.equal(result.route, 'residual_need');
  return result;
}

test('a residual need travels post, interest, offer, assent, deliver and review with no money row', async () => {
  const host = await machineHost();
  const dir = mkdtempSync(join(host.scratch, 'residual-'));
  try {
    const residual = (await residualCase(dir)).residual;
    await host.boot({participation: true, acceptedWorkPublic: false});
    const before = await host.financialSnapshot();
    const pins = ['--origin', host.origin, '--ca-file', host.caFile];
    const cold = async args => {
      try {
        const {stdout} = await exec(process.execPath, [CLIENT, ...args], {encoding: 'utf8', timeout: 20000, maxBuffer: 1 << 20});
        return {status: 0, body: JSON.parse(stdout)};
      } catch (error) {
        let body = {}; try { body = JSON.parse(error.stdout || '{}'); } catch {}
        return {status: Number.isInteger(error.code) ? error.code : 1, body};
      }
    };
    const must = (step, r) => { assert.equal(r.status, 0, `${step}: ${JSON.stringify(r.body).slice(0, 400)}`); assert.equal(r.body.ok, true, step); return r.body; };
    let seq = 0;
    const secrets = {};
    const act = (name, action, input) => {
      const path = join(dir, `${action}-${++seq}.json`);
      writeFileSync(path, JSON.stringify(input));
      return cold(['act', ...pins, '--secret-file', secrets[name], '--action', action, '--input', path]);
    };
    const readOut = async (command, name, taskId) => {
      const path = join(dir, `${command}-${++seq}.json`);
      const response = await cold([command, ...pins, '--secret-file', secrets[name], '--task-id', taskId, '--out', path]);
      return {response, value: response.body?.ok ? JSON.parse(readFileSync(path, 'utf8')) : null};
    };
    const opened = must('profile', await cold(['profile', ...pins]));
    const clientBytes = readFileSync(CLIENT);
    const descriptor = {schema: 'neomorphic.machine-participation.acquisition.v1', version: '0.3.0', bytes: clientBytes.length,
      sha256: createHash('sha256').update(clientBytes).digest('hex'),
      source: {repository: SOURCE_REPOSITORY, commit: SOURCE_COMMIT, path: SOURCE_PATH},
      requiredProfile: {money: 'unfunded', participation: 'voluntary-artifact-v1', sourceSha256: opened.sourceSha256, hostSha256: opened.hostSha256}};
    const descriptorPath = join(dir, 'acquisition.json');
    writeFileSync(descriptorPath, JSON.stringify(descriptor));
    const acquire = ['--descriptor', descriptorPath, '--descriptor-sha256', createHash('sha256').update(readFileSync(descriptorPath)).digest('hex'),
      '--source-repository', SOURCE_REPOSITORY, '--source-commit', SOURCE_COMMIT, '--source-path', SOURCE_PATH];
    for (const [name, role] of [['A', 'requester'], ['B', 'contributor']]) {
      secrets[name] = join(dir, `secret-${name}.json`);
      must(`signup ${name}`, await cold(['signup', ...pins, '--secret-file', secrets[name], '--display-name', `SYNTHETIC residual ${name}`, '--role', role, ...acquire]));
    }
    const accountId = name => JSON.parse(readFileSync(secrets[name], 'utf8')).accountId;

    const [command, ...postArgs] = residual.coldRequesterPost;
    const posted = must('post', await cold([command, ...pins, '--secret-file', secrets.A, ...postArgs]));
    const taskId = posted.taskId;
    const row = (await host.query(`SELECT spec FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [taskId])).rows[0];
    assert.equal(row.spec.title, residual.post.title);
    assert.deepEqual(row.spec.criteria, residual.post.criteria);
    must('interest', await cold(['interest', ...pins, '--secret-file', secrets.B, '--task-id', taskId, '--note', 'SYNTHETIC contributor B can supply the missing field.']));
    must('proposals', (await readOut('proposals', 'A', taskId)).response);
    const offer = {...residual.offerVoluntaryInput, taskId, contributorId: accountId('B'), authorizedToRequest: true,
      rights: {...residual.offerVoluntaryInput.rights, attribution: 'SYNTHETIC residual contributor B'}};
    let state = must('offer', await act('A', 'offerVoluntary', offer));
    const spec = await readOut('inspect', 'B', taskId);
    must('inspect', spec.response);
    state = must('assent', await act('B', 'assentVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision,
      authorizedToShare: true, spec: spec.value.spec}));
    state = must('deliver', await act('B', 'deliverVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision,
      evidence: {kind: 'usable', businessResult: JSON.stringify({field: 'price', value: 'SYNTHETIC 0.00', source: 'https://example.com/'}),
        attempts: [{action: 'Read the public page', result: 'One synthetic value', evidence: 'SYNTHETIC'}],
        criterionResults: [{criterionId: residual.acceptance.criterionId, observation: 'price present with a public source', passed: true}],
        nextDecision: 'Requester A reviews the residual field.'}}));
    state = must('review', await act('A', 'reviewVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision,
      artifactDigest: state.artifactDigest, accepted: true, exportAuthorized: false, reason: 'The residual field is accepted without export.'}));
    assert.equal(state.state, 'accepted');
    assert.equal(state.paidWork, false);
    assert.deepEqual(await host.financialSnapshot(), before, 'no money row moved');
  } finally {
    rmSync(dir, {recursive: true, force: true});
    await host.close();
  }
});
