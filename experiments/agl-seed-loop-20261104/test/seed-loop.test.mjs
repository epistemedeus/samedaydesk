import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {digest as foundationDigest} from '../../../vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/operations.js';
import {apexAgentCard} from '../../../server/lib/apex-agent-card.js';
import {apexApiCatalog, apexOpenApiDocument, apexSkillMarkdown, machineDeclarationProblems} from '../../../server/lib/apex-declarations.js';
import {FOR_AGENTS_CRAWLER_HTML} from '../../../client/src/data/machineEntry.mjs';
import {QUERY_KEY_CONSUMER, consumerLinkage} from '../../../vendor/hosted-wallet-market/src/query-key-consumer.mjs';
import {digest} from '../digest.mjs';
import {readDiscovery} from '../discovery.mjs';
import {prepareReturn, screenCaller} from '../screen.mjs';
import {seedCheck} from '../seed-check.mjs';
import {RETURN_RIGHTS, RETURN_SUMMARY, validateReturn} from '../seed-return.mjs';
import {runHostReturn} from '../host-return.mjs';

const exec = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '../../..');
const HERE = resolve(import.meta.dirname, '..');
const FIX = join(HERE, 'fixtures');
const BODY_SHA = 'e737cbfd5cb68175721b8c219e6a7c5b4368cfec9cdd2377f706955a49a826ea';
const EXTRACTED_SHA = '32000ca78bd47d8cd304cfee506389037a96d8d1de5bd5d34d3a7bab4beb54ad';
const ARTIFACT_DIGEST = '1917f8c6d1e247001c049c208641d5c4cfc44453e5162e41b57ef206569155e3';
const WIRE_SHA = '87d81f0eec2b34ed2a709c7f9e08d08317ae2f8842d72c305a0ee21c68665b9c';
const ARCHIVE_SHA = '51b1b65766b68550b644e25f3d0653f9e09b8988f7ab36f0e649dce8f60405aa';
const RETURN_DIGEST = '5cb8f9746e4f516b342d0e93520c59013e9c6acc77385629c9dc278af1b9d950';
const LEFT_WIRE = 'lot%23=row%203&seal';
const RIGHT_WIRE = 'lot%23=row%203&seal=';

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const body = readFileSync(join(FIX, 'artifact.body'));
const publicArtifact = JSON.parse(body.toString('utf8')).value.publicArtifact;
const extracted = Buffer.from(JSON.stringify(publicArtifact));
const returnPair = JSON.parse(readFileSync(join(HERE, 'test/fixtures/return-pair.json'), 'utf8'));
const summary = readFileSync(join(ROOT, 'docs/receiving/n4-contrib-readiness-20261104/query-key-summary.txt'), 'utf8');
const rights = JSON.parse(readFileSync(join(ROOT, 'docs/receiving/n4-contrib-readiness-20261104/query-key-rights.json'), 'utf8'));

test('foundation digest matches the served caller and the local copy', () => {
  assert.equal(body.length, 1305);
  assert.equal(sha(body), BODY_SHA);
  assert.equal(extracted.length, 304);
  assert.equal(sha(extracted), EXTRACTED_SHA);
  const pre = readFileSync(join(ROOT, 'docs/receiving/n4-contrib-readiness-20261104/query-key-caller.json'));
  assert.equal(pre.equals(extracted), false);
  assert.equal(digest(publicArtifact), foundationDigest(publicArtifact));
  assert.equal(foundationDigest(publicArtifact), ARTIFACT_DIGEST);
  const wires = readFileSync(join(FIX, 'apply-nocheckout.stdout'));
  assert.equal(wires.length, 1247);
  assert.equal(sha(wires), WIRE_SHA);
  const parsed = JSON.parse(wires.toString('utf8'));
  assert.equal(parsed.executed, false);
  assert.equal(parsed.wire.left, LEFT_WIRE);
  assert.equal(parsed.wire.right, RIGHT_WIRE);
  const archive = readFileSync(join(FIX, 'query-key-1.1.0.tar.gz'));
  assert.equal(archive.length, 14566);
  assert.equal(sha(archive), ARCHIVE_SHA);
});

