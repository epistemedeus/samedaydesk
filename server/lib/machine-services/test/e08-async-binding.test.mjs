// AE25/AE32: MACHINE_GATEWAY_E08_ASYNC_FILE uses readPrivateJson (same boundary as
// tenants). Loose mode, symlink, hard link, relative path, and invalid packageRoot
// must refuse before any E08 client import. Absent file keeps optional routes off.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, writeFile, chmod, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { readE08AsyncBinding } from '../mount.mjs';

const binding = (packageRoot = '/abs/journey-x402-async') => JSON.stringify({
  packageRoot,
  origin: 'https://127.0.0.1:9',
  extractionOrigin: 'https://127.0.0.1:9',
  caFile: '/abs/ca.pem',
  tokenFile: '/abs/token',
  actor: { tenantId: 't', actorId: 'a', role: 'later-consumer' },
  allowedJobIds: null,
  timeoutMs: 20000,
});

async function scratch(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'e08-async-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('absent MACHINE_GATEWAY_E08_ASYNC_FILE leaves binding null (optional)', () => {
  assert.equal(readE08AsyncBinding({}), null);
  assert.equal(readE08AsyncBinding({ MACHINE_GATEWAY_E08_ASYNC_FILE: '' }), null);
});

test('valid 0600 absolute binding is accepted', async t => {
  const dir = await scratch(t);
  const file = path.join(dir, 'e08.json');
  await writeFile(file, binding(), { mode: 0o600 });
  const config = readE08AsyncBinding({ MACHINE_GATEWAY_E08_ASYNC_FILE: file });
  assert.equal(config.packageRoot, '/abs/journey-x402-async');
  assert.equal(config.origin, 'https://127.0.0.1:9');
});

test('private E08 binding rejects public permissions, symlinks, hard links, relative paths and invalid packageRoot', async t => {
  const dir = await scratch(t);
  const file = path.join(dir, 'e08.json');
  await writeFile(file, binding(), { mode: 0o600 });

  await chmod(file, 0o644);
  assert.throws(() => readE08AsyncBinding({ MACHINE_GATEWAY_E08_ASYNC_FILE: file }), { message: 'invalid_e08_async_binding' });
  await chmod(file, 0o600);

  const symbolic = path.join(dir, 'linked.json');
  await symlink(file, symbolic);
  assert.throws(() => readE08AsyncBinding({ MACHINE_GATEWAY_E08_ASYNC_FILE: symbolic }), { message: 'invalid_e08_async_binding' });

  const hard = path.join(dir, 'hard.json');
  await link(file, hard);
  assert.throws(() => readE08AsyncBinding({ MACHINE_GATEWAY_E08_ASYNC_FILE: file }), { message: 'invalid_e08_async_binding' });
  await rm(hard);

  assert.throws(() => readE08AsyncBinding({ MACHINE_GATEWAY_E08_ASYNC_FILE: 'e08.json' }), { message: 'invalid_e08_async_binding' });

  await writeFile(file, binding('relative/not/abs'), { mode: 0o600 });
  assert.throws(() => readE08AsyncBinding({ MACHINE_GATEWAY_E08_ASYNC_FILE: file }), { message: 'invalid_e08_async_binding' });

  await writeFile(file, JSON.stringify({ origin: 'https://127.0.0.1:9' }), { mode: 0o600 });
  assert.throws(() => readE08AsyncBinding({ MACHINE_GATEWAY_E08_ASYNC_FILE: file }), { message: 'invalid_e08_async_binding' });
});
