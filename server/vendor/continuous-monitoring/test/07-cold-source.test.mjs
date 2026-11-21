import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
test('the documented dependency-free monitor demo works from a cold source tree with only its maintained foundation', { timeout: 15000 }, async t => {
  const source = fileURLToPath(new URL('../', import.meta.url));
  const directory = await mkdtemp(path.join(tmpdir(), 'monitor-cold-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const installed = path.join(directory, 'services/continuous-monitoring');
  await cp(source, installed, { recursive: true, filter: name => !['node_modules', 'evidence', 'releases'].includes(path.basename(name)) });
  const foundation = path.join(directory, 'packages/change-monitor'); await mkdir(foundation, { recursive: true });
  for (const entry of ['src', 'vendor', 'package.json']) await cp(new URL(`../vendor/change-monitor/${entry}`, import.meta.url),
    path.join(foundation, entry), { recursive: true });
  const help = await exec(process.execPath, [path.join(installed, 'src/cli.mjs'), '--help']);
  assert.match(help.stdout, /Usage:.*cli\.mjs.*serve\|tick\|provision\|revoke\|maintenance/);
  const run = await exec('npm', ['run', 'demo', '--prefix', installed], { timeout: 10000, env: { ...process.env, NODE_ENV: 'test' } });
  const proof = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
  assert.equal(proof.originRequests, 2); assert.equal(proof.acknowledgedEvents, 1);
  assert.equal(proof.testedRestarts, 2); assert.equal(proof.immutableBaselinePrice, 10);
  assert.equal(proof.deployed, false); assert.equal(proof.cost.automaticCharge, false);
});
