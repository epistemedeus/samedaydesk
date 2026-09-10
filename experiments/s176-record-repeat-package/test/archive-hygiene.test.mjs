import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTree } from '../scripts/archive-hygiene.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const DIST = path.join(PKG, 'dist');

test('lean archive has no private paths, secrets, or transcripts', (t) => {
  if (!fs.existsSync(DIST)) {
    t.skip('no dist/ in this tree');
    return;
  }
  const archives = fs
    .readdirSync(DIST)
    .filter((f) => f.startsWith('record-repeat-job-') && f.endsWith('.tar.gz'));
  if (!archives.length) {
    t.skip('no record-repeat-job archive in dist/');
    return;
  }
  const archivePath = path.join(DIST, archives.sort().at(-1));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's176-hygiene-'));
  const unpacked = spawnSync('tar', ['-xzf', archivePath, '-C', tmp], { encoding: 'utf8' });
  assert.equal(unpacked.status, 0, unpacked.stderr);
  const listing = spawnSync('tar', ['-tzf', archivePath], { encoding: 'utf8' });
  assert.equal(listing.status, 0, listing.stderr);
  for (const name of listing.stdout.split('\n').filter(Boolean)) {
    assert.equal(name.split('/').includes('native-cells'), false, name);
    assert.equal(name.endsWith('.jsonl'), false, name);
    assert.equal(name.split('/').includes('next-run'), false, name);
    assert.match(name, /^(record-repeat-job\/|$)/);
  }
  const root = path.join(tmp, 'record-repeat-job');
  assert.ok(fs.existsSync(root), 'archive root missing');
  const hits = scanTree(root);
  assert.deepEqual(hits, [], JSON.stringify(hits, null, 2));
});
