import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, linkSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportJobArtifacts } from '../../../../tools/job-artifact-export/lib/export.mjs';
import { importJobArtifacts } from '../../../../tools/job-artifact-export/lib/import.mjs';
import { buildStoredZip, parseStoredZip } from '../../../../tools/job-artifact-export/lib/zip.mjs';
import { publishFiles } from '../../../../tools/job-artifact-export/lib/publication.mjs';
import { sha256Prefixed } from '../../../../tools/job-artifact-export/lib/pins.mjs';
import { ExportRefuse } from '../../../../tools/job-artifact-export/lib/refuse.mjs';
import { startLoopbackReceiver } from '../../../../tools/job-delivery-outbox/lib/receiver.mjs';

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'cw60-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, 'input');
  cpSync('tools/job-artifact-export/fixtures/sale-out-dir', input, { recursive: true });
  return { root, input, out: join(root, 'export') };
}
function alter(bundle, fn) {
  const entries = parseStoredZip(readFileSync(bundle.zip)).entries;
  fn(entries);
  const bytes = buildStoredZip(entries);
  writeFileSync(bundle.zip, bytes);
  writeFileSync(`${bundle.zip}.sha256`, sha256Prefixed(bytes));
}
function assertNoDest(dest) {
  assert.equal(existsSync(dest), false);
}

