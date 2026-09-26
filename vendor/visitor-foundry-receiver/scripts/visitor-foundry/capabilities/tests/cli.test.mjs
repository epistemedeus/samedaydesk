import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { packageFixture, request, NOW } from '../examples/fixtures.mjs';
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const testsDir = fileURLToPath(new URL('.', import.meta.url));
function run(...args) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 }); }
function temp(fn) {
  const dir = mkdtempSync(join(testsDir, '.tmp-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('cold CLI demo and holdouts execute without npm install/network', () => {
  for (const command of ['demo', 'holdouts', 'schemas', 'help']) { const r = run(command); assert.equal(r.status, 0, r.stderr); assert.ok(JSON.parse(r.stdout)); }
});
test('cold JSON export/import resolves explicit policy, defaults to unknown without it', () => temp(dir => {
  for (const key of ['snapshot', 'request', 'policy']) {
    const output = run('fixture', key); assert.equal(output.status, 0, output.stderr); writeFileSync(join(dir, `${key}.json`), output.stdout);
  }
  const args = ['resolve', '--snapshot', join(dir, 'snapshot.json'), '--request', join(dir, 'request.json'), '--now', NOW, '--limit', '1'];
  const unknown = run(...args); assert.equal(unknown.status, 0, unknown.stderr); assert.equal(JSON.parse(unknown.stdout).status, 'unknown');
  const hit = run(...args, '--policy', join(dir, 'policy.json')); assert.equal(hit.status, 0, hit.stderr); assert.equal(JSON.parse(hit.stdout).status, 'compatible');
}));
test('CLI rejects malformed files, unknown flags, duplicate flags and unsupported commands', () => temp(dir => {
  const bad = join(dir, 'malformed.json'); writeFileSync(bad, '{not JSON');
  for (const args of [['resolve', '--snapshot', bad], ['build', '--input', dir], ['demo', '--exec', 'echo owned'], ['schemas', 'extra'],
    ['fixture', 'nope'], ['arbitrary-command'], ['build', '--input', bad, '--input', bad]]) {
    const r = run(...args); assert.equal(r.status, 2, r.stdout); assert.ok(JSON.parse(r.stderr).code); assert.equal(r.stdout, '');
  }
}));
test('contributed commands remain inert JSON; input mutation cannot falsify snapshot digest', () => temp(dir => {
  const fixture = packageFixture(), raw = structuredClone(fixture.snapshot);
  raw.versions[0].provenance.original.testProposal = 'process.exit(99)';
  const input = join(dir, 'tampered.json'); writeFileSync(input, JSON.stringify(raw));
  const r = run('list', '--snapshot', input); assert.equal(r.status, 2); assert.equal(JSON.parse(r.stderr).code, 'CONTENT_MISMATCH');
}));
