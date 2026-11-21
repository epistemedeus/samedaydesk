import {execFile} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {promisify} from 'node:util';
import {machineHost} from '../../server/scripts/root10940-machine-host.mjs';
import {digest} from './digest.mjs';

const exec = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '../..');
const PREFIX = '/api/neomorphic-contributor-journey';
const CLIENT = join(ROOT, 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs');
const SOURCE = join(ROOT, 'vendor/hosted-wallet-market/client/accepted-work-source.mjs');
const PRIVATE_SUMMARY = 'Voluntary owner QA: retain a synthetic table compatibility vector; no commission or payout.';
const REVIEW_REASON = 'The exact synthetic mappings meet the requested compatibility criterion.';

async function cold(program, args) {
  try {
    const {stdout} = await exec(process.execPath, ['--max-old-space-size=256', program, ...args], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
      env: {...process.env, UV_THREADPOOL_SIZE: '1', OMP_NUM_THREADS: '1'},
    });
    return {status: 0, body: JSON.parse(stdout)};
  } catch (error) {
    const status = Number.isInteger(error.code) ? error.code : 1;
    return {status, body: JSON.parse(error.stdout || '{}')};
  }
}

export async function runHostReturn({publicArtifact, summary, rights, returnDocument, onPublished}) {
  const host = await machineHost();
  const directory = mkdtempSync(join(host.scratch, 'agl-seed-'));
  const file = (name) => join(directory, name);
  const secrets = {};
  const roleOf = (name) => {
    const secret = JSON.parse(readFileSync(secrets[name], 'utf8'));
    return {cookie: secret.cookie, csrf: secret.csrf, accountId: secret.accountId};
  };
  let seq = 0;
  const operationId = () => 'agl-seed-op-' + (++seq) + '-' + randomBytes(4).toString('hex');
  const pins = ['--origin', host.origin, '--ca-file', host.caFile];
  const route = (path) => PREFIX + path;
  try {
    const off = await host.boot({acceptedWorkPublic: false});
    const closedList = await host.request(route('/v1/market/accepted-work'), {method: 'GET'});
    const closedProfile = await host.request(route('/v1/market/profile'), {method: 'GET'});
    const on = await host.boot({acceptedWorkPublic: true});
    if (on.sourceSha256 !== off.sourceSha256 || on.hostSha256 !== off.hostSha256) throw new Error('profile_changed');
    const clientBytes = readFileSync(CLIENT);
    const clientSha = createHash('sha256').update(clientBytes).digest('hex');
    const descriptor = {
      schema: 'neomorphic.machine-participation.acquisition.v1',
      version: '0.3.0',
      bytes: clientBytes.length,
      sha256: clientSha,
      source: {
        repository: 'https://github.com/epistemedeus/samedaydesk.git',
        commit: 'b28b3c0024b885b7ea7ae672a978e11251ef71ca',
        path: 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs',
      },
      requiredProfile: {
        money: 'unfunded',
        participation: 'voluntary-artifact-v1',
        sourceSha256: on.sourceSha256,
        hostSha256: on.hostSha256,
      },
    };
    const descriptorPath = file('acquisition.json');
    writeFileSync(descriptorPath, JSON.stringify(descriptor));
    const descriptorSha = createHash('sha256').update(readFileSync(descriptorPath)).digest('hex');
    const acquire = [
      '--descriptor', descriptorPath, '--descriptor-sha256', descriptorSha,
      '--source-repository', descriptor.source.repository,
      '--source-commit', descriptor.source.commit,
      '--source-path', descriptor.source.path,
    ];
    async function signup(name, role) {
      secrets[name] = file(name + '.json');
      const created = await cold(CLIENT, ['signup', ...pins, '--secret-file', secrets[name], '--display-name', 'agl seed ' + name, '--role', role, ...acquire]);
      if (!created.body.ok) throw new Error('signup_failed:' + name + ':' + JSON.stringify(created.body));
    }
    await signup('requester', 'requester');
    await signup('contributor', 'contributor');
    const opened = await host.request(route('/v1/market/profile'), {method: 'GET'});
    async function act(name, action, input) {
      const path = file(action + '-' + name + '-' + (++seq) + '.json');
      writeFileSync(path, JSON.stringify(input));
      const response = await cold(CLIENT, ['act', ...pins, '--secret-file', secrets[name], '--action', action, '--input', path]);
      if (!response.body.ok) throw new Error(action + '_failed:' + JSON.stringify(response.body));
      return response.body;
    }
    const posted = await cold(CLIENT, ['post', ...pins, '--secret-file', secrets.requester, '--title', 'agl seed query key task', '--summary', PRIVATE_SUMMARY, '--criterion', 'preserve-mapping']);
    if (!posted.body.ok) throw new Error('post_failed:' + JSON.stringify(posted.body));
    const taskId = posted.body.taskId;
    const firstInterest = await cold(CLIENT, ['interest', ...pins, '--secret-file', secrets.contributor, '--task-id', taskId, '--note', 'I can share the authorized synthetic fixture voluntarily.']);
    if (!firstInterest.body.ok) throw new Error('setup_interest_failed:' + JSON.stringify(firstInterest.body));
    const contributorId = roleOf('contributor').accountId;
    let state = await act('requester', 'offerVoluntary', {taskId, contributorId, authorizedToRequest: true, rights});
    const specOut = file('spec.json');
    const inspected = await cold(CLIENT, ['inspect', ...pins, '--secret-file', secrets.contributor, '--task-id', taskId, '--out', specOut]);
    if (!inspected.body.ok) throw new Error('inspect_failed:' + JSON.stringify(inspected.body));
    const spec = JSON.parse(readFileSync(specOut, 'utf8')).spec;
    state = await act('contributor', 'assentVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, authorizedToShare: true, spec});
    const {usefulEvidence} = await import('../../vendor/hosted-wallet-market/examples/participation-canary.mjs');
    const evidence = usefulEvidence();
    state = await act('contributor', 'deliverVoluntary', {taskId, termsDigest: state.termsDigest, expectedRevision: state.revision, evidence});
    state = await act('requester', 'reviewVoluntary', {
      taskId, termsDigest: state.termsDigest, expectedRevision: state.revision,
      artifactDigest: state.artifactDigest, accepted: true, exportAuthorized: true, reason: REVIEW_REASON,
    });
    const permitBody = {
      taskId,
      termsDigest: state.termsDigest,
      expectedRevision: state.revision,
      summary,
      summaryDigest: digest(summary),
      publicArtifact,
      publicArtifactDigest: digest(publicArtifact),
      rightsDigest: digest(rights),
      artifactDigest: digest(evidence),
      publicationConsent: true,
    };
    async function permit(name, body) {
      const path = file('permit-' + name + '-' + (++seq) + '.json');
      writeFileSync(path, JSON.stringify(body));
      return cold(SOURCE, ['permit', ...pins, '--secret-file', secrets[name], '--input', path]);
    }
    const requesterPermit = await permit('requester', permitBody);
    if (!requesterPermit.body.ok) throw new Error('requester_permit_failed:' + JSON.stringify(requesterPermit.body));
    const contributorPermit = await permit('contributor', {...permitBody, expectedRevision: requesterPermit.body.revision});
    if (!contributorPermit.body.ok) throw new Error('contributor_permit_failed:' + JSON.stringify(contributorPermit.body));
    const anonymousList = await host.request(route('/v1/market/accepted-work'), {method: 'GET'});
    const anonymousDetail = await host.request(route('/v1/market/accepted-work/' + taskId), {method: 'GET'});
    const anonymousArtifact = await host.request(route('/v1/market/accepted-work/' + taskId + '/artifact'), {method: 'GET'});
    const published = {
      origin: host.origin,
      caFile: host.caFile,
      taskId,
      anonymousList,
      anonymousDetail,
      anonymousArtifact,
      signerAuthority: opened.body?.value?.signerAuthority,
      paidWork: opened.body?.value?.acceptedWork?.paidWork,
    };
    const coldCaller = await onPublished(published);
    await signup('visitor', 'contributor');
    const tasksBefore = Number((await host.query('SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_tasks')).rows[0].n);
    const moneyBefore = await host.financialSnapshot();
    const note = JSON.stringify({document: returnDocument, rights, artifactDigest: digest(returnDocument)});
    const visitor = roleOf('visitor');
    const interest = await host.request(route('/v1/market/interest'), {
      method: 'POST',
      role: visitor,
      body: {taskId, note},
      operationId: operationId(),
    });
    const stored = await host.query(
      'SELECT note FROM cj227_earned_work.ae14_market_interests WHERE task_id=$1 AND actor_id=$2',
      [taskId, visitor.accountId],
    );
    const deliver = await host.request(route('/v1/market/deliverVoluntary'), {
      method: 'POST',
      role: visitor,
      body: {taskId, termsDigest: state.termsDigest, expectedRevision: contributorPermit.body.revision},
      operationId: operationId(),
    });
    const fund = await host.request(route('/v1/market/fund'), {
      method: 'POST',
      role: roleOf('requester'),
      body: {taskId, quoteDigest: 'unfunded', proofId: 'unfunded'},
      operationId: operationId(),
    });
    const tasksAfter = Number((await host.query('SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_tasks')).rows[0].n);
    const moneyAfter = await host.financialSnapshot();
    return {
      closedListStatus: closedList.status,
      closedProfileSigner: closedProfile.body?.value?.signerAuthority,
      published,
      coldCaller,
      interest: {status: interest.status, code: interest.body?.code || null, ok: interest.body?.ok === true},
      storedNote: stored.rows[0]?.note || null,
      deliver: {route: route('/v1/market/deliverVoluntary'), status: deliver.status, code: deliver.body?.code || null},
      fund: {route: route('/v1/market/fund'), status: fund.status, code: fund.body?.code || null, paidWork: false},
      tasksBefore,
      tasksAfter,
      financialUnchanged: JSON.stringify(moneyBefore) === JSON.stringify(moneyAfter),
      anonymous: {
        list: anonymousList.status,
        detail: anonymousDetail.status,
        artifact: anonymousArtifact.status,
      },
    };
  } finally {
    await host.close();
  }
}