test('import recomputes immutable terms even when zip checksum is refreshed', t => {
  const p = setup(t); const bundle = exportJobArtifacts({ inDir: p.input, out: p.out });
  alter(bundle, entries => {
    const row = entries.find(e => e.name === 'manifest.json');
    const manifest = JSON.parse(row.data); manifest.termsVersion = `sha256:${'a'.repeat(64)}`;
    row.data = Buffer.from(JSON.stringify(manifest));
  });
  const dest = join(p.root, 'import');
  assert.throws(() => importJobArtifacts({ zip: bundle.zip, out: dest }));
  assertNoDest(dest);
});
test('import preserves an existing linked destination', t => {
  const p = setup(t); const bundle = exportJobArtifacts({ inDir: p.input, out: p.out });
  const dest = join(p.root, 'import'); mkdirSync(dest);
  const victim = join(p.root, 'victim'); writeFileSync(victim, 'preserve');
  symlinkSync(victim, join(dest, 'agenda.json'));
  assert.throws(() => importJobArtifacts({ zip: bundle.zip, out: dest }));
  assert.equal(readFileSync(victim, 'utf8'), 'preserve');
});
test('import refuses a populated destination and leaves it unchanged', t => {
  const p = setup(t); const bundle = exportJobArtifacts({ inDir: p.input, out: p.out });
  const dest = join(p.root, 'import'); mkdirSync(dest);
  writeFileSync(join(dest, 'keep.txt'), 'keep');
  assert.throws(() => importJobArtifacts({ zip: bundle.zip, out: dest }), err => err instanceof ExportRefuse && err.code === 'destination-exists');
  assert.equal(readFileSync(join(dest, 'keep.txt'), 'utf8'), 'keep');
  assert.equal(existsSync(join(dest, 'agenda.json')), false);
});
test('export refuses hardlinked inputs', t => {
  const p = setup(t); linkSync(join(p.input, 'agenda.json'), join(p.root, 'alias'));
  assert.throws(() => exportJobArtifacts({ inDir: p.input, out: p.out }));
});
test('export refuses symlink inputs', t => {
  const p = setup(t);
  symlinkSync(join(p.input, 'agenda.json'), join(p.input, 'linked.json'));
  assert.throws(() => exportJobArtifacts({ inDir: p.input, out: p.out }), err => err instanceof ExportRefuse && err.code === 'symlink-refused');
  assert.equal(existsSync(p.out), false);
});
test('export refuses hidden and partial filenames', t => {
  const p = setup(t);
  writeFileSync(join(p.input, '.secret'), 'hide');
  assert.throws(() => exportJobArtifacts({ inDir: p.input, out: p.out }), err => err instanceof ExportRefuse && err.code === 'partial-file-refused');
  rmSync(join(p.input, '.secret'));
  writeFileSync(join(p.input, 'agenda.json.partial'), 'tmp');
  assert.throws(() => exportJobArtifacts({ inDir: p.input, out: p.out }), err => err instanceof ExportRefuse && err.code === 'partial-file-refused');
  assert.equal(existsSync(p.out), false);
});
test('zip refuses duplicate members', () => {
  const bytes = buildStoredZip([{ name: 'a', data: 'one' }, { name: 'a', data: 'two' }]);
  assert.throws(() => parseStoredZip(bytes));
});
test('zip refuses local/central path disagreement', () => {
  const bytes = buildStoredZip([{ name: 'safe', data: 'one' }]);
  bytes.write('../x', 30);
  assert.throws(() => parseStoredZip(bytes));
});
test('zip refuses Unix symbolic link attributes', () => {
  const bytes = buildStoredZip([{ name: 'safe', data: 'target' }]);
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt16LE(0x0314, central + 4); bytes.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
  assert.throws(() => parseStoredZip(bytes));
});
test('zip refuses path traversal and absolute members', () => {
  assert.throws(() => parseStoredZip(buildStoredZip([{ name: '../escape.txt', data: 'x' }])));
  assert.throws(() => parseStoredZip(buildStoredZip([{ name: '/tmp/x', data: 'x' }])));
});
test('zip refuses trailing hidden bytes after the end-of-central-directory', () => {
  const bytes = Buffer.concat([buildStoredZip([{ name: 'safe', data: 'one' }]), Buffer.from('hide')]);
  assert.throws(() => parseStoredZip(bytes));
});
test('truncated zip does not create a destination', t => {
  const p = setup(t); const bundle = exportJobArtifacts({ inDir: p.input, out: p.out });
  const truncated = readFileSync(bundle.zip).subarray(0, 32);
  writeFileSync(bundle.zip, truncated);
  writeFileSync(`${bundle.zip}.sha256`, sha256Prefixed(truncated));
  const dest = join(p.root, 'import');
  assert.throws(() => importJobArtifacts({ zip: bundle.zip, out: dest }));
  assertNoDest(dest);
});
test('import refuses a foreign zip member even when the checksum is refreshed', t => {
  const p = setup(t); const bundle = exportJobArtifacts({ inDir: p.input, out: p.out });
  alter(bundle, entries => { entries.push({ name: 'foreign.txt', data: 'nope' }); });
  const dest = join(p.root, 'import');
  assert.throws(() => importJobArtifacts({ zip: bundle.zip, out: dest }), err => err instanceof ExportRefuse && err.code === 'zip-foreign-member');
  assertNoDest(dest);
});
test('import refuses JSONL digest change even when zip checksum is refreshed', t => {
  const p = setup(t); const bundle = exportJobArtifacts({ inDir: p.input, out: p.out });
  alter(bundle, entries => {
    const row = entries.find(e => e.name === 'files.jsonl');
    const lines = row.data.toString().trim().split('\n').map(line => JSON.parse(line));
    lines[0].sha256 = `sha256:${'b'.repeat(64)}`;
    row.data = Buffer.from(`${lines.map(line => JSON.stringify(line)).join('\n')}\n`);
  });
  const dest = join(p.root, 'import');
  assert.throws(() => importJobArtifacts({ zip: bundle.zip, out: dest }));
  assertNoDest(dest);
});
test('import refuses member byte changes even when zip checksum is refreshed', t => {
  const p = setup(t); const bundle = exportJobArtifacts({ inDir: p.input, out: p.out });
  alter(bundle, entries => {
    const row = entries.find(e => e.name === 'agenda.json');
    row.data = Buffer.from('changed-bytes');
  });
  const dest = join(p.root, 'import');
  assert.throws(() => importJobArtifacts({ zip: bundle.zip, out: dest }));
  assertNoDest(dest);
});
test('partial current receipt maps mailbox refusal to ExportRefuse exit 2', t => {
  const p = setup(t);
  writeFileSync(join(p.input, 'receipt.json'), JSON.stringify({
    schema: 'samedaydesk.paid-useful-jobs.receipt.v1',
    contract: 'samedaydesk.paid-useful-jobs.execution.v1',
    jobId: 'feed-agenda',
    transport: 'ok',
    delivery: { complete: false },
  }));
  assert.throws(
    () => exportJobArtifacts({ inDir: p.input, out: p.out }),
    err => err instanceof ExportRefuse && err.code === 'd01-missing-output' && err.exitCode === 2,
  );
  assert.equal(existsSync(p.out), false);
});
test('killed staging writer leaves no visible destination or leftover stage', t => {
  const p = setup(t);
  const dest = join(p.root, 'published');
  assert.throws(
    () => publishFiles(dest, [{ name: 'a.json', data: 'x' }], () => { throw Object.assign(new Error('killed'), { code: 'killed-staging' }); }),
    err => err.code === 'killed-staging',
  );
  assertNoDest(dest);
  assert.equal(readdirSync(p.root).some(name => name.includes('stage') || name === 'published'), false);
});
test('receiver rejects a same-origin request at a different path', async t => {
  const p = setup(t);
  const receiver = await startLoopbackReceiver({ path: '/bound', storeDir: join(p.root, 'receiver') });
  t.after(() => receiver.close());
  const response = await fetch(receiver.url.replace('/bound', '/other'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventId: 'evt_probe', outputsDigest: 'a'.repeat(64), callbackDestination: { path: '/bound' } }),
  });
  assert.equal(response.status, 404);
});
