import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { CLIENT_ROOT, PYTHON, pythonEnv } from './helpers.mjs';

test('current archive consumer ownership and delivery regression suite', () => {
  const result = spawnSync(PYTHON, ['-m', 'unittest', 'discover', '-s', `${CLIENT_ROOT}/test`, '-p', 'test_review.py', '-v'], {
    env: pythonEnv(), encoding: 'utf8', timeout: 90_000,
  });
  process.stdout.write(result.stdout || '');
  process.stdout.write(result.stderr || '');
  assert.equal(result.status, 0, result.error?.message || result.stderr);
});
