import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import './fixtures/no-ajv-register.mjs';

const {digest} = await import('../runtime/agent-economy-foundation/dist/index.js');

// 0.3.1 cold client: multi-criterion post and the existing accepted-work permit
// and public read. All HTTP goes to an in-process stub (no socket, no Postgres).

const client = fileURLToPath(new URL('../examples/cold-requester-0.3.1.mjs', import.meta.url));
const pinned = fileURLToPath(new URL('../client/cold-requester-0.3.0.mjs', import.meta.url));
const stub = fileURLToPath(new URL('./fixtures/cold-stub-https.mjs', import.meta.url));
const noAjv = fileURLToPath(new URL('./fixtures/no-ajv-register.mjs', import.meta.url));
const ORIGIN = 'https://market.fixture.test';
const TASK = 'market-' + 'c'.repeat(64);
const base = {origin:ORIGIN, tenant:'fixture-tenant', actorId:'requester-fixture-1', taskId:TASK, sourceSha256:'a'.repeat(64), hostSha256:'b'.repeat(64)};

function setup(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cold-031-'));
  const config = join(dir, 'stub.json'), log = join(dir, 'requests.ndjson'), secret = join(dir, 'requester.json');
  writeFileSync(config, JSON.stringify({...base, acceptedWorkPublic:false, ...extra}));
  writeFileSync(log, '');
  writeFileSync(secret, JSON.stringify({schema:'ae.password-file.v1', origin:ORIGIN, password:'p'.repeat(32), displayName:'Fixture', role:'requester',
    accountId:base.actorId, cookie:'__Host-neo_contributor=fixture', csrf:'csrf-fixture', operations:{},
    acquisition:{schema:'pilot.machine-participation.acquired-binding.v1', participation:'voluntary-artifact-v1', sourceSha256:base.sourceSha256, hostSha256:base.hostSha256}}), {mode:0o600});
  const run = (...args) => {
    const out = spawnSync(process.execPath, ['--import', noAjv, '--import', stub, client, ...args, '--origin', ORIGIN], {
      encoding:'utf8', env:{PATH:process.env.PATH, HOME:dir, COLD_STUB_CONFIG:config, COLD_STUB_LOG:log}});
    return {status:out.status, body:JSON.parse(out.stdout.trim().split('\n').at(-1) || '{}'), stderr:out.stderr};
  };
  const requests = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  return {dir, secret, run, requests};
}

test('pinned 0.3.0 client bytes are unchanged', () => {
  assert.equal(createHash('sha256').update(readFileSync(pinned)).digest('hex'), '38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4');
});

test('single-criterion post sends the same body shape as 0.3.0', () => {
  const s = setup();
  const out = s.run('post', '--secret-file', s.secret, '--title', 'Fixture title', '--summary', 'Fixture summary', '--criterion', 'public-example');
  assert.equal(out.status, 0, out.stderr + JSON.stringify(out.body));
  assert.equal(out.body.ok, true);
  assert.equal(out.body.state, 'unfunded_interest');
  const post = s.requests().find(r => r.path === '/v1/market/post');
  assert.deepEqual(post.body, {title:'Fixture title', summary:'Fixture summary', criteria:['public-example'], payableKinds:['usable']});
});

test('post accepts repeated --criterion and a JSON --criteria list up to 16', () => {
  const s = setup();
  const repeated = s.run('post', '--secret-file', s.secret, '--title', 'T', '--summary', 'S', '--criterion', 'one', '--criterion', 'two', '--criterion', 'three');
  assert.equal(repeated.status, 0, JSON.stringify(repeated.body));
  assert.deepEqual(s.requests().filter(r => r.path === '/v1/market/post').at(-1).body.criteria, ['one', 'two', 'three']);

  const s2 = setup();
  const sixteen = Array.from({length:16}, (_, i) => `criterion-${i + 1}`);
  const listed = s2.run('post', '--secret-file', s2.secret, '--title', 'T', '--summary', 'S', '--criteria', JSON.stringify(sixteen));
  assert.equal(listed.status, 0, JSON.stringify(listed.body));
  assert.deepEqual(s2.requests().filter(r => r.path === '/v1/market/post').at(-1).body.criteria, sixteen);
});

test('post refuses over 16, duplicates, mixed forms or bad JSON before sending', () => {
  const cases = {
    criteria_limit_refused: ['--criteria', JSON.stringify(Array.from({length:17}, (_, i) => `c${i}`))],
    criteria_refused: ['--criterion', 'same', '--criterion', 'same'],
    'criteria_refused mixed': ['--criterion', 'a', '--criteria', '["b"]'],
    'criteria_refused json': ['--criteria', 'not-json'],
    post_arguments_refused: ['--criteria', '[]'],
  };
  for (const [code, extra] of Object.entries(cases)) {
    const s = setup();
    const out = s.run('post', '--secret-file', s.secret, '--title', 'T', '--summary', 'S', ...extra);
    assert.equal(out.status, 1, code);
    assert.equal(out.body.code, code.split(' ')[0], code);
    assert.equal(s.requests().some(r => r.path === '/v1/market/post'), false, code);
  }
});

