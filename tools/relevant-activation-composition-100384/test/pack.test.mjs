import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pack } from '../scripts/pack.mjs';
import { envFor, example, run, sdsHost, successful } from './helpers.mjs';

test('a successor refuses a historical source pin that lacks its actual executable closure', () => {
  assert.throws(() => pack(undefined, '1f333f33e088ffd466f8ce13fb7202e8d4e6d0b5'), /source pin/);
});

test('minimal licensed closure is deterministic and two stripped extracted callers run actual useful SDS work', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sol384-export-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const first = pack(join(dir, 'first'), 'qa-source-pin');
  const second = pack(join(dir, 'second'), 'qa-source-pin');
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.ein.acquiredMembers, 39);
  assert.equal(first.ein.modified, false);
  assert.equal(first.published, false);
  assert.equal(first.credentialsIncluded, false);
  for (const item of first.files) assert.equal(/(?:test\/|private\.json|\.grant$|node_modules|evidence\/|backend)/.test(item.path), false);
  const sds = await sdsHost(t);
  const decisions = [];
  for (const [index, name] of [['a', 'existing-business'], ['b', 'ambiguous']]) {
    const extracted = join(dir, index); mkdirSync(extracted);
    const unpack = spawnSync('tar', ['-xzf', join(dir, 'first', first.archive), '-C', extracted], { encoding: 'utf8' });
    assert.equal(unpack.status, 0);
    const cwd = join(extracted, first.name);
    const input = example(name), env = envFor(input.task, sds.base, extracted);
    const output = successful(await run(['plan'], { cwd, binPath: join(cwd, 'bin/sds-activation.mjs'), env, input }));
    decisions.push(output.category);
    assert.equal(output.service, null);
    assert.ok(output.work.nextAction.body);
    assert.equal(output.work.result.checkerSafety.paymentSent, false);
    const license = readFileSync(join(cwd, 'vendor/ein-activation-continuation/LICENSE'), 'utf8');
    assert.match(license, /MIT/);
  }
  assert.deepEqual(decisions, ['existing_business_setup', 'unknown_prerequisite']);
});
