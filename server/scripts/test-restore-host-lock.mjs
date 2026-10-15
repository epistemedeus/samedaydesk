import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST_LOCK_SHA256, restoreHostLockBytes, restoreHostLockFile } from './restore-host-lock.mjs';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('the committed host lock is retained and the known install rewrite is restored', async () => {
  const committed = await readFile(path.join(root, 'package-lock.json'));
  assert.equal(sha256(committed), HOST_LOCK_SHA256);
  const retained = restoreHostLockBytes(committed);
  assert.equal(retained.status, 'retained');
  assert.equal(sha256(retained.bytes), HOST_LOCK_SHA256);

  const marker = committed.indexOf(Buffer.from('"server/vendor/machine-gateway"'));
  const version = committed.indexOf(Buffer.from('"version": "0.1.1"'), marker);
  assert.ok(version > marker);
  const refreshed = Buffer.from(committed);
  refreshed[version + '"version": "0.1.'.length] = '2'.charCodeAt(0);
  assert.notEqual(sha256(refreshed), HOST_LOCK_SHA256);
  const restored = restoreHostLockBytes(refreshed);
  assert.equal(restored.status, 'restored');
  assert.equal(sha256(restored.bytes), HOST_LOCK_SHA256);
  assert.equal(Buffer.compare(restored.bytes, committed), 0);
});

test('any other lock drift is a named refusal and is not rewritten', () => {
  const committed = Buffer.from('not the host lock');
  assert.throws(() => restoreHostLockBytes(committed), error => error.code === 'host_lock_drift_refused');
});

test('a repaired gateway byte that is not the pinned lock is refused', async () => {
  const committed = await readFile(path.join(root, 'package-lock.json'));
  const marker = committed.indexOf(Buffer.from('"server/vendor/machine-gateway"'));
  const version = committed.indexOf(Buffer.from('"version": "0.1.1"'), marker);
  const drifted = Buffer.from(committed);
  drifted[version + '"version": "0.1.'.length] = '2'.charCodeAt(0);
  drifted[drifted.length - 2] = drifted[drifted.length - 2] === 0x20 ? 0x21 : 0x20;
  assert.throws(() => restoreHostLockBytes(drifted), error => error.code === 'host_lock_repair_refused');
});

test('restore writes only the pinned lock back to disk', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sds-host-lock-'));
  try {
    const committed = await readFile(path.join(root, 'package-lock.json'));
    const marker = committed.indexOf(Buffer.from('"server/vendor/machine-gateway"'));
    const version = committed.indexOf(Buffer.from('"version": "0.1.1"'), marker);
    const refreshed = Buffer.from(committed);
    refreshed[version + '"version": "0.1.'.length] = '2'.charCodeAt(0);
    await writeFile(path.join(directory, 'package-lock.json'), refreshed);
    assert.equal(restoreHostLockFile(directory), 'restored');
    assert.equal(sha256(await readFile(path.join(directory, 'package-lock.json'))), HOST_LOCK_SHA256);
    assert.equal(restoreHostLockFile(directory), 'retained');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
