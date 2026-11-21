import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest} from '../runtime/agent-economy-foundation/dist/index.js';
import {usefulEvidence} from '../examples/participation-canary.mjs';
import {
  applyPermit, applyPublicationWithdrawal, proposalFrom, publicArtifactView, publicationText, publicationVisible,
} from '../src/accepted-work-publication.mjs';

const root = resolve(import.meta.dirname, '../../..');
const baselineCommit = 'e32c3f2ce4391ccba9e7d15a3fda0a65459406fd';
const gap = JSON.parse(readFileSync(new URL('./fixtures/h142010/empty-value-gap.json', import.meta.url), 'utf8'));
const corpus = JSON.parse(readFileSync(new URL('./fixtures/h142010/query-key-collision.json', import.meta.url), 'utf8'));
const source = 'a'.repeat(64);
const host = 'b'.repeat(64);
const taskId = 'market-' + 'c'.repeat(64);
const summary = 'Authorized query comparison kept for a later chosen consumer.';

function codeOf(error) {
  return error?.code || error?.codeName || error?.message;
}

function rowFor() {
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
      review: {requesterId: 'requester-1', artifactDigest: digest(evidence), accepted: true, exportAuthorized: false,
        reason: 'Private review reason text.', authority: 'requester_decision'},
    },
  };
}

function inputFor(row, publicArtifact, text = summary) {
  return {
    publicationConsent: true, summary: text, summaryDigest: digest(text),
    publicArtifact, publicArtifactDigest: digest(publicArtifact),
    termsDigest: row.voluntary.termsDigest, rightsDigest: digest(row.voluntary.terms.rights),
    artifactDigest: row.voluntary.artifact.digest,
  };
}

function refusal(run) {
  try {
    run();
    return null;
  } catch (error) {
    return codeOf(error);
  }
}

let baseline;
test('the installed nonempty predicate still refuses only the empty data scalar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h142010-baseline-'));
  mkdirSync(join(dir, 'src'));
  const bytes = execFileSync('git', ['-C', root, 'show', `${baselineCommit}:vendor/hosted-wallet-market/src/accepted-work-publication.mjs`], {maxBuffer: 1024 * 1024});
  assert.match(bytes.toString('utf8'), /value\.length >= 1/);
  writeFileSync(join(dir, 'src/accepted-work-publication.mjs'), bytes);
  symlinkSync(join(root, 'vendor/hosted-wallet-market/runtime'), join(dir, 'runtime'));
  baseline = await import(pathToFileURL(join(dir, 'src/accepted-work-publication.mjs')).href);
  const row = rowFor();
  assert.equal(refusal(() => baseline.proposalFrom(row, inputFor(row, gap))), 'publication_refused');
  const kept = structuredClone(gap);
  kept.case.left[0][1] = 'kept';
  assert.equal(refusal(() => baseline.proposalFrom(row, inputFor(row, kept))), null);
  assert.equal(refusal(() => baseline.proposalFrom(row, inputFor(row, corpus))), null);
  assert.equal(refusal(() => baseline.proposalFrom(row, inputFor(row, {note: ''}, ''))), 'publication_refused');
  assert.equal(publicationText('', 800), false);
});

test('empty data and the original countercase pass while empty copy and keys stay refused', () => {
  const row = rowFor();
  assert.equal(proposalFrom(row, inputFor(row, gap)).proposal.publicArtifactDigest, digest(gap));
  assert.equal(proposalFrom(row, inputFor(row, corpus)).proposal.publicArtifactDigest, digest(corpus));
  assert.equal(proposalFrom(row, inputFor(row, {holds: ''})).proposal.publicArtifact.holds, '');
  assert.equal(proposalFrom(row, inputFor(row, {note: 'x'.repeat(500)})).proposal.publicArtifact.note.length, 500);
  assert.equal(refusal(() => proposalFrom(row, inputFor(row, {note: ''}, ''))), 'publication_refused');
  assert.equal(refusal(() => proposalFrom(row, inputFor(row, {'': 'kept'}))), 'publication_refused');
  assert.equal(refusal(() => proposalFrom(row, inputFor(row, {note: 'x'.repeat(501)}))), 'publication_refused');
  assert.equal(refusal(() => proposalFrom(row, inputFor(row, {note: 'a=1%262'}))), 'publication_refused');
  assert.equal(refusal(() => proposalFrom(row, inputFor(row, {note: 'Send 10 USDC.'}))), 'publication_refused');
  assert.equal(refusal(() => proposalFrom(row, inputFor(row, {note: Number.POSITIVE_INFINITY}))), 'publication_refused');
  const deep = {a: {b: {c: {d: {e: {f: 'too deep'}}}}}};
  assert.equal(refusal(() => proposalFrom(row, inputFor(row, deep))), 'publication_refused');
  const metadata = rowFor();
  metadata.voluntary.terms.rights = {...metadata.voluntary.terms.rights, attribution: ''};
  metadata.voluntary.termsDigest = digest(metadata.voluntary.terms);
  assert.equal(refusal(() => proposalFrom(metadata, inputFor(metadata, {holds: ''}))), 'publication_refused');
  assert.equal(refusal(() => proposalFrom(row, inputFor(row, {note: row.spec.summary}))), 'private_field_refused');
  assert.equal(refusal(() => proposalFrom(row, inputFor(row, row.voluntary.artifact.evidence))), 'private_evidence_refused');
  assert.equal(publicationText(summary, 800), true);
  assert.equal(publicationText('', 800), false);
});

test('one consent hides the empty artifact and both consents publish the same bytes', () => {
  const row = rowFor();
  const input = inputFor(row, gap);
  assert.equal(applyPermit(row, 'requester-1', input), false);
  assert.equal(publicationVisible(row), false);
  assert.equal(applyPermit(row, 'contributor-1', input), true);
  assert.deepEqual(publicArtifactView(row).publicArtifact, gap);
  assert.equal(JSON.stringify(publicArtifactView(row)).includes('requester-1'), false);
  assert.equal(JSON.stringify(publicArtifactView(row)).includes('Private spec summary'), false);
  applyPublicationWithdrawal(row, 'contributor-1', 'Stop the public artifact.');
  assert.equal(publicationVisible(row), false);
  assert.equal(applyPermit(row, 'requester-1', input), false);
  assert.equal(publicationVisible(row), false);
  assert.equal(applyPermit(row, 'contributor-1', input), true);
  assert.equal(publicArtifactView(row).publicArtifact.case.left[0][1], '');
  const older = rowFor();
  const mapping = {mapping: [{from: 'external_id', to: 'id'}], version: 1};
  const oldInput = inputFor(older, mapping, 'Approved reusable column-map sample.');
  applyPermit(older, 'requester-1', oldInput);
  assert.equal(applyPermit(older, 'contributor-1', oldInput), true);
  assert.deepEqual(publicArtifactView(older).publicArtifact, mapping);
});
