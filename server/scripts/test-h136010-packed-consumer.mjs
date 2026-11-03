// Packed 0.3.1 consumer. The programs under test are the Neomorphic publication
// bytes. The 0.3.0 journey in test-h133010-accepted-work.mjs stays separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash, randomBytes} from 'node:crypto';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {machineHost} from './root10940-machine-host.mjs';
import {usefulEvidence} from '../../vendor/hosted-wallet-market/examples/participation-canary.mjs';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const neo = process.env.H136010_NEO || '/home/ubuntu/ae14-work/h136010';
const successorPath = process.env.H136010_SUCCESSOR || join(root, 'docs/reviews/h136010-accepted-work-release/successor-descriptor.json');
const packed = join(neo, 'public/downloads/machine-participation/0.3.1');
const CLIENT = join(packed, 'cold-requester.mjs');
const ACCEPTED = join(packed, 'accepted-work.mjs');
const PREPARE = join(packed, 'prepare-accepted-work.mjs');
const GUIDE = join(packed, 'ACCEPTED-WORK.md');
const DESCRIPTOR = join(packed, 'bindings/b28b3c00/descriptor.json');
const ENTRY = join(neo, 'public/machine/participation-0.3.1.json');
const CLIENT_SHA = 'accb4b22a02a0752028d883b8e501b11c677f6f0ee342a8ffcc9d1874cd5d7b9';
const CLIENT_0_3_0_SHA = '38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4';
const ACCEPTED_SHA = '96e23aff465e390e801b57210dfca1bd9bbd8e02703dc618e0fbf97a8c190e4b';
const PUBLIC_DESCRIPTOR_SHA = 'f16e1c620c03703b1de2ff6acc34c377a859ce9003bd005b84b0b8ba16c1d7d4';
const RIGHTS = {license: 'CC0-1.0', scope: 'synthetic-or-authorized-reusable-artifact', attribution: 'Owner QA synthetic compatibility vectors'};
const PUBLIC_SUMMARY = 'Chosen consumers can request this accepted mapping through the private continuation.';
const PUBLIC_ARTIFACT = {
  mapping: [{from: 'external_id', to: 'id'}],
  version: 1,
  source: 'export const normalize = value => value.trim();\n',
  reproduction: 'https://example.org/public/mapping.json',
};
const REVIEW_REASON = 'The exact synthetic mappings meet the requested compatibility criterion.';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('packed 0.3.1 publication receives acquisition, then permits a changed input through the source-bound profile', {timeout: 420000}, async () => {
  const clientBytes = readFileSync(CLIENT);
  const acceptedBytes = readFileSync(ACCEPTED);
  const prepareBytes = readFileSync(PREPARE);
  const guide = readFileSync(GUIDE, 'utf8');
  const entry = JSON.parse(readFileSync(ENTRY, 'utf8'));
  const descriptorBytes = readFileSync(DESCRIPTOR);
  const descriptor = JSON.parse(descriptorBytes.toString('utf8'));
  assert.equal(sha(clientBytes), CLIENT_SHA);
  assert.notEqual(sha(clientBytes), CLIENT_0_3_0_SHA);
  assert.equal(clientBytes.length, 30187);
  assert.equal(clientBytes.toString('utf8').includes("const VERSION='0.3.1'"), true);
  assert.equal(sha(acceptedBytes), ACCEPTED_SHA);
  // Hash only. The process under test is the Neomorphic publication file above.
  const sidecar = join(root, 'vendor/hosted-wallet-market/client/accepted-work-source.mjs');
  const sidecarPath = existsSync(sidecar) ? sidecar : process.env.H136010_ACCEPTED_SOURCE;
  assert.equal(sha(readFileSync(sidecarPath)), ACCEPTED_SHA);
  assert.equal(sha(readFileSync(join(neo, 'clients/cold-requester-0.3.1.mjs'))), CLIENT_SHA);
  assert.equal(sha(readFileSync(join(neo, 'dist/downloads/machine-participation/0.3.1/cold-requester.mjs'))), CLIENT_SHA);
  assert.equal(entry.version, '0.3.1');
  assert.equal(entry.sha256, CLIENT_SHA);
  assert.equal(entry.bytes, 30187);
  assert.equal(entry.source.path, 'clients/cold-requester-0.3.1.mjs');
  assert.equal(entry.source.commit, 'b79f985e83e829288a675407a4b4124e58a11f3a');
  assert.equal(entry.hostedAcquisitionVerified, false);
  assert.equal(entry.succession.binding, 'b28b3c00');
  assert.equal(entry.descriptorSha256, PUBLIC_DESCRIPTOR_SHA);
  assert.equal(sha(descriptorBytes), PUBLIC_DESCRIPTOR_SHA);
  assert.equal(descriptor.version, '0.3.1');
  assert.equal(descriptor.sha256, CLIENT_SHA);
  assert.equal(descriptor.requiredProfile.sourceSha256, '8c35b8f13a5cb6ac9399c630ccc2fdace428cd839949d62375127f924f322ad6');
  assert.equal(descriptor.requiredProfile.hostSha256, 'a5277b33df3ddf6e780aea3c360d2651312c546d860508d8d96fa463cadf04f3');
  assert.equal(entry.acceptedWorkSha256, ACCEPTED_SHA);
  assert.equal(entry.acceptedWorkBytes, acceptedBytes.length);
  assert.equal(sha(readFileSync(GUIDE)), entry.acceptedWorkGuideSha256);
  assert.equal(sha(prepareBytes), entry.acceptedWorkPrepareSha256);
  assert.equal(entry.acquisition.command[2], 'acquire');
  for (const phrase of ['empty list is not paid demand', 'Public reads stay off', 'no signer', 'Acquisition creates no account, grant or payment.']) {
    assert.equal(guide.includes(phrase), false, phrase);
  }
  for (const marker of ['prepare-accepted-work.mjs', '--summary-file', '--consent-file', 'discover-accepted', 'grantVoluntary', 'withdraw-publication', 'unknown_outcome', 'changed-row-17', 'external_id', '20 seconds']) {
    assert.equal(guide.includes(marker), true, marker);
  }

  const host = await machineHost();
  const directory = mkdtempSync(join(host.scratch, 'h136010-packed-'));
  const file = name => join(directory, name);
  const secrets = {};
  let seq = 0;
  async function cold(program, args) {
    try {
      const {stdout} = await exec(process.execPath, ['--max-old-space-size=256', program, ...args], {
        encoding: 'utf8', timeout: 25000, maxBuffer: 1024 * 1024, env: {...process.env, UV_THREADPOOL_SIZE: '1', OMP_NUM_THREADS: '1'},
      });
      return {status: 0, body: JSON.parse(stdout)};
    } catch (error) {
      const status = Number.isInteger(error.code) ? error.code : Number.isInteger(error.status) ? error.status : 1;
      return {status, body: JSON.parse(error.stdout || '{}')};
    }
  }
  const pins = () => ['--origin', host.origin, '--ca-file', host.caFile];
  function acquireArgs(bytes, value) {
    const path = file('descriptor-' + (++seq) + '.json');
    writeFileSync(path, bytes);
    return ['--descriptor', path, '--descriptor-sha256', sha(bytes), '--source-repository', value.source.repository, '--source-commit', value.source.commit, '--source-path', value.source.path];
  }
  async function act(name, action, input) {
    const path = file(action + '-' + name + '-' + (++seq) + '.json');
    writeFileSync(path, JSON.stringify(input));
    const response = await cold(CLIENT, ['act', ...pins(), '--secret-file', secrets[name], '--action', action, '--input', path]);
    assert.equal(response.body.ok, true, JSON.stringify(response.body));
    return response.body;
  }
  function writeSelected(name, value) {
    const path = file(name);
    writeFileSync(path, value);
    return path;
  }
  async function prepare(outName, {taskId, termsDigest, artifactDigest, revision, summary = PUBLIC_SUMMARY, artifact = PUBLIC_ARTIFACT, rights = RIGHTS, consent = {publicationConsent: true}}) {
    const out = file(outName);
    const response = await cold(PREPARE, [
      '--task-id', taskId, '--terms-digest', termsDigest, '--artifact-digest', artifactDigest, '--expected-revision', String(revision),
      '--summary-file', writeSelected('summary-' + outName, summary),
      '--artifact-file', writeSelected('artifact-' + outName, JSON.stringify(artifact)),
      '--rights-file', writeSelected('rights-' + outName, JSON.stringify(rights)),
      '--consent-file', writeSelected('consent-' + outName, JSON.stringify(consent)),
      '--out', out,
    ]);
    return {response, out};
  }
  async function permit(name, out) {
    return cold(ACCEPTED, ['permit', ...pins(), '--secret-file', secrets[name], '--input', out]);
  }
  const revisionOf = async taskId => Number((await host.query(`SELECT voluntary->>'revision' AS revision FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [taskId])).rows[0].revision);
  try {
    const renamed = {...descriptor, version: '0.3.0'};
    const renamedBytes = Buffer.from(JSON.stringify(renamed));
    const renamedRefusal = await cold(CLIENT, ['acquire', '--origin', 'https://127.0.0.1', ...acquireArgs(renamedBytes, renamed)]);
    assert.equal(renamedRefusal.body.code, 'acquisition_refused');
    const wrongSource = await cold(CLIENT, ['acquire', '--origin', 'https://127.0.0.1', '--descriptor', DESCRIPTOR, '--descriptor-sha256', PUBLIC_DESCRIPTOR_SHA, '--source-repository', descriptor.source.repository, '--source-commit', 'b'.repeat(40), '--source-path', descriptor.source.path]);
    assert.equal(wrongSource.body.code, 'acquisition_source_mismatch');

    const off = await host.boot();
    const beforeMoney = await host.financialSnapshot();
    assert.equal(off.acceptedWorkPublic, undefined);
    const profile = await cold(CLIENT, ['profile', ...pins()]);
    assert.equal(profile.body.ok, true, JSON.stringify(profile.body));
    assert.equal(profile.body.signerAuthority, false);
    assert.equal(profile.body.money, 'unfunded');
    const baseline = profile.body.sourceSha256 === descriptor.requiredProfile.sourceSha256 && profile.body.hostSha256 === descriptor.requiredProfile.hostSha256;
    const acquired = await cold(CLIENT, ['acquire', ...pins(), ...acquireArgs(descriptorBytes, descriptor)]);
    const listed = await cold(ACCEPTED, ['discover-accepted', ...pins()]);
    assert.equal(listed.body.status, 404);
    assert.equal(listed.body.ok, false);
    if (baseline) {
      assert.equal(acquired.body.ok, true, JSON.stringify(acquired.body));
      assert.equal(acquired.body.accountCreated, false);
      assert.equal(acquired.body.version, '0.3.1');
      assert.equal(acquired.body.clientSha256, CLIENT_SHA);
      assert.equal(acquired.body.descriptorSha256, PUBLIC_DESCRIPTOR_SHA);
      assert.deepEqual(await host.financialSnapshot(), beforeMoney);
      return;
    }
    assert.equal(acquired.body.code, 'acquisition_profile_mismatch');
    const successorBytes = readFileSync(successorPath);
    const successor = JSON.parse(successorBytes.toString('utf8'));
    assert.equal(successor.version, '0.3.1');
    assert.equal(successor.sha256, CLIENT_SHA);
    assert.equal(successor.bytes, 30187);
    assert.equal(successor.source.path, 'clients/cold-requester-0.3.1.mjs');
    assert.equal(successor.source.commit, 'b79f985e83e829288a675407a4b4124e58a11f3a');
    assert.equal(successor.hostedAcquisitionVerified, false);
    assert.equal(successor.publicationStatus, 'private_unreleased');
    assert.notEqual(sha(successorBytes), PUBLIC_DESCRIPTOR_SHA);
    assert.equal(successor.requiredProfile.sourceSha256, profile.body.sourceSha256);
    assert.equal(successor.requiredProfile.hostSha256, profile.body.hostSha256);

    const on = await host.boot({acceptedWorkFromProfile: true});
    assert.equal(on.acceptedWorkPublic, true);
    const document = JSON.parse(on.sourceBound.slice('source-bound:'.length));
    assert.equal(document.acceptedWorkPublic, true);
    assert.equal(on.sourceSha256, off.sourceSha256);
    assert.equal(on.hostSha256, off.hostSha256);
    const opened = await host.request('/api/neomorphic-contributor-journey/v1/market/profile', {method: 'GET'});
    assert.equal(opened.body.value.acceptedWork.publicReads, '0');
    assert.equal(opened.body.value.acceptedWork.paidWork, false);
    assert.equal(opened.body.value.acceptedWork.signerAuthority, false);
    assert.equal(opened.body.value.capability.acceptedWorkPublic, undefined);
    assert.equal(opened.body.value.capability.money, 'unfunded');
    const bound = await cold(CLIENT, ['acquire', ...pins(), ...acquireArgs(successorBytes, successor)]);
    assert.equal(bound.body.ok, true, JSON.stringify(bound.body));
    assert.equal(bound.body.accountCreated, false);
    assert.equal(bound.body.version, '0.3.1');
    assert.equal(bound.body.sourceSha256, on.sourceSha256);
    const pinsForAccount = acquireArgs(successorBytes, successor);
    for (const [name, role] of [['requester', 'requester'], ['contributor', 'contributor'], ['visitor', 'requester']]) {
      secrets[name] = file(name + '.json');
      const created = await cold(CLIENT, ['signup', ...pins(), '--secret-file', secrets[name], '--display-name', 'h136010 ' + name, '--role', role, ...pinsForAccount]);
      assert.equal(created.body.ok, true, JSON.stringify(created.body));
    }
    const account = name => JSON.parse(readFileSync(secrets[name], 'utf8')).accountId;
    const posted = await cold(CLIENT, ['post', ...pins(), '--secret-file', secrets.requester, '--title', 'h136010 packed mapping', '--summary', 'Voluntary owner QA: retain a synthetic table compatibility vector; no commission or payout.', '--criterion', 'preserve-mapping']);
    assert.equal(posted.body.ok, true, JSON.stringify(posted.body));
    const taskId = posted.body.taskId;
    const interest = await cold(CLIENT, ['interest', ...pins(), '--secret-file', secrets.contributor, '--task-id', taskId, '--note', 'I can share the authorized synthetic fixture voluntarily.']);
    assert.equal(interest.body.ok, true, JSON.stringify(interest.body));
    let state = await act('requester', 'offerVoluntary', {taskId, contributorId: account('contributor'), authorizedToRequest: true, rights: RIGHTS});
    const inspected = await cold(CLIENT, ['inspect', ...pins(), '--secret-file', secrets.contributor, '--task-id', taskId, '--out', file('spec.json')]);
    assert.equal(inspected.body.ok, true, JSON.stringify(inspected.body));
    const spec = JSON.parse(readFileSync(file('spec.json'), 'utf8')).spec;
    state = await act('contributor', 'assentVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, authorizedToShare: true, spec});
    state = await act('contributor', 'deliverVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, evidence: usefulEvidence()});
    state = await act('requester', 'reviewVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, artifactDigest: state.artifactDigest, accepted: true, exportAuthorized: true, reason: REVIEW_REASON});

    const missing = await prepare('missing.json', {taskId, termsDigest: state.termsDigest, artifactDigest: state.artifactDigest, revision: state.revision, consent: {publicationConsent: false}});
    assert.equal(missing.response.body.code, 'publication_consent_required');
    const inferred = await prepare('inferred.json', {taskId, termsDigest: state.termsDigest, artifactDigest: state.artifactDigest, revision: state.revision, consent: {publicationConsent: true, accepted: true}});
    assert.equal(inferred.response.body.code, 'publication_consent_required');
    const stale = await prepare('stale.json', {taskId, termsDigest: state.termsDigest, artifactDigest: 'ab'.repeat(32), revision: state.revision});
    assert.equal(stale.response.body.ok, true, JSON.stringify(stale.response.body));
    assert.equal(stale.response.body.contributorSelected, false);
    assert.equal(stale.response.body.posted, false);
    const revisionBefore = await revisionOf(taskId);
    const stalePermit = await permit('requester', stale.out);
    assert.equal(stalePermit.body.code, 'artifact_changed');
    assert.equal(await revisionOf(taskId), revisionBefore);
    assert.match(String(state.artifactDigest), /^[a-f0-9]{64}$/, JSON.stringify(state));
    const one = await prepare('permit-requester.json', {taskId, termsDigest: state.termsDigest, artifactDigest: state.artifactDigest, revision: state.revision});
    assert.equal(one.response.body.ok, true, JSON.stringify(one.response));
    assert.equal(one.response.body.contributorSelected, false);
    assert.equal(one.response.body.posted, false);
    const permitBody = JSON.parse(readFileSync(one.out, 'utf8'));
    assert.equal(permitBody.publicationConsent, true);
    assert.equal('contributorId' in permitBody, false);
    const requesterPermit = await permit('requester', one.out);
    assert.equal(requesterPermit.body.ok, true, JSON.stringify(requesterPermit.body));
    assert.equal(requesterPermit.body.acceptedWorkVisible, false);
    const oneSided = await cold(ACCEPTED, ['discover-accepted', ...pins(), '--limit', '20']);
    assert.equal(oneSided.body.ok, true, JSON.stringify(oneSided.body));
    assert.equal(oneSided.body.items.length, 0);
    assert.equal(oneSided.body.publicReads, '0');
    assert.equal(oneSided.body.paidWork, false);

    const secretPath = secrets.requester;
    const storedSecret = JSON.parse(readFileSync(secretPath, 'utf8'));
    const originalSource = storedSecret.acquisition.sourceSha256;
    storedSecret.acquisition.sourceSha256 = 'ab'.repeat(32);
    writeFileSync(secretPath, JSON.stringify(storedSecret) + '\n');
    const rebound = await permit('requester', one.out);
    assert.equal(rebound.body.code, 'acquisition_reacquire_required');
    storedSecret.acquisition.sourceSha256 = originalSource;
    writeFileSync(secretPath, JSON.stringify(storedSecret) + '\n');

    const both = await prepare('permit-contributor.json', {taskId, termsDigest: requesterPermit.body.termsDigest, artifactDigest: state.artifactDigest, revision: requesterPermit.body.revision});
    const idempotencyBefore = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`)).rows[0].n);
    host.fault.dropAction = 'permitAcceptedWork';
    const lost = await permit('contributor', both.out);
    assert.equal(lost.status, 2, JSON.stringify(lost.body));
    assert.equal(lost.body.code, 'unknown_outcome');
    assert.equal(lost.body.nextAction, 'readback');
    const recovered = await cold(ACCEPTED, ['readback', ...pins(), '--secret-file', secrets.contributor, '--operation', 'permitAcceptedWork']);
    assert.equal(recovered.body.ok, true, JSON.stringify(recovered.body));
    assert.equal(recovered.body.acceptedWorkVisible, true);
    const idempotencyAfter = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`)).rows[0].n);
    assert.equal(idempotencyAfter, idempotencyBefore + 1);
    const again = await cold(ACCEPTED, ['readback', ...pins(), '--secret-file', secrets.contributor, '--operation', 'permitAcceptedWork']);
    assert.equal(again.body.revision, recovered.body.revision);

    const privateId = 'market-' + '0'.repeat(64);
    const otherId = 'market-' + 'f'.repeat(64);
    await host.query(`INSERT INTO cj227_earned_work.ae14_market_tasks (tenant_id,id,requester_id,spec,request_digest,voluntary) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb)`,
      ['root10940-owner-qa-fixture', privateId, account('requester'), JSON.stringify({title: 'hidden private title', summary: 'hidden private summary'}), 'd'.repeat(64), JSON.stringify({revision: 1})]);
    await host.query(`INSERT INTO cj227_earned_work.ae14_market_tasks (tenant_id,id,requester_id,spec,request_digest,voluntary) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb)`,
      ['other-tenant', otherId, 'acc_othertenant0001', JSON.stringify({title: 'other tenant title', summary: 'other tenant summary'}), 'e'.repeat(64), JSON.stringify({revision: 1, publication: {public: true}})]);
    const artifact = await cold(ACCEPTED, ['artifact', ...pins(), '--task-id', taskId]);
    assert.equal(artifact.body.ok, true, JSON.stringify(artifact.body));
    assert.deepEqual(artifact.body.value.publicArtifact, PUBLIC_ARTIFACT);
    const changed = {external_id: 'changed-row-17', extra: 'kept-out-of-the-mapping'};
    const solved = {};
    for (const column of artifact.body.value.publicArtifact.mapping) solved[column.to] = changed[column.from];
    assert.deepEqual(solved, {id: 'changed-row-17'});
    assert.equal((await cold(ACCEPTED, ['detail', ...pins(), '--task-id', privateId])).body.code, 'not_found');
    assert.equal((await cold(ACCEPTED, ['detail', ...pins(), '--task-id', otherId])).body.code, 'not_found');
    const page = JSON.stringify((await cold(ACCEPTED, ['discover-accepted', ...pins(), '--limit', '20'])).body.items);
    assert.equal(page.includes(account('requester')), false);
    assert.equal(page.includes('hidden private title'), false);
    assert.equal(page.includes('other tenant title'), false);

    const denied = await cold(CLIENT, ['export', ...pins(), '--secret-file', secrets.visitor, '--task-id', taskId, '--out', file('denied.json')]);
    assert.equal(denied.body.code, 'forbidden');
    const granted = await act('requester', 'grantVoluntary', {taskId, termsDigest: recovered.body.termsDigest, expectedRevision: recovered.body.revision, consumerId: account('visitor')});
    assert.equal(granted.paidWork, false);
    const exported = await cold(CLIENT, ['export', ...pins(), '--secret-file', secrets.visitor, '--task-id', taskId, '--out', file('export.json')]);
    assert.equal(exported.body.ok, true, JSON.stringify(exported.body));
    assert.deepEqual(JSON.parse(readFileSync(file('export.json'), 'utf8')).evidence, usefulEvidence());

    const withdrawPath = file('withdraw.json');
    writeFileSync(withdrawPath, JSON.stringify({taskId, termsDigest: granted.termsDigest, expectedRevision: granted.revision, reason: 'Requester stops future served exposure.'}));
    host.fault.dropAction = 'withdrawAcceptedWork';
    const withdrawn = await cold(ACCEPTED, ['withdraw-publication', ...pins(), '--secret-file', secrets.requester, '--input', withdrawPath]);
    assert.equal(withdrawn.status, 2, JSON.stringify(withdrawn.body));
    assert.equal(withdrawn.body.code, 'unknown_outcome');
    const withdrawal = await cold(ACCEPTED, ['readback', ...pins(), '--secret-file', secrets.requester, '--operation', 'withdrawAcceptedWork']);
    assert.equal(withdrawal.body.ok, true, JSON.stringify(withdrawal.body));
    assert.equal(withdrawal.body.acceptedWorkVisible, false);
    assert.equal((await cold(ACCEPTED, ['artifact', ...pins(), '--task-id', taskId])).body.code, 'not_found');
    assert.equal((await cold(ACCEPTED, ['discover-accepted', ...pins(), '--limit', '20'])).body.items.length, 0);
    const still = await cold(CLIENT, ['export', ...pins(), '--secret-file', secrets.visitor, '--task-id', taskId, '--out', file('still.json')]);
    assert.equal(still.body.ok, true, JSON.stringify(still.body));
    await host.boot();
    assert.equal((await cold(ACCEPTED, ['discover-accepted', ...pins()])).body.status, 404);
    assert.equal((await host.request('/api/neomorphic-contributor-journey/v1/market/profile', {method: 'GET'})).body.value.acceptedWork, undefined);
    assert.deepEqual(await host.financialSnapshot(), beforeMoney);
  } finally {
    rmSync(directory, {recursive: true, force: true});
    await host.close();
  }
});
