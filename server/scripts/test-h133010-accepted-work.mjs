import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash, randomBytes} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {machineHost} from './root10940-machine-host.mjs';
import {usefulEvidence} from '../../vendor/hosted-wallet-market/examples/participation-canary.mjs';
import {digest} from '../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const PREFIX = '/api/neomorphic-contributor-journey';
const CLIENT = join(root, 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs');
const SOURCE = join(root, 'vendor/hosted-wallet-market/client/accepted-work-source.mjs');
const CLIENT_SHA = '38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4';
const RIGHTS = {license: 'CC0-1.0', scope: 'synthetic-or-authorized-reusable-artifact', attribution: 'Owner QA synthetic compatibility vectors'};
const PRIVATE_SUMMARY = 'Voluntary owner QA: retain a synthetic table compatibility vector; no commission or payout.';
const PUBLIC_SUMMARY = 'Chosen consumers can request this accepted mapping through the private continuation.';
const PUBLIC_ARTIFACT = {label: 'accepted-mapping-note', text: 'Ask the requester to grant a private export before using the retained mapping.'};
const REVIEW_REASON = 'The exact synthetic mappings meet the requested compatibility criterion.';

test('opt-in accepted work is anonymous only after both parties permit, then returns through the existing grant', {timeout: 420000}, async () => {
  assert.equal(createHash('sha256').update(readFileSync(CLIENT)).digest('hex'), CLIENT_SHA);
  const host = await machineHost();
  const directory = mkdtempSync(join(host.scratch, 'h133010-'));
  const file = name => join(directory, name);
  const secrets = {};
  const secretPath = name => secrets[name];
  const account = name => JSON.parse(readFileSync(secretPath(name), 'utf8')).accountId;
  const roleOf = name => {
    const secret = JSON.parse(readFileSync(secretPath(name), 'utf8'));
    return {cookie: secret.cookie, csrf: secret.csrf};
  };
  let seq = 0;
  const operationId = () => 'h133010-op-' + (++seq) + '-' + randomBytes(4).toString('hex');
  async function cold(program, args) {
    try {
      const {stdout} = await exec(process.execPath, ['--max-old-space-size=256', program, ...args], {
        encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, env: {...process.env, UV_THREADPOOL_SIZE: '1', OMP_NUM_THREADS: '1'},
      });
      return {status: 0, body: JSON.parse(stdout)};
    } catch (error) {
      const status = Number.isInteger(error.code) ? error.code : Number.isInteger(error.status) ? error.status : 1;
      return {status, body: JSON.parse(error.stdout || '{}')};
    }
  }
  const pins = ['--origin', host.origin, '--ca-file', host.caFile];
  function clientArgs(extra = []) { return [...pins, ...extra]; }
  async function act(name, action, input) {
    const path = file(action + '-' + name + '-' + (++seq) + '.json');
    writeFileSync(path, JSON.stringify(input));
    const response = await cold(CLIENT, ['act', ...clientArgs(['--secret-file', secretPath(name), '--action', action, '--input', path])]);
    assert.equal(response.body.ok, true, JSON.stringify(response.body));
    return response.body;
  }
  async function source(name, command, extra = []) {
    const args = [command, ...clientArgs(extra)];
    if (name) args.push('--secret-file', secretPath(name));
    return cold(SOURCE, args);
  }
  function permitBody(taskId, termsDigest, revision, summary, artifact = PUBLIC_ARTIFACT) {
    return {
      taskId, termsDigest, expectedRevision: revision, summary, summaryDigest: digest(summary),
      publicArtifact: artifact, publicArtifactDigest: digest(artifact), rightsDigest: digest(RIGHTS),
      artifactDigest: digest(usefulEvidence()), publicationConsent: true,
    };
  }
  async function permit(name, body) {
    const path = file('permit-' + name + '-' + (++seq) + '.json');
    writeFileSync(path, JSON.stringify(body));
    return source(name, 'permit', ['--input', path]);
  }
  const route = path => PREFIX + path;
  const revisionOf = async taskId => Number((await host.query(`SELECT voluntary->>'revision' AS revision FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [taskId])).rows[0].revision);
  const measureRows = async taskId => (await host.query(`SELECT kind,actor_id,payload FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 ORDER BY kind`, [taskId])).rows;
  try {
    const off = await host.boot({acceptedWorkPublic: false});
    const beforeMoney = await host.financialSnapshot();
    const clientBytes = readFileSync(CLIENT);
    const descriptor = {
      schema: 'neomorphic.machine-participation.acquisition.v1', version: '0.3.0', bytes: clientBytes.length,
      sha256: CLIENT_SHA,
      source: {repository: 'https://github.com/epistemedeus/samedaydesk.git', commit: 'b28b3c0024b885b7ea7ae672a978e11251ef71ca', path: 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs'},
      requiredProfile: {money: 'unfunded', participation: 'voluntary-artifact-v1', sourceSha256: off.sourceSha256, hostSha256: off.hostSha256},
    };
    const descriptorPath = file('acquisition.json');
    writeFileSync(descriptorPath, JSON.stringify(descriptor));
    const descriptorSha = createHash('sha256').update(readFileSync(descriptorPath)).digest('hex');
    const acquire = ['--descriptor', descriptorPath, '--descriptor-sha256', descriptorSha, '--source-repository', descriptor.source.repository, '--source-commit', descriptor.source.commit, '--source-path', descriptor.source.path];
    const closed = await host.request(route('/v1/market/profile'), {method: 'GET'});
    assert.equal(closed.status, 200);
    assert.equal(closed.body.value.acceptedWork, undefined);
    assert.equal(closed.body.value.signerAuthority, false);
    assert.deepEqual(closed.body.value.mutationReceipts.actions, ['post', 'interest']);
    assert.equal(closed.body.value.participation.actions.includes('permitAcceptedWork'), false);
    assert.equal((await host.request(route('/v1/market/accepted-work'), {method: 'GET'})).status, 404);
    assert.equal((await host.request(route('/v1/discover'), {method: 'GET'})).body.value.publicEnabled, false);
    secrets.requester = file('requester.json');
    const signup = await cold(CLIENT, ['signup', ...clientArgs(['--secret-file', secrets.requester, '--display-name', 'h133010 requester', '--role', 'requester', ...acquire])]);
    assert.equal(signup.body.ok, true, JSON.stringify(signup.body));
    const oldClient = await cold(CLIENT, ['act', ...clientArgs(['--secret-file', secrets.requester, '--action', 'permitAcceptedWork'])]);
    assert.equal(oldClient.status, 1);
    assert.equal(oldClient.body.code, 'participation_arguments_refused');
    const gated = await host.request(route('/v1/market/permitAcceptedWork'), {role: roleOf('requester'), body: {taskId: 'market-' + 'ab'.repeat(32)}, operationId: operationId()});
    assert.equal(gated.status, 404);
    assert.equal(gated.body.code, 'not_found');

    const on = await host.boot({acceptedWorkPublic: true});
    assert.equal(on.sourceSha256, off.sourceSha256);
    assert.equal(on.hostSha256, off.hostSha256);
    const opened = await host.request(route('/v1/market/profile'), {method: 'GET'});
    assert.equal(opened.body.value.acceptedWork.publicReads, '0');
    assert.equal(opened.body.value.acceptedWork.paidWork, false);
    assert.equal(opened.body.value.acceptedWork.signerAuthority, false);
    assert.equal(opened.body.value.participation.actions.includes('permitAcceptedWork'), false);
    assert.equal(opened.headers['cache-control'], 'no-store');
    const contract = await host.request(route('/v1/market/participation-contract'), {method: 'GET'});
    assert.equal(JSON.stringify(contract.body).includes('permitAcceptedWork'), false);

    for (const [name, role] of [['contributor', 'contributor'], ['visitor', 'requester'], ['stranger', 'requester']]) {
      secrets[name] = file(name + '.json');
      const created = await cold(CLIENT, ['signup', ...clientArgs(['--secret-file', secrets[name], '--display-name', 'h133010 ' + name, '--role', role, ...acquire])]);
      assert.equal(created.body.ok, true, JSON.stringify(created.body));
    }
    const free = await cold(CLIENT, ['post', ...clientArgs(['--secret-file', secrets.requester, '--title', 'h133010 open free task', '--summary', 'Unassigned free task kept out of the accepted-work publication.', '--criterion', 'free-open'])]);
    assert.equal(free.body.ok, true, JSON.stringify(free.body));
    async function journey(title, {review = true, accepted = true, exportAuthorized = true} = {}) {
      const posted = await cold(CLIENT, ['post', ...clientArgs(['--secret-file', secrets.requester, '--title', title, '--summary', PRIVATE_SUMMARY, '--criterion', 'preserve-mapping'])]);
      assert.equal(posted.body.ok, true, JSON.stringify(posted.body));
      const taskId = posted.body.taskId;
      const interest = await cold(CLIENT, ['interest', ...clientArgs(['--secret-file', secrets.contributor, '--task-id', taskId, '--note', 'I can share the authorized synthetic fixture voluntarily.'])]);
      assert.equal(interest.body.ok, true, JSON.stringify(interest.body));
      let state = await act('requester', 'offerVoluntary', {taskId, contributorId: account('contributor'), authorizedToRequest: true, rights: RIGHTS});
      const specOut = file('spec-' + taskId.slice(-8) + '.json');
      const inspected = await cold(CLIENT, ['inspect', ...clientArgs(['--secret-file', secrets.contributor, '--task-id', taskId, '--out', specOut])]);
      assert.equal(inspected.body.ok, true, JSON.stringify(inspected.body));
      const spec = JSON.parse(readFileSync(specOut, 'utf8')).spec;
      state = await act('contributor', 'assentVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, authorizedToShare: true, spec});
      state = await act('contributor', 'deliverVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, evidence: usefulEvidence()});
      if (!review) return {taskId, ...state, spec};
      state = await act('requester', 'reviewVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, artifactDigest: state.artifactDigest, accepted, exportAuthorized, reason: REVIEW_REASON});
      return {taskId, ...state, spec};
    }
    const pending = await journey('h133010 pending delivery', {review: false});
    const pendingPermit = await permit('requester', permitBody(pending.taskId, pending.termsDigest, pending.revision, PUBLIC_SUMMARY));
    assert.equal(pendingPermit.body.code, 'not_accepted');
    const rejected = await journey('h133010 rejected mapping', {accepted: false, exportAuthorized: false});
    const rejectedPermit = await permit('requester', permitBody(rejected.taskId, rejected.termsDigest, rejected.revision, PUBLIC_SUMMARY));
    assert.equal(rejectedPermit.body.code, 'not_accepted');
    const main = await journey('h133010 accepted mapping');
    const twin = await journey('h133010 direct export twin');
    const absent = await source(null, 'detail', ['--task-id', main.taskId]);
    assert.equal(absent.status, 1);
    assert.equal(absent.body.code, 'not_found');
    const catalog = await cold(CLIENT, ['discover', ...clientArgs()]);
    assert.equal(catalog.body.items.some(item => item.taskId === free.body.taskId), true);
    assert.equal(catalog.body.items.some(item => item.taskId === main.taskId || item.taskId === twin.taskId), false);

    const revisionBeforeRefusal = await revisionOf(main.taskId);
    const malicious = await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, '<script>alert(1)</script>'));
    assert.equal(malicious.body.code, 'publication_refused');
    const priced = await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, 'Send 10 USDC for this mapping.'));
    assert.equal(priced.body.code, 'publication_refused');
    const named = await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, 'Approved for ' + account('requester') + ' only today.'));
    assert.equal(named.body.code, 'private_field_refused');
    const copied = await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, PUBLIC_SUMMARY, usefulEvidence()));
    assert.equal(copied.body.code, 'private_evidence_refused');
    const leaked = await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, PUBLIC_SUMMARY, {note: usefulEvidence().nextDecision}));
    assert.equal(leaked.body.code, 'private_field_refused');
    const noConsent = permitBody(main.taskId, main.termsDigest, main.revision, PUBLIC_SUMMARY);
    noConsent.publicationConsent = false;
    assert.equal((await permit('requester', noConsent)).body.code, 'publication_consent_required');
    const extra = permitBody(main.taskId, main.termsDigest, main.revision, PUBLIC_SUMMARY);
    extra.qa = true;
    assert.equal((await permit('requester', extra)).body.code, 'input_refused');
    writeFileSync(file('unused.json'), JSON.stringify({taskId: main.taskId}));
    const wrongSource = permitBody(main.taskId, main.termsDigest, main.revision, PUBLIC_SUMMARY);
    const smuggled = await source('requester', 'permit', ['--input', file('unused.json')]);
    writeFileSync(file('smuggle.json'), JSON.stringify({...wrongSource, sourceSha256: 'a'.repeat(64), hostSha256: 'b'.repeat(64)}));
    assert.equal((await source('requester', 'permit', ['--input', file('smuggle.json')])).body.code, 'source_hash_refused');
    assert.equal(smuggled.body.code, 'input_refused');
    const serverWrong = await host.request(route('/v1/market/permitAcceptedWork'), {
      role: roleOf('requester'),
      body: {...permitBody(main.taskId, main.termsDigest, main.revision, PUBLIC_SUMMARY), sourceSha256: 'a'.repeat(64), hostSha256: on.hostSha256},
      operationId: operationId(),
    });
    assert.equal(serverWrong.status, 409);
    assert.equal(serverWrong.body.code, 'voluntary_source_changed');
    const stranger = await permit('stranger', permitBody(main.taskId, main.termsDigest, main.revision, PUBLIC_SUMMARY));
    assert.equal(stranger.body.code, 'forbidden');
    assert.equal(await revisionOf(main.taskId), revisionBeforeRefusal);

    const requesterPermit = await permit('requester', permitBody(main.taskId, main.termsDigest, main.revision, PUBLIC_SUMMARY));
    assert.equal(requesterPermit.body.ok, true, JSON.stringify(requesterPermit.body));
    assert.equal(requesterPermit.body.acceptedWorkVisible, false);
    const oneSided = await source(null, 'discover-accepted', ['--limit', '20']);
    assert.equal(oneSided.body.ok, true, JSON.stringify(oneSided.body));
    assert.equal(oneSided.body.items.length, 0);
    assert.equal(oneSided.body.publicReads, '0');
    assert.equal(oneSided.body.paidWork, false);
    assert.equal((await source(null, 'detail', ['--task-id', main.taskId])).body.code, 'not_found');

    const idempotencyBefore = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`)).rows[0].n);
    const lostRevision = await revisionOf(main.taskId);
    host.fault.dropAction = 'permitAcceptedWork';
    const lost = await permit('contributor', permitBody(main.taskId, requesterPermit.body.termsDigest, requesterPermit.body.revision, PUBLIC_SUMMARY));
    assert.equal(lost.status, 2, JSON.stringify(lost.body));
    assert.equal(lost.body.code, 'unknown_outcome');
    const committed = await revisionOf(main.taskId);
    assert.equal(committed, lostRevision + 1);
    const recovered = await source('contributor', 'readback', ['--operation', 'permitAcceptedWork']);
    assert.equal(recovered.body.ok, true, JSON.stringify(recovered.body));
    assert.equal(recovered.body.acceptedWorkVisible, true);
    assert.equal(await revisionOf(main.taskId), committed);
    const idempotencyAfter = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`)).rows[0].n);
    assert.equal(idempotencyAfter, idempotencyBefore + 1);
    const again = await source('contributor', 'readback', ['--operation', 'permitAcceptedWork']);
    assert.equal(again.body.revision, recovered.body.revision);
    assert.equal(await revisionOf(main.taskId), committed);

    const privateId = 'market-' + '0'.repeat(64);
    const otherId = 'market-' + 'f'.repeat(64);
    await host.query(`INSERT INTO cj227_earned_work.ae14_market_tasks (tenant_id,id,requester_id,spec,request_digest,voluntary) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb)`,
      ['root10940-owner-qa-fixture', privateId, account('requester'), JSON.stringify({title: 'hidden private title', summary: 'hidden private summary'}), 'd'.repeat(64), JSON.stringify({revision: 1})]);
    await host.query(`INSERT INTO cj227_earned_work.ae14_market_tasks (tenant_id,id,requester_id,spec,request_digest,voluntary) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb)`,
      ['other-tenant', otherId, 'acc_othertenant0001', JSON.stringify({title: 'other tenant title', summary: 'other tenant summary'}), 'e'.repeat(64), JSON.stringify({revision: 1, publication: {public: true}})]);
    const discoveryBefore = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE kind='discovery'`)).rows[0].n);
    const listed = await source(null, 'discover-accepted', ['--limit', '1']);
    assert.equal(listed.body.ok, true, JSON.stringify(listed.body));
    assert.equal(listed.body.cacheControl, 'no-store');
    assert.equal(listed.body.items.length, 1);
    assert.equal(listed.body.items[0].taskId, main.taskId);
    assert.equal(listed.body.items[0].summary, PUBLIC_SUMMARY);
    assert.equal(listed.body.items[0].summaryDigest, digest(PUBLIC_SUMMARY));
    assert.equal(listed.body.items[0].publicArtifact, undefined);
    assert.deepEqual(listed.body.items[0].continuation, {
      account: '/v1/account/signup', interest: '/v1/market/interest', chosenConsumer: '/v1/market/grantVoluntary', permissionedExport: '/v1/market/exportVoluntary',
    });
    const listedJson = JSON.stringify(listed.body.items);
    for (const secret of [account('requester'), account('contributor'), PRIVATE_SUMMARY, REVIEW_REASON, usefulEvidence().businessResult, 'hidden private title', 'other tenant title', 'USDC']) {
      assert.equal(listedJson.includes(secret), false, secret);
    }
    const next = await source(null, 'discover-accepted', ['--limit', '1', '--cursor', listed.body.nextCursor]);
    assert.equal(next.body.ok, true, JSON.stringify(next.body));
    assert.equal(next.body.items.length, 0);
    const detail = await source(null, 'detail', ['--task-id', main.taskId]);
    assert.equal(detail.body.value.summary, PUBLIC_SUMMARY);
    assert.equal(detail.body.value.artifactDigest, digest(usefulEvidence()));
    assert.equal(detail.body.value.publicArtifact, undefined);
    assert.equal(detail.body.cacheControl, 'no-store');
    const artifact = await source(null, 'artifact', ['--task-id', main.taskId]);
    assert.deepEqual(artifact.body.value.publicArtifact, PUBLIC_ARTIFACT);
    assert.equal(artifact.body.value.publicArtifactDigest, digest(PUBLIC_ARTIFACT));
    assert.equal((await source(null, 'detail', ['--task-id', privateId])).body.code, 'not_found');
    assert.equal((await source(null, 'detail', ['--task-id', otherId])).body.code, 'not_found');
    assert.equal((await source(null, 'detail', ['--task-id', twin.taskId])).body.code, 'not_found');
    const discoveryAfter = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE kind='discovery'`)).rows[0].n);
    assert.equal(discoveryAfter, discoveryBefore);
    const publicMeasures = await measureRows(main.taskId);
    assert.equal(publicMeasures.some(row => row.kind === 'accepted_work_discovery' && row.actor_id === 'anonymous' && row.payload.externalUse === false && row.payload.paidWork === false && row.payload.uniquePrincipal === null), true);
    assert.equal(JSON.stringify(publicMeasures).includes(PUBLIC_SUMMARY), false);

    const ungranted = file('ungranted.json');
    const denied = await cold(CLIENT, ['export', ...clientArgs(['--secret-file', secrets.visitor, '--task-id', main.taskId, '--out', ungranted])]);
    assert.equal(denied.body.code, 'forbidden');
    const granted = await act('requester', 'grantVoluntary', {taskId: main.taskId, termsDigest: recovered.body.termsDigest, expectedRevision: recovered.body.revision, consumerId: account('visitor')});
    const exportedPath = file('visitor-export.json');
    const exported = await cold(CLIENT, ['export', ...clientArgs(['--secret-file', secrets.visitor, '--task-id', main.taskId, '--out', exportedPath])]);
    assert.equal(exported.body.ok, true, JSON.stringify(exported.body));
    const exportedBody = JSON.parse(readFileSync(exportedPath, 'utf8'));
    assert.deepEqual(exportedBody.evidence, usefulEvidence());
    const directGrant = await act('requester', 'grantVoluntary', {taskId: twin.taskId, termsDigest: twin.termsDigest, expectedRevision: twin.revision, consumerId: account('visitor')});
    const directPath = file('direct-export.json');
    const direct = await cold(CLIENT, ['export', ...clientArgs(['--secret-file', secrets.visitor, '--task-id', twin.taskId, '--out', directPath])]);
    assert.equal(direct.body.ok, true, JSON.stringify(direct.body));
    assert.deepEqual(JSON.parse(readFileSync(directPath, 'utf8')).evidence, exportedBody.evidence);
    assert.equal(directGrant.paidWork, false);
    assert.equal(granted.paidWork, false);
    const continuation = (await measureRows(main.taskId)).filter(row => row.kind === 'accepted_work_continuation');
    assert.equal(continuation.length, 1);
    assert.equal(continuation[0].payload.externalUse, false);
    assert.equal(continuation[0].payload.paidWork, false);
    assert.equal(continuation[0].payload.uniquePrincipal, null);
    assert.equal((await measureRows(twin.taskId)).some(row => row.kind === 'accepted_work_continuation'), false);
    const stillPrivate = await source(null, 'discover-accepted', ['--limit', '20']);
    assert.deepEqual(stillPrivate.body.items.map(item => item.taskId), [main.taskId]);

    const flipped = await host.query(`SELECT voluntary FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [main.taskId]);
    const stored = flipped.rows[0].voluntary;
    const originalDigest = stored.artifact.digest;
    stored.artifact.digest = 'a'.repeat(64);
    await host.query(`UPDATE cj227_earned_work.ae14_market_tasks SET voluntary=$2::jsonb WHERE id=$1`, [main.taskId, JSON.stringify(stored)]);
    assert.equal((await source(null, 'detail', ['--task-id', main.taskId])).body.code, 'not_found');
    stored.artifact.digest = originalDigest;
    await host.query(`UPDATE cj227_earned_work.ae14_market_tasks SET voluntary=$2::jsonb WHERE id=$1`, [main.taskId, JSON.stringify(stored)]);
    assert.equal((await source(null, 'detail', ['--task-id', main.taskId])).body.value.summary, PUBLIC_SUMMARY);

    const changed = 'The same accepted mapping stays available only while both parties still agree.';
    const current = await revisionOf(main.taskId);
    const hide = await permit('requester', permitBody(main.taskId, recovered.body.termsDigest, current, changed));
    assert.equal(hide.body.acceptedWorkVisible, false);
    assert.equal((await source(null, 'detail', ['--task-id', main.taskId])).body.code, 'not_found');
    const show = await permit('contributor', permitBody(main.taskId, hide.body.termsDigest, hide.body.revision, changed));
    assert.equal(show.body.acceptedWorkVisible, true);
    assert.equal((await source(null, 'detail', ['--task-id', main.taskId])).body.value.summary, changed);

    await host.stop();
    await host.boot({acceptedWorkPublic: true});
    assert.equal((await source(null, 'detail', ['--task-id', main.taskId])).body.value.summary, changed);
    const [withdrawn, raced] = await Promise.all([
      source('requester', 'withdraw-publication', ['--input', writeInput(file('withdraw.json'), {taskId: main.taskId, termsDigest: show.body.termsDigest, expectedRevision: show.body.revision, reason: 'Requester stops the public summary.'})]),
      source(null, 'detail', ['--task-id', main.taskId]),
    ]);
    assert.equal(withdrawn.body.ok, true, JSON.stringify(withdrawn.body));
    assert.equal(withdrawn.body.acceptedWorkVisible, false);
    assert.equal((await source(null, 'detail', ['--task-id', main.taskId])).body.code, 'not_found');
    assert.equal((await source(null, 'discover-accepted', ['--limit', '20'])).body.items.length, 0);
    assert.equal((await source(null, 'discover-accepted', ['--limit', '20', '--cursor', main.taskId])).body.items.length, 0);
    assert.ok(raced.body.code === 'not_found' || raced.body.value?.summary === changed);
    const stillGranted = await cold(CLIENT, ['export', ...clientArgs(['--secret-file', secrets.visitor, '--task-id', main.taskId, '--out', file('after-publication-withdrawal.json')])]);
    assert.equal(stillGranted.body.ok, true, JSON.stringify(stillGranted.body));
    assert.deepEqual(JSON.parse(readFileSync(file('after-publication-withdrawal.json'), 'utf8')).evidence, usefulEvidence());
    const consumers = Number((await host.query(`SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_voluntary_consumers WHERE task_id=$1`, [main.taskId])).rows[0].n);
    assert.equal(consumers, 1);
    await host.stop();
    await host.boot({acceptedWorkPublic: true});
    assert.equal((await source(null, 'artifact', ['--task-id', main.taskId])).body.code, 'not_found');
    const contributorStop = await source('contributor', 'withdraw-publication', ['--input', writeInput(file('withdraw-again.json'), {taskId: main.taskId, termsDigest: withdrawn.body.termsDigest, expectedRevision: withdrawn.body.revision, reason: 'Contributor confirms the public stop.'})]);
    assert.equal(contributorStop.body.acceptedWorkVisible, false);
    await act('contributor', 'withdrawVoluntary', {taskId: twin.taskId, termsDigest: directGrant.termsDigest, expectedRevision: directGrant.revision, reason: 'Stop the unpublished twin.'});
    const twinExport = await cold(CLIENT, ['export', ...clientArgs(['--secret-file', secrets.visitor, '--task-id', twin.taskId, '--out', file('twin-withdrawn.json')])]);
    assert.equal(twinExport.body.code, 'voluntary_withdrawn');
    const mainStill = await cold(CLIENT, ['export', ...clientArgs(['--secret-file', secrets.visitor, '--task-id', main.taskId, '--out', file('main-still.json')])]);
    assert.equal(mainStill.body.ok, true, JSON.stringify(mainStill.body));
    const funded = await cold(CLIENT, ['fund', ...clientArgs(['--secret-file', secrets.requester])]);
    assert.equal(funded.body.ok, false);
    assert.equal(funded.body.paidWork, false);
    await host.stop();
    await host.boot({acceptedWorkPublic: false});
    assert.equal((await host.request(route('/v1/market/accepted-work'), {method: 'GET'})).status, 404);
    assert.equal((await host.request(route('/v1/market/profile'), {method: 'GET'})).body.value.acceptedWork, undefined);
    assert.deepEqual(await host.financialSnapshot(), beforeMoney);
  } finally {
    rmSync(directory, {recursive: true, force: true});
    await host.close();
  }
});

function writeInput(path, value) {
  writeFileSync(path, JSON.stringify(value));
  return path;
}
