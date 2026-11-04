import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {proposalFrom} from '../../../vendor/hosted-wallet-market/src/accepted-work-publication.mjs';
import {digest} from '../../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';
import {usefulEvidence} from '../../../vendor/hosted-wallet-market/examples/participation-canary.mjs';

const dir = new URL('./', import.meta.url);
const artifact = JSON.parse(readFileSync(new URL('query-key-seed.json', dir), 'utf8'));
const summary = readFileSync(new URL('query-key-summary.txt', dir), 'utf8');
const rights = JSON.parse(readFileSync(new URL('query-key-rights.json', dir), 'utf8'));
const evidence = usefulEvidence();

function stringCount(value) {
  if (typeof value === 'string') return 1;
  if (Array.isArray(value)) return value.reduce((n, item) => n + stringCount(item), 0);
  if (value && typeof value === 'object') return Object.values(value).reduce((n, item) => n + stringCount(item), 0);
  return 0;
}

function row() {
  return {
    requester_id: 'requester-fixture',
    spec: {title: 'retained query comparison', summary: 'Private retained mapping kept off the public page.', criteria: ['preserve-mapping']},
    voluntary: {
      review: {accepted: true, reason: 'The exact synthetic mappings meet the requested compatibility criterion.'},
      artifact: {digest: digest(evidence), evidence},
      terms: {rights},
      termsDigest: null,
    },
  };
}

test('the fence-bound query-key seed passes proposalFrom inside the current limits', () => {
  assert.equal(artifact.license, 'CC0-1.0');
  assert.equal(artifact.selection, 'fence-bound');
  assert.equal(artifact.cases.length, 9);
  assert.equal(artifact.cases.length === 25, false);
  assert.equal(stringCount(artifact), 40);
  assert.equal(Buffer.byteLength(JSON.stringify(artifact)) <= 4096, true);
  assert.equal(JSON.stringify(artifact).includes('%2'), false);
  assert.equal(artifact.cases.find(item => item.id === 'percent-encoded-refusal').stored, false);
  assert.equal(artifact.cases.find(item => item.id === 'percent-encoded-refusal').code, 'representation_refused');
  const direct = JSON.parse(readFileSync(new URL('callers/direct-lot.json', dir), 'utf8'));
  const bare = artifact.cases.find(item => item.id === 'bare-versus-blank');
  assert.equal(bare.path, direct.left.path);
  assert.equal(artifact.bank[bare.left[0].k], direct.left.pairs[0].key);
  assert.equal(artifact.bank[bare.left[0].v], direct.left.pairs[0].value);
  assert.equal(bare.left[1].form, 'bare');
  assert.equal(artifact.bank[bare.right[1].k], direct.right.pairs[1].key);
  assert.equal(bare.right[1].form, 'blank');
  const input = {
    publicationConsent: true,
    summary,
    summaryDigest: digest(summary),
    publicArtifact: artifact,
    publicArtifactDigest: digest(artifact),
    termsDigest: null,
    rightsDigest: digest(rights),
    artifactDigest: digest(evidence),
  };
  const proposal = proposalFrom(row(), input);
  assert.equal(proposal.proposal.publicArtifactDigest, digest(artifact));
  assert.equal(digest(artifact) === digest(evidence), false);
  assert.equal(createHash('sha256').update(summary).digest('hex') !== digest(summary), true);
});

test('one more artifact string is still publication_refused', () => {
  const over = structuredClone(artifact);
  over.cases.push({id: 'one-more-string', stored: false});
  assert.equal(stringCount(over), 41);
  const input = {
    publicationConsent: true,
    summary,
    summaryDigest: digest(summary),
    publicArtifact: over,
    publicArtifactDigest: digest(over),
    termsDigest: null,
    rightsDigest: digest(rights),
    artifactDigest: digest(evidence),
  };
  assert.throws(() => proposalFrom(row(), input), /publication_refused/);
});
