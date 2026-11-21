import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest} from './digest.mjs';
import {screenCaller} from './screen.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ARCHIVE = join(ROOT, 'fixtures/query-key-1.1.0.tar.gz');
export const RETURN_SUMMARY = 'Visitor query-key pair returned for comparison. Bare and blank stay separate forms.';
export const RETURN_RIGHTS = Object.freeze({
  license: 'CC0-1.0',
  scope: 'synthetic-or-authorized-reusable-artifact',
  attribution: 'Synthetic visitor return. Not a customer and not an independent contributor.',
});

function fail(code) {
  process.stdout.write(JSON.stringify({ok: false, code}) + '\n');
  process.exit(1);
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

export function readCaller(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export async function validateReturn(document, {archive = ARCHIVE} = {}) {
  screenCaller(document);
  const artifactDigest = digest(document);
  const [{proposalFrom}, {usefulEvidence}, foundation] = await Promise.all([
    import('../../vendor/hosted-wallet-market/src/accepted-work-publication.mjs'),
    import('../../vendor/hosted-wallet-market/examples/participation-canary.mjs'),
    import('../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/operations.js'),
  ]);
  const evidence = usefulEvidence();
  const row = {
    requester_id: 'requester-fixture',
    spec: {
      title: 'retained query comparison',
      summary: 'Private retained mapping kept off the public page.',
      criteria: ['preserve-mapping'],
    },
    voluntary: {
      review: {accepted: true, reason: 'The exact synthetic mappings meet the requested compatibility criterion.'},
      artifact: {digest: foundation.digest(evidence), evidence},
      terms: {rights: RETURN_RIGHTS},
      termsDigest: null,
    },
  };
  const input = {
    publicationConsent: true,
    summary: RETURN_SUMMARY,
    summaryDigest: foundation.digest(RETURN_SUMMARY),
    publicArtifact: document,
    publicArtifactDigest: foundation.digest(document),
    termsDigest: null,
    rightsDigest: foundation.digest(RETURN_RIGHTS),
    artifactDigest: foundation.digest(evidence),
  };
  const proposal = proposalFrom(row, input);
  const directory = mkdtempSync(join(tmpdir(), 'agl-return-'));
  try {
    const extracted = spawnSync('tar', ['-xzf', archive, '-C', directory], {encoding: 'utf8'});
    if (extracted.status !== 0) throw Object.assign(new Error('archive_refused'), {code: 'archive_refused'});
    const callerPath = join(directory, 'caller.json');
    writeFileSync(callerPath, JSON.stringify(document));
    const applied = spawnSync(process.execPath, [
      'apply.mjs', 'apply', '--artifact', 'corpus.json', '--input', callerPath,
    ], {cwd: join(directory, 'query-key-1.1.0'), encoding: 'utf8'});
    if (applied.status !== 0) throw Object.assign(new Error('apply_refused'), {code: 'apply_refused'});
    const run = JSON.parse(applied.stdout);
    return {
      ok: true,
      code: 'accepted',
      artifactDigest,
      foundationDigest: foundation.digest(document),
      proposalDigest: proposal.proposalDigest,
      publicArtifactDigest: proposal.proposal.publicArtifactDigest,
      rights: RETURN_RIGHTS,
      executed: run.executed,
      wire: run.wire,
    };
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const input = flag(argv, '--input');
  if (!input || (command !== 'screen' && command !== 'validate')) fail('usage');
  let document;
  try { document = readCaller(input); }
  catch { fail('input_refused'); }
  try { screenCaller(document); }
  catch (error) { fail(error.code || 'screen_refused'); }
  if (command === 'screen') {
    process.stdout.write(JSON.stringify({ok: true, code: 'screened'}) + '\n');
    return;
  }
  const result = await validateReturn(document);
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && process.argv[1].endsWith('seed-return.mjs')) {
  main().catch((error) => fail(error.code || 'return_failed'));
}
