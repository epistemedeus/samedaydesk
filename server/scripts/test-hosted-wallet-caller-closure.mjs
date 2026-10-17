import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {acceptedCallerPin, verifyCallerClosure} from '../foundry/activation/remote-private-journey.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const mountPath = join(root, 'server/lib/hosted-wallet-market-mount.js');
const prior = {
  base: '4e24f9b5001aa5a527ca9ba3ecda98c97d4c7134',
  sourcePinSha256: '02d42a4d5777ae94082547dabc842c9ff035afc0354e1e7678ced72daef18e15',
  closureDigest: 'sha256:a7c8221a09a4ed27f0655cca316eba00e08c542250fa46cefdce864e109832f5',
};

test('hosted wallet mount is a declared caller and a tampered copy is refused', () => {
  const pin = JSON.parse(readFileSync(join(root, 'server/foundry/activation/private-control-pin.json'), 'utf8'));
  assert.equal(typeof pin.files['server/lib/hosted-wallet-market-mount.js'], 'string');
  assert.equal(pin.base, '3f2bd95dd1d2dc81f88b83ce8999830788f76c12');
  const current = verifyCallerClosure();
  assert.match(current.closureDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(acceptedCallerPin(current, current), true);
  assert.equal(acceptedCallerPin(prior, current), true);
  assert.equal(acceptedCallerPin({...prior, closureDigest: `sha256:${'c'.repeat(64)}`}, current), false);
  const original = readFileSync(mountPath);
  try {
    writeFileSync(mountPath, Buffer.concat([original, Buffer.from('\nchanged-by-caller-control\n')]));
    assert.throws(() => verifyCallerClosure(), error => error.code === 'caller_source_changed');
  } finally {
    writeFileSync(mountPath, original);
  }
  assert.equal(verifyCallerClosure().base, current.base);
});
