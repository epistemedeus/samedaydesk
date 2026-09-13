import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const own = join(root, 'experiments/codex-window/h21-package-release-gate');
const version = ['1.4.6', '1.4.7'].includes(process.env.H21_CANDIDATE) ? process.env.H21_CANDIDATE : '1.4.5';
const work = mkdtempSync(join(tmpdir(), 'h21-public-'));
const kit = join(work, 'useful-jobs-' + version);
const archive = version !== '1.4.5'
  ? join(own, `candidate/useful-jobs-${version}.tar.gz`)
  : join(root, 'client/public/for-agents/useful-jobs/useful-jobs-1.4.5.tar.gz');
function child(command, args, options = {}) {
  // Regular-file capture preserves diagnostics, including during the first
  // launcher-blocked attempt. Engine-internal subprocesses remain unchanged.
  const capture = mkdtempSync(join(work, 'capture-'));
  const out = openSync(join(capture, 'stdout'), 'w');
  const err = openSync(join(capture, 'stderr'), 'w');
  try {
    const result = spawnSync(command, args, { timeout: 120_000, ...options, stdio: ['ignore', out, err] });
    const encoding = options.encoding === 'buffer' ? undefined : 'utf8';
    return { ...result, stdout: readFileSync(join(capture, 'stdout'), encoding),
      stderr: readFileSync(join(capture, 'stderr'), encoding) };
  } finally { closeSync(out); closeSync(err); rmSync(capture, { recursive: true, force: true }); }
}
assert.equal(child('tar', ['-xzf', archive, '-C', work]).status, 0);
after(() => rmSync(work, { recursive: true, force: true }));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const catalog = json(join(root, 'client/public/for-agents/useful-jobs/catalog.json'));
const rows = catalog.jobs;

function invoke(id, out, extra = []) {
  const row = rows.find((row) => row.id === id);
  const fixtures = id === 'vendor-budget-impact'
    ? join(kit, 'server/paid-useful-jobs/fixtures/caller', id)
    : join(kit, 'engines', id, 'fixtures/journey');
  const inputs = id === 'page-change-offline-job'
    ? ['--job', join(kit, 'engines', id, 'fixtures/customer-job/job.json')]
    : ['--before', join(fixtures, 'before.json'), '--after', join(fixtures, 'after.json')];
  if (id === 'json-schema-webhook-drift') inputs.push('--used', join(fixtures, 'used.json'));
  const scratch = mkdtempSync(join(work, 'command-tmp-'));
  const r = child(row.cli[0], [...row.cli.slice(1), ...inputs, '--out-dir', out, ...extra], {
    cwd: kit, env: { ...process.env, TMPDIR: scratch, NODE_PATH: '', W5_M01_ENGINE_ROOTS: '' },
  });
  return { ...r, row, scratch };
}

test('158 overlay manifest entries bind frozen source to extracted 1.4.5 (and unchanged repaired overlay)', () => {
  const pin = json(join(root, 'client/public/for-agents/useful-jobs/useful-jobs-1.4.5.sha256.json'));
  assert.equal(pin.sourceCommit, '5078eb9d220deb66bc4d50095038efc2e5b95faa');
  assert.equal(Object.keys(pin.sourceFiles).length, 158);
  for (const [name, digest] of Object.entries(pin.sourceFiles)) {
    const packed = readFileSync(join(kit, name));
    const source = child('git', ['show', pin.sourceCommit + ':' + name], { cwd: root, encoding: 'buffer' });
    assert.equal(source.status, 0, name);
    assert.equal(sha(packed), digest, name);
    assert.deepEqual(packed, source.stdout, name);
  }
});

