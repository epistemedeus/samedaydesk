import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {proposalFrom} from '../../../vendor/hosted-wallet-market/src/accepted-work-publication.mjs';
import {digest} from '../../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js';
import {usefulEvidence} from '../../../vendor/hosted-wallet-market/examples/participation-canary.mjs';

const dir = new URL('./', import.meta.url);
const bytes = readFileSync(new URL('query-key-caller.json', dir));
const artifact = JSON.parse(bytes.toString('utf8'));
const summary = readFileSync(new URL('query-key-summary.txt', dir), 'utf8');
const rights = JSON.parse(readFileSync(new URL('query-key-rights.json', dir), 'utf8'));
const direct = JSON.parse(readFileSync(new URL('callers/direct-lot.json', dir), 'utf8'));
const superseded = JSON.parse(readFileSync(new URL('query-key-seed.json', dir), 'utf8'));
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

function inputFor(value) {
  return {
    publicationConsent: true,
    summary,
    summaryDigest: digest(summary),
    publicArtifact: value,
    publicArtifactDigest: digest(value),
    termsDigest: null,
    rightsDigest: digest(rights),
    artifactDigest: digest(evidence),
  };
}

test('the permit object is the bare-versus-blank caller and proposalFrom accepts it', () => {
  assert.equal(bytes.length, 304);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'c7f63611f4247f9a04c95b16aff4d94a322cfc149cd1d06ead75d9118d5c1424');
  assert.deepEqual(artifact, direct);
  assert.equal(artifact.schema, 'cc0.query-key-caller.v4');
  assert.equal(Object.hasOwn(artifact, 'license'), false);
  assert.equal(Object.hasOwn(artifact, 'cases'), false);
  assert.equal(stringCount(artifact), 15);
  assert.equal(Buffer.byteLength(JSON.stringify(artifact)), 304);
  assert.equal(digest(artifact), '1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3');
  assert.equal(digest(summary), '4f07cb0db1756b5a09f94b982bcce40e271e016b2fc0a922c9d232425285992d');
  assert.equal(digest(rights), 'efb163e6a44161f61ac538de5fc880b7803a367fc3744c1bbf8970bf37a5d550');
  const proposal = proposalFrom(row(), inputFor(artifact));
  assert.equal(proposal.proposal.publicArtifactDigest, digest(artifact));
  assert.equal(digest(artifact) === digest(evidence), false);
  assert.equal(superseded.schema === 'cc0.query-key-caller.v4', false);
});

test('the publication string limit is unchanged', () => {
  const over = {schema: artifact.schema, left: artifact.left, right: artifact.right, extra: []};
  while (stringCount(over) < 41) over.extra.push('extra-string');
  assert.equal(stringCount(over), 41);
  assert.throws(() => proposalFrom(row(), inputFor(over)), /publication_refused/);
});