test('saved public discovery fixtures are schema_unlinked', () => {
  const observed = readDiscovery(join(FIX, 'discovery'));
  assert.equal(observed.result, 'schema_unlinked');
  assert.equal(observed.rows.length, 8);
  for (const row of observed.rows) {
    assert.equal(row.status, 200);
    assert.equal(row.bytes > 0, true);
    assert.equal(row.sha256, sha(readFileSync(join(FIX, 'discovery', row.file))));
    assert.equal(row.schemaPresent, false);
    assert.equal(row.observedAt, '2026-11-05T00:15:38Z');
  }
  const participation = observed.rows.find((row) => row.file === 'neomorphic-participation-0.3.1.json');
  const guide = observed.rows.find((row) => row.file === 'neomorphic-ACCEPTED-WORK.md');
  const entry = observed.rows.find((row) => row.file === 'neomorphic-query-key-1.1.0.json');
  assert.equal(participation.sha256, '2bb518aa79ec8fdab99356afe35c050d8363f69ea23e6394ba9cce460f7dcd0d');
  assert.equal(participation.bytes, 5968);
  assert.equal(guide.sha256, '8edc57f5693ce38e08eb1e57c556132eeff095da19eef7515509ad09d192ce98');
  assert.equal(guide.bytes, 7111);
  assert.equal(entry.sha256, '9f5b3529b5eab1ba52a3e4d8b4cf91d9d44a7f0f1bfc04e2e5aa47917c78bd51');
  assert.equal(entry.bytes, 2918);
});

test('a collapsing key is equal and a bare-preserving key is distinct', async () => {
  const caller = join(tmpdir(), 'agl-caller.json');
  writeFileSync(caller, extracted);
  const wires = join(FIX, 'apply-nocheckout.stdout');
  const collapsed = await seedCheck({
    artifact: caller,
    wires,
    keyModule: join(HERE, 'test/fixtures/collapse-bare-blank.mjs'),
  });
  assert.equal(collapsed.verdict, 'equal');
  assert.equal(collapsed.specExpectation, 'distinct');
  assert.equal(collapsed.artifactDigest, ARTIFACT_DIGEST);
  assert.equal(collapsed.wires.left, LEFT_WIRE);
  assert.equal(collapsed.wires.right, RIGHT_WIRE);
  assert.match(collapsed.specCitation.url, /known-answer-query-bare-name-stays-bare\.json$/);
  assert.equal(collapsed.specCitation.sha256, 'ee120c2520d6797acba145ef3ae078f969dd4be8fe68b0ed825c826997dfe201');
  const kept = await seedCheck({
    artifact: caller,
    wires,
    keyModule: join(HERE, 'test/fixtures/keep-bare.mjs'),
  });
  assert.equal(kept.verdict, 'distinct');
  assert.equal(kept.specExpectation, 'distinct');
});

test('seed-check does not open the market, the server, or execute.py', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'agl-empty-'));
  const decoyDir = mkdtempSync(join(tmpdir(), 'agl-decoy-'));
  const decoy = join(decoyDir, 'execute.py');
  writeFileSync(decoy, 'print("unused")\n');
  const trace = join(tmpdir(), 'agl-seed-check.trace');
  const caller = join(tmpdir(), 'agl-absent-caller.json');
  writeFileSync(caller, extracted);
  const script = [
    'set -eu',
    'mount --bind "$EMPTY" "$ROOT/vendor/hosted-wallet-market"',
    'mount --bind "$EMPTY" "$ROOT/server"',
    'mount --bind /dev/null "$DECOY"',
    'strace -f -s 256 -e trace=execve,openat -o "$TRACE" "$NODE" "$SEED" --artifact "$ART" --wires "$WIRES" --key-module "$KEY"',
  ].join('\n');
  try {
    const {stdout} = await exec('unshare', ['--user', '--map-root-user', '--mount', '--', 'bash', '-lc', script], {
      cwd: ROOT,
      timeout: 30000,
      encoding: 'utf8',
      env: {
        ...process.env,
        EMPTY: empty,
        ROOT,
        DECOY: decoy,
        TRACE: trace,
        NODE: process.execPath,
        SEED: join(HERE, 'seed-check.mjs'),
        ART: caller,
        WIRES: join(FIX, 'apply-nocheckout.stdout'),
        KEY: join(HERE, 'test/fixtures/collapse-bare-blank.mjs'),
      },
    });
    const result = JSON.parse(stdout);
    assert.equal(result.verdict, 'equal');
    assert.equal(result.artifactDigest, ARTIFACT_DIGEST);
    const text = readFileSync(trace, 'utf8');
    assert.equal(text.includes('hosted-wallet-market'), false, text.slice(0, 500));
    assert.equal(text.includes('/server/'), false);
    assert.equal(text.includes('execute.py'), false);
  } finally {
    rmSync(empty, {recursive: true, force: true});
    rmSync(decoyDir, {recursive: true, force: true});
  }
});

