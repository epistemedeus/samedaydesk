import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../runtime/agent-economy-foundation/dist/index.js';
import {usefulEvidence} from '../examples/participation-canary.mjs';
import {voluntaryMarket} from '../src/voluntary-market.mjs';
import {mountedPublicRead} from '../src/public-route-limit.mjs';
import {
  applyPermit, applyPublicationWithdrawal, forbiddenTokens, proposalFrom, publicArtifactView, publicView, publicationText, publicationVisible,
} from '../src/accepted-work-publication.mjs';

const source = 'a'.repeat(64);
const host = 'b'.repeat(64);
const taskId = 'market-' + 'c'.repeat(64);

function codeOf(error) {
  return error?.code || error?.codeName || error?.message;
}

function acceptedRow({exportAuthorized = false, accepted = true} = {}) {
  const evidence = usefulEvidence();
  const spec = {title: 'Private vector title', summary: 'Private spec summary text.', criteria: ['preserve-mapping'], payableKinds: ['usable']};
  const rights = {license: 'CC0-1.0', scope: 'synthetic-or-authorized-reusable-artifact', attribution: 'Synthetic attribution'};
  const terms = {
    schema: 'pilot.machine-market.voluntary-terms.v1', origin: 'https://market.example.test', tenantId: 'tenant-a',
    taskId, requesterId: 'requester-1', contributorId: 'contributor-1', specDigest: digest(spec), rights,
    sourceSha256: source, hostSha256: host, funding: 'voluntary', contributionRequired: false,
    paymentAuthority: 'none', requesterReviewRequired: true, exportRequiresBothParties: true,
  };
  return {
    id: taskId, tenant_id: 'tenant-a', requester_id: 'requester-1', spec,
    voluntary: {
      revision: 4, terms, termsDigest: digest(terms), assented: true,
      artifact: {evidence, digest: digest(evidence)},
      review: accepted ? {requesterId: 'requester-1', artifactDigest: digest(evidence), accepted: true, exportAuthorized,
        reason: 'Private review reason text.', authority: 'requester_decision'} : null,
    },
  };
}

function inputFor(row, summary, publicArtifact = {label: 'note', text: 'A later chosen consumer can ask for a private export.'}) {
  return {
    taskId, termsDigest: row.voluntary.termsDigest, expectedRevision: row.voluntary.revision,
    summary, summaryDigest: digest(summary), publicArtifact, publicArtifactDigest: digest(publicArtifact),
    rightsDigest: digest(row.voluntary.terms.rights), artifactDigest: row.voluntary.artifact.digest,
    publicationConsent: true,
  };
}

test('publication stays private until both parties permit the same bytes', () => {
  const row = acceptedRow();
  assert.equal(publicationVisible(row), false);
  assert.equal(publicView(row), null);
  const summary = 'Authorized mapping kept for a later chosen consumer.';
  const requester = inputFor(row, summary);
  assert.equal(applyPermit(row, 'requester-1', requester), false);
  assert.equal(publicationVisible(row), false);
  assert.equal(publicView(row), null);
  assert.equal(applyPermit(row, 'contributor-1', requester), true);
  const view = publicView(row);
  assert.equal(view.summary, summary);
  assert.equal(view.summaryDigest, digest(summary));
  assert.equal(view.termsDigest, row.voluntary.termsDigest);
  assert.equal(view.artifactDigest, row.voluntary.artifact.digest);
  assert.equal(view.continuation.permissionedExport, '/v1/market/exportVoluntary');
  assert.equal(view.rights.attribution, 'Synthetic attribution');
  assert.equal('publicArtifact' in view, false);
  assert.equal(publicArtifactView(row).publicArtifact.label, 'note');
  assert.equal(JSON.stringify(view).includes('requester-1'), false);
  assert.equal(JSON.stringify(view).includes('Private review reason'), false);
  assert.equal(JSON.stringify(view).includes('Private spec summary'), false);
  assert.equal(JSON.stringify(view).includes(usefulEvidence().businessResult), false);
  assert.equal(row.voluntary.review.exportAuthorized, false);
});