test('accepted-work read reports public reads off without enabling them', () => {
  const s = setup({acceptedWorkPublic:false});
  const out = s.run('accepted-work');
  assert.equal(out.status, 1);
  assert.equal(out.body.code, 'accepted_work_public_unavailable');
  assert.equal(out.body.publicReadsEnabled, false);
  assert.equal(out.body.serverChanged, false);
  assert.ok(s.requests().every(r => r.method === 'GET'), 'only reads were sent');
});

test('accepted-work read lists published items when the server has them on', () => {
  const item = {taskId:TASK, summary:'Fixture public summary', rights:{license:'CC0-1.0'}};
  const s = setup({acceptedWorkPublic:true, acceptedItems:[item]});
  const out = s.run('accepted-work', '--limit', '5');
  assert.equal(out.status, 0, JSON.stringify(out.body));
  assert.equal(out.body.publicReadsEnabled, true);
  assert.deepEqual(out.body.items, [item]);
  assert.equal(s.requests()[0].path, '/v1/market/accepted-work?limit=5');
  assert.equal(s.run('accepted-work', '--limit', '99').body.code, 'accepted_work_arguments_refused');
});

test('permit-accepted-work refuses to send when public reads are off', () => {
  const s = setup({acceptedWorkPublic:false});
  const out = s.run('permit-accepted-work', '--secret-file', s.secret, '--task-id', TASK, '--summary', 'Fixture public summary', '--publication-consent');
  assert.equal(out.status, 1);
  assert.equal(out.body.code, 'accepted_work_public_unavailable');
  assert.equal(out.body.sent, false);
  assert.equal(s.requests().some(r => r.path === '/v1/market/permitAcceptedWork'), false);
});

test('permit-accepted-work requires explicit consent', () => {
  const s = setup({acceptedWorkPublic:true});
  const out = s.run('permit-accepted-work', '--secret-file', s.secret, '--task-id', TASK, '--summary', 'Fixture public summary');
  assert.equal(out.body.code, 'publication_consent_required');
  assert.equal(s.requests().length, 0);
});

test('permit-accepted-work sends the exact server input and records a readback-able operation', () => {
  const s = setup({acceptedWorkPublic:true});
  const artifact = join(s.dir, 'public-artifact.json');
  writeFileSync(artifact, JSON.stringify({method:'fixture method name', steps:['read', 'compare']}));
  const out = s.run('permit-accepted-work', '--secret-file', s.secret, '--task-id', TASK, '--summary', 'Fixture public summary',
    '--public-artifact', artifact, '--publication-consent');
  assert.equal(out.status, 0, JSON.stringify(out.body));
  assert.equal(out.body.operation, 'permitAcceptedWork');
  assert.equal(out.body.acceptedWorkVisible, false, 'one party alone does not publish');
  assert.equal(out.body.paidWork, false);
  const sent = s.requests().find(r => r.path === '/v1/market/permitAcceptedWork');
  assert.equal(sent.body.summaryDigest, digest('Fixture public summary'), 'client digest matches the foundation digest');
  assert.equal(sent.body.publicArtifactDigest, digest(JSON.parse(readFileSync(artifact, 'utf8'))));
  assert.equal(sent.body.publicationConsent, true);
  assert.ok(sent.headers['idempotency-key'].startsWith('cold-permitAcceptedWork-'));
  const stored = JSON.parse(readFileSync(s.secret, 'utf8')).operations.permitAcceptedWork;
  assert.equal(stored.state, 'received');
  assert.equal(existsSync(join(s.dir, 'requests.ndjson')), true);

  const nullArtifact = setup({acceptedWorkPublic:true});
  const second = nullArtifact.run('permit-accepted-work', '--secret-file', nullArtifact.secret, '--task-id', TASK, '--summary', 'Fixture public summary', '--publication-consent');
  assert.equal(second.status, 0, JSON.stringify(second.body));
  const body = nullArtifact.requests().find(r => r.path === '/v1/market/permitAcceptedWork').body;
  assert.equal(body.publicArtifact, null);
  assert.equal(body.publicArtifactDigest, digest(null));
});

test('stub permit key list is the server permitAcceptedWork exact list', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/voluntary-market.mjs', import.meta.url)), 'utf8');
  const base = JSON.parse(source.match(/const base = (\[[^\]]+\]);/)[1].replaceAll("'", '"'));
  const extra = JSON.parse(source.match(/action === 'permitAcceptedWork'\) \{\s*exact\(input,\[\.\.\.base,([^\]]+)\]\)/)[1].replace(/^/, '[').concat(']').replaceAll("'", '"'));
  const expected = [...base, ...extra].sort();
  const stubSource = readFileSync(stub, 'utf8');
  const stubKeys = JSON.parse(stubSource.match(/PERMIT_KEYS = (\[[^\]]+\]);/)[1].replaceAll("'", '"').replace(/\s+/g, ''));
  assert.deepEqual([...stubKeys].sort(), expected);
});

test('a server publication refusal is reported as refused, not unknown', () => {
  const s = setup({acceptedWorkPublic:true});
  const out = s.run('permit-accepted-work', '--secret-file', s.secret, '--task-id', TASK, '--summary', 'See https://example.com for details', '--publication-consent');
  assert.equal(out.status, 1, JSON.stringify(out.body));
  assert.equal(out.body.code, 'publication_refused');
  assert.equal(JSON.parse(readFileSync(s.secret, 'utf8')).operations.permitAcceptedWork.state, 'refused');
});
