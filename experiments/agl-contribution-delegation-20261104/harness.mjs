// Disposable loopback journey over the installed voluntary contracts.
// Imports the host, client, fee module, and publication checker. It does not edit them.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {machineHost} from '../../server/scripts/root10940-machine-host.mjs';
import {digest} from '../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';
import {
  CHANGED_INPUT, NEED_DELEGATION, NEED_STRANGER, NEED_X, NEED_Y,
  RIGHTS_DELEGATION, RIGHTS_X, applyRosterRename, evidenceDelegation, evidenceX,
  handbackDecision, publicationFence, unsentFeeObservation,
} from './inputs.mjs';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const CLIENT = join(root, 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs');
const PREFIX = '/api/neomorphic-contributor-journey';
const SOURCE_COMMIT = '0593026ad155352f263e4749dc889a1578d91675';
const SOURCE_REPOSITORY = 'https://github.com/epistemedeus/samedaydesk.git';
const SOURCE_PATH = 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs';
const WALLET_CALL_METHODS = Object.freeze([
  'eth_sendTransaction', 'eth_sendRawTransaction', 'eth_sign', 'eth_signTransaction',
  'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4',
  'wallet_sendTransaction', 'wallet_sendCalls',
]);

export function walletCallCount(methods) {
  return methods.filter(name => WALLET_CALL_METHODS.includes(name)).length;
}

function must(step, response) {
  if (response.status !== 0 || response.body?.ok !== true) {
    const detail = JSON.stringify(response.body ?? {}).slice(0, 600);
    throw new Error(`${step} failed status=${response.status} body=${detail}`);
  }
  return response.body;
}

async function countRows(host, sql, args = []) {
  const result = await host.query(sql, args);
  return Number(result.rows[0].n);
}

export async function runJourney() {
  const host = await machineHost();
  const directory = mkdtempSync(join(host.scratch, 'agl-'));
  const file = name => join(directory, name);
  let seq = 0;
  const secrets = {};
  try {
    const booted = await host.boot({participation: true, acceptedWorkPublic: false});
    const beforeMoney = await host.financialSnapshot();
    const rpcAtBoot = host.rpcMethods.length;
    const pins = ['--origin', host.origin, '--ca-file', host.caFile];
    async function cold(args) {
      try {
        const {stdout} = await exec(process.execPath, ['--max-old-space-size=256', CLIENT, ...args], {
          encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024,
          env: {...process.env, UV_THREADPOOL_SIZE: '1', OMP_NUM_THREADS: '1'},
        });
        return {status: 0, body: JSON.parse(stdout)};
      } catch (error) {
        const status = Number.isInteger(error.code) ? error.code : Number.isInteger(error.status) ? error.status : 1;
        let body = {};
        try { body = JSON.parse(error.stdout || '{}'); } catch { body = {}; }
        return {status, body};
      }
    }
    async function act(name, action, input) {
      const path = file(`${action}-${name}-${++seq}.json`);
      writeFileSync(path, JSON.stringify(input));
      return cold(['act', ...pins, '--secret-file', secrets[name], '--action', action, '--input', path]);
    }
    async function readOut(command, name, taskId, extra = []) {
      const path = file(`${command}-${name}-${++seq}.json`);
      const response = await cold([command, ...pins, '--secret-file', secrets[name], '--task-id', taskId, '--out', path, ...extra]);
      return {response, value: response.body?.ok ? JSON.parse(readFileSync(path, 'utf8')) : null, path};
    }
    const clientBytes = readFileSync(CLIENT);
    const clientSha = createHash('sha256').update(clientBytes).digest('hex');
    const hostProfile = await host.request(PREFIX + '/v1/market/profile', {method: 'GET'});
    const opened = await cold(['profile', ...pins]);
    must('profile', opened);
    const descriptor = {
      schema: 'neomorphic.machine-participation.acquisition.v1',
      version: '0.3.0',
      bytes: clientBytes.length,
      sha256: clientSha,
      source: {repository: SOURCE_REPOSITORY, commit: SOURCE_COMMIT, path: SOURCE_PATH},
      requiredProfile: {
        money: 'unfunded',
        participation: 'voluntary-artifact-v1',
        sourceSha256: opened.body.sourceSha256,
        hostSha256: opened.body.hostSha256,
      },
    };
    const descriptorPath = file('acquisition.json');
    writeFileSync(descriptorPath, JSON.stringify(descriptor));
    const descriptorSha = createHash('sha256').update(readFileSync(descriptorPath)).digest('hex');
    const acquire = ['--descriptor', descriptorPath, '--descriptor-sha256', descriptorSha, '--source-repository', SOURCE_REPOSITORY, '--source-commit', SOURCE_COMMIT, '--source-path', SOURCE_PATH];
    const accounts = [
      ['A', 'requester', 'SYNTHETIC requester A'],
      ['B', 'contributor', 'SYNTHETIC contributor B'],
      ['C', 'requester', 'SYNTHETIC requester C'],
      ['D', 'requester', 'SYNTHETIC stranger D'],
    ];
    for (const [name, role, displayName] of accounts) {
      secrets[name] = file(`secret-${name}.json`);
      const created = await cold(['signup', ...pins, '--secret-file', secrets[name], '--display-name', displayName, '--role', role, ...acquire]);
      must(`signup ${name}`, created);
    }
    const accountId = name => JSON.parse(readFileSync(secrets[name], 'utf8')).accountId;
    const quotesBefore = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_quotes`);
    const fundingBefore = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_funding`);
    const capturesBefore = await countRows(host, `SELECT count(*)::int AS n FROM hosted_wallet_market.captures`);
    const walletsBefore = await countRows(host, `SELECT count(*)::int AS n FROM hosted_wallet_market.wallets`);

    // H-B: requester A posts a need, contributor B delivers, A accepts. Fee is computed locally.
    const delegationPost = must('H-B post', await cold(['post', ...pins, '--secret-file', secrets.A, '--title', NEED_DELEGATION.title, '--summary', NEED_DELEGATION.summary, '--criterion', NEED_DELEGATION.criterion]));
    const delegationId = delegationPost.taskId;
    must('H-B interest', await cold(['interest', ...pins, '--secret-file', secrets.B, '--task-id', delegationId, '--note', 'Synthetic contributor B offers to label the dock handoff.']));
    const delegationProposals = await readOut('proposals', 'A', delegationId);
    must('H-B proposals', delegationProposals.response);
    const contributorProposals = await readOut('proposals', 'B', delegationId);
    const missingRequest = await act('A', 'offerVoluntary', {
      taskId: delegationId, contributorId: accountId('B'), authorizedToRequest: false, rights: RIGHTS_DELEGATION,
    });
    let delegation = must('H-B offer', await act('A', 'offerVoluntary', {
      taskId: delegationId, contributorId: accountId('B'), authorizedToRequest: true, rights: RIGHTS_DELEGATION,
    }));
    const delegationSpec = await readOut('inspect', 'B', delegationId);
    must('H-B inspect', delegationSpec.response);
    const missingShare = await act('B', 'assentVoluntary', {
      taskId: delegationId, termsDigest: delegation.termsDigest, expectedRevision: delegation.revision,
      authorizedToShare: false, spec: delegationSpec.value.spec,
    });
    delegation = must('H-B assent', await act('B', 'assentVoluntary', {
      taskId: delegationId, termsDigest: delegation.termsDigest, expectedRevision: delegation.revision,
      authorizedToShare: true, spec: delegationSpec.value.spec,
    }));
    const delegationEvidence = evidenceDelegation();
    delegation = must('H-B deliver', await act('B', 'deliverVoluntary', {
      taskId: delegationId, termsDigest: delegation.termsDigest, expectedRevision: delegation.revision,
      evidence: delegationEvidence,
    }));
    const wrongReview = await act('D', 'reviewVoluntary', {
      taskId: delegationId, termsDigest: delegation.termsDigest, expectedRevision: delegation.revision,
      artifactDigest: delegation.artifactDigest, accepted: true, exportAuthorized: true,
      reason: 'Synthetic stranger D cannot accept another requester need.',
    });
    delegation = must('H-B review', await act('A', 'reviewVoluntary', {
      taskId: delegationId, termsDigest: delegation.termsDigest, expectedRevision: delegation.revision,
      artifactDigest: delegation.artifactDigest, accepted: true, exportAuthorized: false,
      reason: 'The dock label matches the unfunded delegation and is accepted without export.',
    }));
    const missingExport = await act('A', 'grantVoluntary', {
      taskId: delegationId, termsDigest: delegation.termsDigest, expectedRevision: delegation.revision,
      consumerId: accountId('C'),
    });
    const fee = unsentFeeObservation();
    const fund = await cold(['fund', ...pins, '--secret-file', secrets.A]);

    // H-A: accepted artifact for implementation X, granted to requester C, applied to a changed Y input.
    const sourcePost = must('H-A post', await cold(['post', ...pins, '--secret-file', secrets.A, '--title', NEED_X.title, '--summary', NEED_X.summary, '--criterion', NEED_X.criterion]));
    const sourceId = sourcePost.taskId;
    must('H-A interest', await cold(['interest', ...pins, '--secret-file', secrets.B, '--task-id', sourceId, '--note', 'Synthetic contributor B offers the roster rename for implementation X.']));
    const sourceProposals = await readOut('proposals', 'A', sourceId);
    must('H-A proposals', sourceProposals.response);
    let source = must('H-A offer', await act('A', 'offerVoluntary', {
      taskId: sourceId, contributorId: accountId('B'), authorizedToRequest: true, rights: RIGHTS_X,
    }));
    const sourceSpec = await readOut('inspect', 'B', sourceId);
    must('H-A inspect', sourceSpec.response);
    source = must('H-A assent', await act('B', 'assentVoluntary', {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision,
      authorizedToShare: true, spec: sourceSpec.value.spec,
    }));
    const rosterEvidence = evidenceX();
    source = must('H-A deliver', await act('B', 'deliverVoluntary', {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision, evidence: rosterEvidence,
    }));
    source = must('H-A review', await act('A', 'reviewVoluntary', {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision,
      artifactDigest: source.artifactDigest, accepted: true, exportAuthorized: true,
      reason: 'The roster rename matches implementation X and may be granted to another requester.',
    }));
    const strangerExport = await readOut('export', 'D', sourceId);
    const contributorGrant = await act('B', 'grantVoluntary', {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision, consumerId: accountId('C'),
    });
    const missingGrant = await readOut('export', 'C', sourceId);
    const strangerPost = must('stranger post', await cold(['post', ...pins, '--secret-file', secrets.D, '--title', NEED_STRANGER.title, '--summary', NEED_STRANGER.summary, '--criterion', NEED_STRANGER.criterion]));
    const strangerUse = await act('D', 'useVoluntary', {
      taskId: sourceId, laterTaskId: strangerPost.taskId, artifactDigest: source.artifactDigest,
      decision: 'Synthetic stranger D records a handback without a grant.',
    });
    source = must('H-A grant', await act('A', 'grantVoluntary', {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision, consumerId: accountId('C'),
    }));
    const exported = await readOut('export', 'C', sourceId);
    must('H-A export', exported.response);
    const applied = applyRosterRename(exported.value.evidence, CHANGED_INPUT);
    const laterPost = must('H-A later post', await cold(['post', ...pins, '--secret-file', secrets.C, '--title', NEED_Y.title, '--summary', NEED_Y.summary, '--criterion', NEED_Y.criterion]));
    const decision = handbackDecision(applied.applied);
    const idempotencyBefore = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`);
    const useBefore = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`, [sourceId]);
    const transitionBefore = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='transition' AND payload->>'action'='useVoluntary'`, [sourceId]);
    host.fault.dropAction = 'useVoluntary';
    const lost = await act('C', 'useVoluntary', {
      taskId: sourceId, laterTaskId: laterPost.taskId, artifactDigest: exported.value.artifactDigest, decision,
    });
    const dropConsumed = host.fault.dropAction === null;
    const useAfterLost = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`, [sourceId]);
    const idempotencyAfterLost = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`);
    host.fault.dropAction = 'useVoluntary';
    const recovered = await cold(['readback', ...pins, '--secret-file', secrets.C, '--operation', 'useVoluntary']);
    const secondPostBlocked = host.fault.dropAction === 'useVoluntary';
    host.fault.dropAction = null;
    const useAfterReadback = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`, [sourceId]);
    const transitionAfter = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='transition' AND payload->>'action'='useVoluntary'`, [sourceId]);
    const idempotencyAfterReadback = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`);
    const storedRow = (await host.query(`SELECT id, requester_id, spec, voluntary FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [sourceId])).rows[0];
    const voluntaryBeforeFence = JSON.stringify(storedRow.voluntary);
    const fence = publicationFence(storedRow);
    const voluntaryAfterFence = JSON.stringify((await host.query(`SELECT voluntary FROM cj227_earned_work.ae14_market_tasks WHERE id=$1`, [sourceId])).rows[0].voluntary);
    const acceptedWorkGet = await host.request(PREFIX + '/v1/market/accepted-work', {method: 'GET'});
    const permitAttempt = await host.request(PREFIX + '/v1/market/permitAcceptedWork', {
      role: {cookie: JSON.parse(readFileSync(secrets.A, 'utf8')).cookie, csrf: JSON.parse(readFileSync(secrets.A, 'utf8')).csrf},
      body: {taskId: sourceId}, operationId: 'agl-permit-' + seq,
    });
    const profileAfter = await host.request(PREFIX + '/v1/market/profile', {method: 'GET'});
    const withdrawn = must('H-A withdraw', await act('A', 'withdrawVoluntary', {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision,
      reason: 'Synthetic requester A stops later retrieval of the roster rename.',
    }));
    const exportAfter = await readOut('export', 'C', sourceId);
    const useAfter = await act('C', 'useVoluntary', {
      taskId: sourceId, laterTaskId: laterPost.taskId, artifactDigest: exported.value.artifactDigest,
      decision: 'Synthetic requester C tries another handback after withdrawal.',
    });
    const inspectAfter = await readOut('inspect', 'A', sourceId);
    must('H-A inspect after withdrawal', inspectAfter.response);
    const consumers = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_voluntary_consumers WHERE task_id=$1`, [sourceId]);
    const useFinal = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`, [sourceId]);
    const publicMeasures = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE kind IN ('accepted_work_discovery','accepted_work_retrieval','accepted_work_continuation')`);
    const handbackRows = (await host.query(`SELECT payload FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`, [sourceId])).rows;
    const quotesAfter = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_quotes`);
    const fundingAfter = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_funding`);
    const capturesAfter = await countRows(host, `SELECT count(*)::int AS n FROM hosted_wallet_market.captures`);
    const walletsAfter = await countRows(host, `SELECT count(*)::int AS n FROM hosted_wallet_market.wallets`);
    const delegationQuotes = await countRows(host, `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_quotes WHERE task_id=$1`, [delegationId]);
    const afterMoney = await host.financialSnapshot();
    const names = (await host.query(`SELECT a.id, a.display_name, r.role FROM cj227_earned_work.journey_accounts a JOIN hosted_wallet_market.roles r ON r.account_id=a.id ORDER BY a.display_name`)).rows;
    return {
      clientSha256: clientSha,
      bootedSourceSha256: booted.sourceSha256,
      profile: {
        money: opened.body.money,
        signerAuthority: opened.body.signerAuthority,
        participation: opened.body.participation,
        sourceSha256: opened.body.sourceSha256,
        hostSha256: opened.body.hostSha256,
        acceptedWork: hostProfile.body?.value?.acceptedWork ?? null,
        publicReads: hostProfile.body?.value?.acceptedWork?.publicReads ?? null,
        mutationActions: hostProfile.body?.value?.mutationReceipts?.actions ?? null,
        profileAcceptedWorkAfter: profileAfter.body?.value?.acceptedWork ?? null,
        signerAfter: profileAfter.body?.value?.signerAuthority ?? null,
        hostProfileStatus: hostProfile.status,
      },
      accounts: names.map(row => ({accountId: row.id, displayName: row.display_name, role: row.role, synthetic: String(row.display_name).includes('SYNTHETIC')})),
      hb: {
        taskId: delegationId,
        state: delegation.state,
        paidWork: delegation.paidWork,
        artifactDigest: delegation.artifactDigest,
        evidence: delegationEvidence,
        proposals: delegationProposals.value,
        contributorProposalCode: contributorProposals.response.body?.code ?? null,
        refusals: {
          missingRequestConsent: missingRequest.body?.code ?? null,
          missingShareConsent: missingShare.body?.code ?? null,
          wrongAuthorityReview: wrongReview.body?.code ?? null,
          missingExportConsent: missingExport.body?.code ?? null,
        },
        fee,
        fund: {ok: fund.body?.ok ?? null, code: fund.body?.code ?? null, paidWork: fund.body?.paidWork ?? null, status: fund.status},
        delegationQuotes,
      },
      ha: {
        taskId: sourceId,
        laterTaskId: laterPost.taskId,
        strangerTaskId: strangerPost.taskId,
        artifactDigest: exported.value.artifactDigest,
        evidenceDigest: digest(exported.value.evidence),
        exportedEvidence: exported.value.evidence,
        relationship: exported.value.relationship,
        paidWork: exported.value.paidWork,
        rights: exported.value.terms?.rights ?? null,
        applied,
        changedInput: CHANGED_INPUT,
        proposals: sourceProposals.value,
        refusals: {
          strangerExport: strangerExport.response.body?.code ?? null,
          contributorGrant: contributorGrant.body?.code ?? null,
          missingGrant: missingGrant.response.body?.code ?? null,
          strangerUse: strangerUse.body?.code ?? null,
        },
        use: {
          lostStatus: lost.status,
          lostCode: lost.body?.code ?? null,
          lostNext: lost.body?.nextAction ?? null,
          dropConsumed,
          recoveredOk: recovered.body?.ok ?? false,
          recoveredRevision: recovered.body?.revision ?? null,
          recoveredArtifactDigest: recovered.body?.artifactDigest ?? null,
          recoveredPaidWork: recovered.body?.paidWork ?? null,
          secondPostBlocked,
          useBefore, useAfterLost, useAfterReadback, useFinal,
          transitionBefore, transitionAfter,
          idempotencyBefore, idempotencyAfterLost, idempotencyAfterReadback,
          decision: handbackRows[0]?.payload?.decision ?? null,
          verification: handbackRows[0]?.payload?.verification ?? null,
          independence: handbackRows[0]?.payload?.independence ?? null,
          measurePaidWork: handbackRows[0]?.payload?.paidWork ?? null,
        },
        publication: {
          ...fence,
          storedUnchanged: voluntaryBeforeFence === voluntaryAfterFence,
          acceptedWorkStatus: acceptedWorkGet.status,
          acceptedWorkCode: acceptedWorkGet.body?.code ?? null,
          permitStatus: permitAttempt.status,
          permitCode: permitAttempt.body?.code ?? null,
          publicMeasures,
        },
        withdrawal: {
          state: withdrawn.state,
          paidWork: withdrawn.paidWork,
          exportCode: exportAfter.response.body?.code ?? null,
          useCode: useAfter.body?.code ?? null,
          inspectState: inspectAfter.value?.state ?? null,
          inspectEvidence: inspectAfter.value?.evidence ?? null,
          consumers,
        },
      },
      money: {
        walletCalls: walletCallCount(host.rpcMethods),
        rpcMethods: [...host.rpcMethods],
        rpcAtBoot,
        signerAuthority: opened.body.signerAuthority === false && profileAfter.body?.value?.signerAuthority === false,
        snapshotUnchanged: JSON.stringify(beforeMoney) === JSON.stringify(afterMoney),
        quotesBefore, quotesAfter, fundingBefore, fundingAfter, capturesBefore, capturesAfter, walletsBefore, walletsAfter,
      },
    };
  } finally {
    rmSync(directory, {recursive: true, force: true});
    await host.close();
  }
}