test('withdrawal, digest change, and one-sided replacement hide the row', () => {
  const row = acceptedRow({exportAuthorized: true});
  const first = inputFor(row, 'First authorized public summary.');
  applyPermit(row, 'requester-1', first);
  applyPermit(row, 'contributor-1', first);
  assert.equal(publicationVisible(row), true);
  const second = inputFor(row, 'Second authorized public summary.');
  assert.equal(applyPermit(row, 'requester-1', second), false);
  assert.equal(publicationVisible(row), false);
  assert.equal(applyPermit(row, 'contributor-1', second), true);
  assert.equal(publicView(row).summary, 'Second authorized public summary.');
  row.voluntary.artifact.digest = 'd'.repeat(64);
  assert.equal(publicationVisible(row), false);
  row.voluntary.artifact.digest = digest(row.voluntary.artifact.evidence);
  assert.equal(publicationVisible(row), true);
  applyPublicationWithdrawal(row, 'contributor-1', 'Stop the public summary.');
  assert.equal(publicationVisible(row), false);
  assert.equal(applyPermit(row, 'requester-1', second), false);
  assert.equal(publicationVisible(row), false);
});

test('malicious copy, private evidence, and missing consent are refused', () => {
  const row = acceptedRow();
  const bad = inputFor(row, '<script>alert(1)</script>');
  assert.throws(() => proposalFrom(row, bad), error => codeOf(error) === 'publication_refused');
  const priced = inputFor(row, 'Send 10 USDC for this mapping.');
  assert.throws(() => proposalFrom(row, priced), error => codeOf(error) === 'publication_refused');
  const named = inputFor(row, 'Account requester-1 approved this text.');
  assert.throws(() => proposalFrom(row, named), error => codeOf(error) === 'private_field_refused');
  const copied = inputFor(row, 'Different public words.', row.voluntary.artifact.evidence);
  assert.throws(() => proposalFrom(row, copied), error => codeOf(error) === 'private_evidence_refused');
  const nested = inputFor(row, 'Different public words.', {note: row.voluntary.review.reason});
  assert.throws(() => proposalFrom(row, nested), error => codeOf(error) === 'private_field_refused');
  const unpaid = inputFor(row, 'Authorized mapping kept for a later chosen consumer.');
  unpaid.publicationConsent = false;
  assert.throws(() => proposalFrom(row, unpaid), error => codeOf(error) === 'publication_consent_required');
  const pending = acceptedRow({accepted: false});
  assert.throws(() => proposalFrom(pending, inputFor(pending, 'Authorized mapping kept for a later chosen consumer.')), error => codeOf(error) === 'not_accepted');
  assert.equal(publicationText('https://example.com/secret', 200), false);
  assert.equal(forbiddenTokens(row).some(token => token === 'Private spec summary text.'), true);
});

test('anonymous accepted-work reads join the mounted limiter', () => {
  const prefix = '/api/neomorphic-contributor-journey';
  assert.equal(mountedPublicRead(prefix, prefix + '/v1/market/accepted-work', 'GET'), true);
  assert.equal(mountedPublicRead(prefix, prefix + '/v1/market/accepted-work/' + taskId, 'GET'), true);
  assert.equal(mountedPublicRead(prefix, prefix + '/v1/market/accepted-work/' + taskId + '/artifact', 'GET'), true);
  assert.equal(mountedPublicRead(prefix, prefix + '/v1/market/accepted-work/' + taskId, 'POST'), false);
});

test('the publication gate stays off unless the caller opts in', async () => {
  const market = voluntaryMarket({
    market: {},
    capability: {money: 'unfunded', participation: 'voluntary-artifact-v1', sourceSha256: source, hostSha256: host, origin: 'https://market.example.test'},
  });
  assert.equal(market.actions.includes('permitAcceptedWork'), false);
  assert.equal(market.descriptor.actions.includes('permitAcceptedWork'), false);
  await assert.rejects(
    () => market.invoke({tenantId: 'tenant-a', actorId: 'requester-1'}, 'permitAcceptedWork', {taskId}, 'operation-12345678'),
    error => codeOf(error) === 'accepted_work_public_unavailable',
  );
  await assert.rejects(
    () => market.invoke({tenantId: 'tenant-a', actorId: 'requester-1'}, 'readbackVoluntary', {action: 'permitAcceptedWork', input: {taskId}}, 'operation-12345678'),
    error => codeOf(error) === 'accepted_work_public_unavailable',
  );
});