test('public and kit archive copies retain all three immutable pins', () => {
  for (const [v, bytes, digest] of [
    ['1.4.3', 2615491, 'a18ab918b5a6f60a6981903694aeba41d7d30dd8ad3e336f1d7b8fd22cf62b09'],
    ['1.4.4', 5252886, 'ff4934096e2ba2c95f52c9e364647b455009c36710723f754f3f63ea0dcb5aac'],
    ['1.4.5', 5255012, 'ea14851bd3ed091993acf91bda8430d2d9f621a96f11e8d4aa2b4efda0097e4e'],
  ]) for (const dir of ['for-agents/useful-jobs', 'kit']) {
    const data = readFileSync(join(root, 'client/public', dir, `useful-jobs-${v}.tar.gz`));
    assert.equal(data.length, bytes); assert.equal(sha(data), digest);
  }
});

test('discovery download command, public catalog, and overlay source identifiers agree', () => {
  const d = json(join(root, 'client/public/discovery/useful-jobs.json'));
  const k = json(join(root, 'client/src/data/usefulJobsKit.json'));
  assert.equal(d.version, '1.4.5'); assert.equal(k.version, d.version);
  assert.equal(d.sha256, sha(readFileSync(join(root, 'client/public', d.archive.path))));
  assert.ok(d.coldStart.includes(d.sha256) && d.coldStart.includes(String(d.bytes)));
  assert.equal(d.pins.sourceCommit, d.sourceCommit);
  assert.equal(d.pins.archiveFreeze, d.archiveFreeze);
  assert.equal(d.pins.reviewedSource, d.sourceCommit);
  assert.equal(k.reviewedSource, k.sourceCommit);
  assert.equal(d.purchaseAuthority, false); assert.equal(k.purchaseAuthority, false);
  assert.equal(d.paidHostedClaim, false);
});

test('clean extract contains no node_modules or dependency symlinks', () => {
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name), st = lstatSync(p);
      assert.notEqual(name, 'node_modules'); assert.equal(st.isSymbolicLink(), false, p);
      if (st.isDirectory()) walk(p);
    }
  }
  walk(kit);
});

for (const id of ['lockfile-pin-delta', 'json-schema-webhook-drift', 'route-table-diff', 'page-change-offline-job', 'vendor-budget-impact']) {
  test(`public catalog argv executes ${id} with real caller fixture bytes`, () => {
    const out = join(work, 'positive-' + id);
    const r = invoke(id, out);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const name of r.row.outputs) assert.ok(readFileSync(join(out, name)).length > 0, name);
    const doc = json(join(out, r.row.outputs[0]));
    assert.notEqual(doc.purchaseAuthority, true);
  });
}

for (const id of ['lockfile-pin-delta', 'json-schema-webhook-drift']) {
  test(`public ${id} failed second destination preserves caller bytes and cleans scratch`, () => {
    const out = join(work, 'rollback-' + id); mkdirSync(out);
    const row = rows.find((row) => row.id === id);
    writeFileSync(join(out, row.outputs[0]), 'previous caller artifact\n');
    mkdirSync(join(out, row.outputs[1]));
    const r = invoke(id, out);
    assert.notEqual(r.status, 0);
    assert.equal(readFileSync(join(out, row.outputs[0]), 'utf8'), 'previous caller artifact\n');
    assert.deepEqual(readdirSync(r.scratch), []);
    assert.match(r.stderr, /publication-failed/);
  });
  test(`public ${id} successful explicit publication releases scratch`, () => {
    const r = invoke(id, join(work, 'cleanup-' + id));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(readdirSync(r.scratch), []);
  });
}

test('public page-change --example remains refused without purchase authority', () => {
  const r = child('node', ['bin/useful-jobs.mjs', 'run', 'page-change-offline-job', '--example'],
    { cwd: kit, env: { ...process.env, TMPDIR: work } });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /sample_as_delivered_watch/);
});

test('public PR51 preserves its existing input/output collision refusal', () => {
  const out = join(work, 'pr51-input-collision'); mkdirSync(out);
  const before = join(out, 'budget-impact.json');
  const original = readFileSync(join(kit, 'server/paid-useful-jobs/fixtures/caller/vendor-budget-impact/before.json'));
  writeFileSync(before, original);
  const r = invoke('vendor-budget-impact', out, ['--before', before]);
  assert.deepEqual(readFileSync(before), original, 'publication must not overwrite a source input');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /output-collides-with-input/);
});
