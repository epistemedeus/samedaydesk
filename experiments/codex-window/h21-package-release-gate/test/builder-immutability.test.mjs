import assert from 'node:assert/strict';
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('overlay builder refuses an already existing 1.4.5 before any write', () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const archives = ['for-agents/useful-jobs', 'kit'].map(dir => join(root, 'client/public', dir, 'useful-jobs-1.4.5.tar.gz'));
  const before = archives.map(path => readFileSync(path));
  const tmp = mkdtempSync(join(tmpdir(), 'h21-builder-'));
  const fd = openSync(join(tmp, 'output'), 'w');
  try {
    const result = spawnSync(process.execPath, ['server/paid-useful-jobs/scripts/build-useful-jobs-v145.mjs'],
      { cwd: root, stdio: ['ignore', fd, fd], timeout: 10_000 });
    assert.notEqual(result.status, 0);
    assert.match(readFileSync(join(tmp, 'output'), 'utf8'), /refusing to overwrite existing archive useful-jobs-1\.4\.5/);
    archives.forEach((path, i) => assert.deepEqual(readFileSync(path), before[i]));
  } finally { closeSync(fd); rmSync(tmp, { recursive: true, force: true }); }
});
