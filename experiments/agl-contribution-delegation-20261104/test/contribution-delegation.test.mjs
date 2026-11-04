import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, resolve} from 'node:path';
import {digest} from '../../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';
import {usefulEvidence, compatibilityVector} from '../../../vendor/hosted-wallet-market/examples/participation-canary.mjs';
import {FEE_BPS, feePerCapture, quoteEconomics} from '../../../vendor/hosted-wallet-market/src/fee.mjs';
import {
  CHANGED_INPUT, EXPECTED_APPLIED, NEED_DELEGATION, NEED_X, NEED_Y,
  applyRosterRename, evidenceDelegation, evidenceX, publicationFence, unsentFeeObservation,
} from '../inputs.mjs';
import {runJourney, walletCallCount} from '../harness.mjs';

const root = resolve(import.meta.dirname, '../../..');
const CLIENT = join(root, 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs');
const CLIENT_SHA = '38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4';

test('changed ordinary inputs are distinct from the installed canary and fixtures', () => {
  const roster = evidenceX();
  const label = evidenceDelegation();
  assert.notDeepEqual(roster, usefulEvidence());
  assert.notDeepEqual(label, usefulEvidence());
  assert.equal(JSON.stringify(roster).includes(compatibilityVector.schema), false);
  assert.equal(JSON.stringify(label).includes('preserve-mapping'), false);
  assert.equal(JSON.stringify(NEED_X).includes('preserve-mapping'), false);
  assert.equal(JSON.stringify(NEED_DELEGATION).includes(NEED_X.title), false);
  assert.notEqual(NEED_X.criterion, NEED_Y.criterion);
  assert.notEqual(NEED_X.criterion, NEED_DELEGATION.criterion);
  const applied = applyRosterRename(roster, CHANGED_INPUT);
  assert.deepEqual(applied.applied, EXPECTED_APPLIED);
  assert.notDeepEqual(CHANGED_INPUT, applied.sampleInput);
  assert.notDeepEqual(applied.applied, applied.sampleOutput);
  assert.deepEqual(applied.unmapped, ['dock']);
  assert.equal(Object.hasOwn(applied.applied, 'dock'), false);
  const found = spawnSync('rg', ['-l', 'agl.synthetic.shift-roster-rename.v1', '--glob', '!experiments/agl-contribution-delegation-20261104/**', root], {encoding: 'utf8'});
  assert.equal(found.status, 1);
  assert.equal(found.stdout, '');
});

test('the fee module computes an unsent platform fee', () => {
  const fee = unsentFeeObservation();
  const economics = quoteEconomics({gross: '2500000', railCost: '0'});
  assert.equal(fee.module, 'vendor/hosted-wallet-market/src/fee.mjs');
  assert.equal(fee.feeBps, FEE_BPS);
  assert.equal(fee.platformFeeAtomic, economics.platformFeeAtomic);
  assert.equal(fee.platformFeeAtomic, feePerCapture('2500000'));
  assert.equal(fee.contributorNetAtomic, economics.contributorNetAtomic);
  assert.equal(fee.exactFivePercentAtEveryAtomicAmount, false);
  assert.equal(fee.persisted, false);
  assert.equal(fee.moneyMoved, false);
  assert.equal(fee.settlementSubmitted, false);
  assert.equal(walletCallCount(['eth_chainId', 'eth_call']), 0);
  assert.equal(walletCallCount(['eth_sendRawTransaction']), 1);
});

test('the publication checker refuses private data and missing consent on a clone', () => {
  const evidence = evidenceX();
  const spec = {title: NEED_X.title, summary: NEED_X.summary, criteria: [NEED_X.criterion], payableKinds: ['usable']};
  const rights = {license: 'CC0-1.0', scope: 'synthetic-or-authorized-reusable-artifact', attribution: 'SYNTHETIC lab roster rename'};
  const terms = {
    schema: 'pilot.machine-market.voluntary-terms.v1', origin: 'https://127.0.0.1', tenantId: 'synthetic-tenant',
    taskId: 'market-' + 'a'.repeat(64), requesterId: 'synthetic-requester-a', contributorId: 'synthetic-contributor-b',
    specDigest: digest(spec), rights, sourceSha256: 'ab'.repeat(32), hostSha256: 'cd'.repeat(32),
    funding: 'voluntary', contributionRequired: false, paymentAuthority: 'none', requesterReviewRequired: true,
    exportRequiresBothParties: true,
  };
  const row = {
    id: terms.taskId, requester_id: terms.requesterId, spec,
    voluntary: {
      revision: 4, terms, termsDigest: digest(terms),
      artifact: {evidence, digest: digest(evidence)},
      review: {accepted: true, exportAuthorized: true, artifactDigest: digest(evidence), requesterId: terms.requesterId, reason: 'Synthetic acceptance stays private.'},
    },
  };
  const fence = publicationFence(row);
  assert.equal(fence.cleanAccepted, true);
  assert.equal(fence.privateSummaryCode, 'private_field_refused');
  assert.equal(fence.privateKeyCode, 'private_field_refused');
  assert.equal(fence.privateTextCode, 'private_field_refused');
  assert.equal(fence.missingConsentCode, 'publication_consent_required');
  assert.equal(createHash('sha256').update(readFileSync(CLIENT)).digest('hex'), CLIENT_SHA);
});

test('H-A handback and H-B delegation run on the disposable unfunded host', {timeout: 420000}, async () => {
  const report = await runJourney();
  assert.equal(report.clientSha256, CLIENT_SHA);
  assert.equal(report.profile.money, 'unfunded');
  assert.equal(report.profile.signerAuthority, false);
  assert.equal(report.profile.participation, 'voluntary-artifact-v1');
  assert.equal(report.profile.acceptedWork, null);
  assert.equal(report.profile.publicReads, null);
  assert.equal(report.profile.profileAcceptedWorkAfter, null);
  assert.equal(report.profile.signerAfter, false);
  assert.deepEqual(report.profile.mutationActions, ['post', 'interest']);
  assert.equal(report.accounts.length >= 3, true);
  assert.equal(new Set(report.accounts.map(row => row.accountId)).size, report.accounts.length);
  assert.equal(report.accounts.every(row => row.synthetic && row.displayName.startsWith('SYNTHETIC ')), true);

  assert.equal(report.hb.state, 'accepted');
  assert.equal(report.hb.paidWork, false);
  assert.equal(report.hb.proposals.items.length, 1);
  assert.equal(report.hb.proposals.items[0].note, 'Synthetic contributor B offers to label the dock handoff.');
  assert.equal(report.hb.contributorProposalCode, 'requester_required');
  assert.equal(report.hb.refusals.missingRequestConsent, 'independent_role_required');
  assert.equal(report.hb.refusals.missingShareConsent, 'contributor_consent_required');
  assert.equal(report.hb.refusals.wrongAuthorityReview, 'forbidden');
  assert.equal(report.hb.refusals.missingExportConsent, 'voluntary_export_not_authorized');
  assert.deepEqual(report.hb.evidence, evidenceDelegation());
  assert.equal(report.hb.fee.persisted, false);
  assert.equal(report.hb.fee.moneyMoved, false);
  assert.equal(report.hb.fee.platformFeeAtomic, quoteEconomics({gross: '2500000', railCost: '0'}).platformFeeAtomic);
  assert.equal(report.hb.fee.feeBps, FEE_BPS);
  assert.equal(report.hb.fund.ok, false);
  assert.equal(report.hb.fund.paidWork, false);
  assert.equal(report.hb.fund.code, 'qualified_selection_required');
  assert.equal(report.hb.delegationQuotes, 0);
  assert.notEqual(report.hb.taskId, report.ha.taskId);

  const applied = applyRosterRename(report.ha.exportedEvidence, CHANGED_INPUT);
  assert.deepEqual(applied.applied, EXPECTED_APPLIED);
  assert.deepEqual(report.ha.applied.applied, EXPECTED_APPLIED);
  assert.equal(report.ha.evidenceDigest, report.ha.artifactDigest);
  assert.equal(digest(report.ha.exportedEvidence), digest(evidenceX()));
  assert.equal(report.ha.relationship, 'authorized_later_consumer');
  assert.equal(report.ha.paidWork, false);
  assert.equal(report.ha.rights.license, 'CC0-1.0');
  assert.equal(report.ha.rights.scope, 'synthetic-or-authorized-reusable-artifact');
  assert.notEqual(report.ha.laterTaskId, report.ha.taskId);
  assert.equal(report.ha.proposals.items.length, 1);
  assert.equal(report.ha.refusals.strangerExport, 'forbidden');
  assert.equal(report.ha.refusals.contributorGrant, 'requester_required');
  assert.equal(report.ha.refusals.missingGrant, 'forbidden');
  assert.equal(report.ha.refusals.strangerUse, 'forbidden');
  assert.equal(report.ha.use.lostStatus, 2);
  assert.equal(report.ha.use.lostCode, 'unknown_outcome');
  assert.equal(report.ha.use.lostNext, 'readback');
  assert.equal(report.ha.use.dropConsumed, true);
  assert.equal(report.ha.use.recoveredOk, true);
  assert.equal(report.ha.use.recoveredArtifactDigest, report.ha.artifactDigest);
  assert.equal(report.ha.use.recoveredPaidWork, false);
  assert.equal(report.ha.use.secondPostBlocked, true);
  assert.equal(report.ha.use.useBefore, 0);
  assert.equal(report.ha.use.useAfterLost, 1);
  assert.equal(report.ha.use.useAfterReadback, 1);
  assert.equal(report.ha.use.useFinal, 1);
  assert.equal(report.ha.use.transitionBefore, 0);
  assert.equal(report.ha.use.transitionAfter, 1);
  assert.equal(report.ha.use.idempotencyAfterLost, report.ha.use.idempotencyBefore + 1);
  assert.equal(report.ha.use.idempotencyAfterReadback, report.ha.use.idempotencyAfterLost);
  assert.equal(report.ha.use.decision.includes('SYN-Y-441'), true);
  assert.equal(report.ha.use.verification, 'authenticated_self_report');
  assert.equal(report.ha.use.independence, 'unknown');
  assert.equal(report.ha.use.measurePaidWork, false);
  assert.equal(report.ha.publication.privateSummaryCode, 'private_field_refused');
  assert.equal(report.ha.publication.privateKeyCode, 'private_field_refused');
  assert.equal(report.ha.publication.privateTextCode, 'private_field_refused');
  assert.equal(report.ha.publication.missingConsentCode, 'publication_consent_required');
  assert.equal(report.ha.publication.cleanAccepted, true);
  assert.equal(report.ha.publication.storedUnchanged, true);
  assert.equal(report.ha.publication.acceptedWorkStatus, 404);
  assert.equal(report.ha.publication.permitStatus, 404);
  assert.equal(report.ha.publication.permitCode, 'not_found');
  assert.equal(report.ha.publication.publicMeasures, 0);
  assert.equal(report.ha.withdrawal.state, 'withdrawn');
  assert.equal(report.ha.withdrawal.paidWork, false);
  assert.equal(report.ha.withdrawal.exportCode, 'voluntary_withdrawn');
  assert.equal(report.ha.withdrawal.useCode, 'voluntary_withdrawn');
  assert.equal(report.ha.withdrawal.inspectState, 'withdrawn');
  assert.equal(report.ha.withdrawal.inspectEvidence, null);
  assert.equal(report.ha.withdrawal.consumers, 0);

  assert.equal(report.money.walletCalls, 0);
  assert.equal(report.money.signerAuthority, true);
  assert.equal(report.money.snapshotUnchanged, true);
  assert.equal(report.money.quotesAfter, report.money.quotesBefore);
  assert.equal(report.money.fundingAfter, report.money.fundingBefore);
  assert.equal(report.money.capturesAfter, report.money.capturesBefore);
  assert.equal(report.money.walletsAfter, report.money.walletsBefore);
  assert.equal(report.money.rpcMethods.some(name => name.startsWith('eth_send') || name.includes('sign')), false);
});
