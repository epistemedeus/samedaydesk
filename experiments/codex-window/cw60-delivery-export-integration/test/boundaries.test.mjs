import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, linkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportJobArtifacts } from '../../../../tools/job-artifact-export/lib/export.mjs';
import { importJobArtifacts } from '../../../../tools/job-artifact-export/lib/import.mjs';
import { buildStoredZip, parseStoredZip } from '../../../../tools/job-artifact-export/lib/zip.mjs';
import { sha256Prefixed } from '../../../../tools/job-artifact-export/lib/pins.mjs';
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
test('import recomputes immutable terms even when zip checksum is refreshed', t => {
  const p = setup(t); const bundle = exportJobArtifacts({ inDir: p.input, out: p.out });
  alter(bundle, entries => {
    const row = entries.find(e => e.name === 'manifest.json');
    const manifest = JSON.parse(row.data); manifest.termsVersion = `sha256:${'a'.repeat(64)}`;
    row.data = Buffer.from(JSON.stringify(manifest));
  });
  assert.throws(() => importJobArtifacts({ zip: bundle.zip, out: join(p.root, 'import') }));
  assert.equal(existsSync(join(p.root, 'import')), false);
});
test('import preserves an existing linked destination', t => {
  const p = setup(t); const bundle = exportJobArtifacts({ inDir: p.input, out: p.out });
  const dest = join(p.root, 'import'); mkdirSync(dest);
  const victim = join(p.root, 'victim'); writeFileSync(victim, 'preserve');
  symlinkSync(victim, join(dest, 'agenda.json'));
  assert.throws(() => importJobArtifacts({ zip: bundle.zip, out: dest }));
  assert.equal(readFileSync(victim, 'utf8'), 'preserve');
});
test('export refuses hardlinked inputs', t => {
  const p = setup(t); linkSync(join(p.input, 'agenda.json'), join(p.root, 'alias'));
  assert.throws(() => exportJobArtifacts({ inDir: p.input, out: p.out }));
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
