// The historical CI packet remains a source refusal on this tree.
// This test passes only when that decoder process exits 1.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

test('historical acquisition packet stays a source refusal', {timeout: 180000}, async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const env = {...process.env};
  delete env.ROOT10940_CI_PACKET;
  // A nested node keeps the test-runner context and exits 0 without the script.
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_CHANNEL_FD;
  const child = spawn(process.execPath, [
    'server/scripts/decode-root10940-ci-packet.mjs',
    '--packet',
    'server/scripts/fixtures/h136010-historical-acquisition-packet.json',
  ], {cwd: root, env});
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { out += chunk; });
  const [code, signal] = await once(child, 'exit');
  assert.equal(signal, null);
  assert.equal(code, 1);
  assert.match(out, /5901396f689599405791d35cd706af2e54724ab285f5890124b4f018bba691d2/);
  assert.match(out, /9c57f71bb55d1d7b33e7ecc824393a1b55909b2da7f80ad5bd9d6ae8d872ba3d/);
});
