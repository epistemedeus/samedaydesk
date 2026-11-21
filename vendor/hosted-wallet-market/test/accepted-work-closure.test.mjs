import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClosureAdmission} from '../src/machine-closure-admission.mjs';
import {hostSourceSha256, installedSourceFiles, installedSourceSha256} from '../src/native-debt.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = 'vendor/hosted-wallet-market/src/accepted-work-publication.mjs';
const candidate = 'vendor/hosted-wallet-market/client/accepted-work-source.mjs';

test('the host pin refuses a changed or missing accepted-work runtime and recovers', async () => {
  const pin = JSON.parse(readFileSync(join(root, 'server/foundry/activation/private-control-pin.json'), 'utf8'));
  const files = installedSourceFiles();
  assert.equal(files.includes('src/accepted-work-publication.mjs'), true);
  assert.equal(files.includes('client/accepted-work-source.mjs'), true);
  for (const name of [runtime, candidate]) {
    assert.equal(pin.files[name], createHash('sha256').update(readFileSync(join(root, name))).digest('hex'), name);
  }
  const source = installedSourceSha256();
  const host = hostSourceSha256(root);
  const admission = createClosureAdmission({
    expectedSource: source,
    expectedHost: host,
    verify: () => ({sourceSha256: installedSourceSha256(), hostSha256: hostSourceSha256(root)}),
  });
  await admission.admit();
  const target = join(root, runtime);
  const original = readFileSync(target);
  const held = target + '.h133010-held';
  let moved = false;
  const refused = error => error?.codeName === 'binding_stale';
  try {
    writeFileSync(target, Buffer.concat([original, Buffer.from('\n')]));
    assert.notEqual(installedSourceSha256(), source);
    await assert.rejects(() => admission.recheck(), refused);
    writeFileSync(target, original);
    assert.equal(installedSourceSha256(), source);
    assert.equal(hostSourceSha256(root), host);
    assert.equal((await admission.recheck()).sourceSha256, source);
    renameSync(target, held);
    moved = true;
    await assert.rejects(() => admission.recheck(), refused);
    renameSync(held, target);
    moved = false;
    assert.equal((await admission.recheck()).hostSha256, host);
  } finally {
    if (moved && existsSync(held)) renameSync(held, target);
    else writeFileSync(target, original);
  }
});