test('a private field is refused before keying', () => {
  const document = JSON.parse(readFileSync(join(HERE, 'test/fixtures/private-field.json'), 'utf8'));
  let digested = false;
  let executed = false;
  assert.throws(() => prepareReturn(document, {
    digest() { digested = true; return 'x'; },
    apply() { executed = true; },
  }), /private_field_refused/);
  assert.equal(digested, false);
  assert.equal(executed, false);
});

test('an unknown key is refused before the digest', () => {
  const document = JSON.parse(readFileSync(join(HERE, 'test/fixtures/unknown-key.json'), 'utf8'));
  let digested = false;
  assert.throws(() => prepareReturn(document, {
    digest() { digested = true; return 'x'; },
  }), /unknown_key_refused/);
  assert.equal(digested, false);
});

test('an unknown schema is refused before execution', async () => {
  const document = JSON.parse(readFileSync(join(HERE, 'test/fixtures/unknown-schema.json'), 'utf8'));
  let digested = false;
  let executed = false;
  assert.throws(() => prepareReturn(document, {
    digest() { digested = true; return 'x'; },
    apply() { executed = true; },
  }), /unknown_schema/);
  assert.equal(digested, false);
  assert.equal(executed, false);
  assert.throws(() => screenCaller({}), /unknown_schema/);
  const trace = join(tmpdir(), 'agl-unknown-schema.trace');
  let stdout = '';
  let status = 0;
  try {
    const result = await exec('strace', [
      '-f', '-s', '256', '-e', 'trace=execve,openat', '-o', trace,
      process.execPath, join(HERE, 'seed-return.mjs'), 'screen', '--input', join(HERE, 'test/fixtures/unknown-schema.json'),
    ], {encoding: 'utf8', timeout: 20000});
    stdout = result.stdout;
  } catch (error) {
    status = error.code;
    stdout = error.stdout || '';
  }
  assert.equal(status, 1);
  assert.equal(JSON.parse(stdout).code, 'unknown_schema');
  const text = readFileSync(trace, 'utf8');
  assert.equal(text.includes('execute.py'), false);
  assert.equal(text.includes('python3'), false);
});

test('the visitor return passes the publication fence and the archive apply', async () => {
  assert.equal(foundationDigest(returnPair), RETURN_DIGEST);
  assert.equal(digest(returnPair), RETURN_DIGEST);
  const result = await validateReturn(returnPair);
  assert.equal(result.ok, true);
  assert.equal(result.artifactDigest, RETURN_DIGEST);
  assert.equal(result.foundationDigest, RETURN_DIGEST);
  assert.equal(result.publicArtifactDigest, RETURN_DIGEST);
  assert.equal(result.executed, false);
  assert.equal(result.wire.execution, false);
  assert.notEqual(result.wire.left, result.wire.right);
  assert.deepEqual(result.rights, RETURN_RIGHTS);
  assert.equal(RETURN_SUMMARY.includes('Bare and blank stay separate forms.'), true);
});

test('SDS machine producers publish one query-key consumer', () => {
  const problems = machineDeclarationProblems(apexOpenApiDocument(), apexSkillMarkdown(), apexApiCatalog());
  assert.deepEqual(problems, []);
  const openapi = apexOpenApiDocument();
  const card = apexAgentCard();
  assert.equal(openapi['x-query-key-caller'].schema, QUERY_KEY_CONSUMER.schema);
  assert.equal(openapi['x-query-key-caller'].runner.sha256, ARCHIVE_SHA);
  assert.equal(openapi['x-query-key-caller'].acquire, QUERY_KEY_CONSUMER.acquire);
  assert.equal(openapi['x-query-key-caller'].apply, QUERY_KEY_CONSUMER.apply);
  assert.equal(openapi['x-query-key-caller'].source.commit, QUERY_KEY_CONSUMER.source.commit);
  assert.equal(card['x-query-key-caller'].apply, QUERY_KEY_CONSUMER.apply);
  assert.equal(card.interfaces.some((item) => item.url === QUERY_KEY_CONSUMER.acceptedWork), true);
  const llms = readFileSync(join(ROOT, 'client/public/llms.txt'), 'utf8');
  for (const text of [llms, FOR_AGENTS_CRAWLER_HTML]) {
    assert.equal(text.includes(QUERY_KEY_CONSUMER.schema), true);
    assert.equal(text.includes(QUERY_KEY_CONSUMER.runner.sha256), true);
    assert.equal(text.includes(QUERY_KEY_CONSUMER.acquire), true);
    assert.equal(text.includes(QUERY_KEY_CONSUMER.apply), true);
    assert.equal(text.includes(QUERY_KEY_CONSUMER.source.commit), true);
    assert.equal(text.includes(QUERY_KEY_CONSUMER.source.repository), true);
    assert.equal(text.includes(QUERY_KEY_CONSUMER.acceptedWork), true);
  }
  assert.equal(consumerLinkage({schema: 'cc0.not-a-caller'}), null);
  assert.equal(consumerLinkage(publicArtifact).schema, QUERY_KEY_CONSUMER.schema);
  assert.equal(JSON.stringify(publicArtifact).includes(QUERY_KEY_CONSUMER.runner.archive), false);
});

test('a cold caller follows the machine instructions and a new contributor can return the document', {timeout: 480000}, async () => {
  const result = await runHostReturn({
    publicArtifact,
    summary,
    rights,
    returnDocument: returnPair,
    onPublished: async ({origin, caFile}) => {
      const {stdout} = await exec(process.execPath, [
        join(HERE, 'cold-caller.mjs'), '--origin', origin, '--ca-file', caFile,
      ], {encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024});
      writeFileSync('/tmp/agl-cold-transcript.json', stdout);
      return JSON.parse(stdout);
    },
  });
  assert.equal(result.closedListStatus, 404);
  assert.equal(result.closedProfileSigner, false);
  assert.equal(result.published.signerAuthority, false);
  assert.equal(result.published.paidWork, false);
  assert.equal(result.anonymous.list, 200);
  assert.equal(result.anonymous.detail, 200);
  assert.equal(result.anonymous.artifact, 200);
  const listed = result.published.anonymousList.body.value.items.find((item) => item.taskId === result.published.taskId);
  assert.equal(listed.consumer.schema, QUERY_KEY_CONSUMER.schema);
  assert.equal(listed.consumer.runner.sha256, ARCHIVE_SHA);
  assert.equal(Object.hasOwn(listed, 'publicArtifact'), false);
  const artifact = result.published.anonymousArtifact.body.value;
  assert.equal(artifact.publicArtifact.schema, QUERY_KEY_CONSUMER.schema);
  assert.equal(artifact.consumer.apply, QUERY_KEY_CONSUMER.apply);
  assert.equal(artifact.consumer.source.path, QUERY_KEY_CONSUMER.source.path);
  const cold = result.coldCaller;
  assert.equal(cold.ok, true);
  assert.equal(cold.schema, QUERY_KEY_CONSUMER.schema);
  assert.equal(cold.runner.sha256, ARCHIVE_SHA);
  assert.equal(cold.runner.bytes, 14566);
  assert.equal(cold.acquire, QUERY_KEY_CONSUMER.acquire);
  assert.equal(cold.apply, QUERY_KEY_CONSUMER.apply);
  assert.equal(cold.source.commit, QUERY_KEY_CONSUMER.source.commit);
  assert.equal(cold.artifactDigest, ARTIFACT_DIGEST);
  assert.equal(cold.artifactRun.executed, false);
  assert.equal(cold.artifactRun.wire.left, LEFT_WIRE);
  assert.equal(cold.artifactRun.wire.right, RIGHT_WIRE);
  assert.equal(cold.gets.length > 0, true);
  for (const row of cold.gets) {
    assert.equal(row.method, 'GET');
    assert.equal(row.status, 200, JSON.stringify(row));
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(result.interest.ok, true, JSON.stringify({
    route: '/api/neomorphic-contributor-journey/v1/market/interest',
    status: result.interest.status,
    code: result.interest.code,
  }));
  const stored = JSON.parse(result.storedNote);
  assert.deepEqual(stored.document, returnPair);
  assert.equal(stored.artifactDigest, RETURN_DIGEST);
  assert.equal(result.tasksBefore, result.tasksAfter);
  assert.equal(result.financialUnchanged, true);
  assert.equal(result.deliver.status, 403);
  assert.equal(result.deliver.code, 'forbidden');
  assert.equal(result.fund.status, 409);
  assert.equal(result.fund.code, 'qualified_selection_required');
  assert.equal(result.fund.paidWork, false);
});
