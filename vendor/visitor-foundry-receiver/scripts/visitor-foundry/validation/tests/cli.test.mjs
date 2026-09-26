import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { artifact, brief, environmentDigest, evaluator, harness } from '../fixtures/example-config.mjs';
import { createFixtureJsonRunner } from '../src/index.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = `${root}cli.mjs`;
const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 20000 });

test('three cold CLI processes produce candidate, independent replay fixture receipt and later reuse evidence', () => {
  mkdirSync(`${root}.local`, { recursive: true }); const dir = mkdtempSync(`${root}.local/test-cold-`);
  try {
    const result = run(['example', '--directory', dir]); assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout); assert.equal(report.separateColdProcesses, 3); assert.equal(report.accepted, 'accepted'); assert.equal(report.taskSucceeded, true); assert.equal(report.repeatedTaskSuppressed, true); assert.equal(report.externalUsefulTasks, 0);
    const reuse = JSON.parse(readFileSync(`${dir}/reuse.json`, 'utf8')); assert.equal(reuse.productionExecution, false); assert.equal(reuse.cohorts.arms.contribution.expected, 1); assert.equal(reuse.cohorts.arms.reuse_only.costs.unknownCount, 1);
    const forged = JSON.parse(readFileSync(`${dir}/verified.json`, 'utf8')); forged.receipt.observed.checks[0].status = 'fail'; writeFileSync(`${dir}/forged.json`, JSON.stringify(forged));
    const rejected = run(['reuse', '--input', `${dir}/forged.json`, '--output', `${dir}/forged-result.json`]); assert.equal(rejected.status, 2); assert.match(rejected.stderr, /saved_receipt_replay_mismatch/);
    const repeat = run(['example', '--directory', dir]); assert.equal(repeat.status, 2); // Immutable evidence files cannot be overwritten.
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fixture runner refuses arbitrary regex and artifact drift and cannot masquerade as production', () => {
  assert.throws(() => createFixtureJsonRunner({ evaluator, environmentDigest, brief: { ...brief, objectiveChecks: [{ id: 'check:evil', check: { kind: 'regex_match', pattern: '(a+)+$' } }] } }), /unbounded_check_refused/);
  const h = harness(); const a = h.accept().assignment; const run = createFixtureJsonRunner({ evaluator, environmentDigest, brief });
  assert.throws(() => run({ assignment: a, artifact: { ...artifact, maxDescriptionLength: 900 }, receiptId: 'receipt:bad', observedAt: h.now() }), /artifact_digest_mismatch/);
  assert.throws(() => run({ assignment: { ...a, mode: 'trusted_runner' }, artifact, receiptId: 'receipt:bad', observedAt: h.now() }), /fixture_runner_only/);
});

test('CLI rejects authority/payment/code-execution flags', () => {
  for (const flag of ['--live', '--approve', '--pay', '--verifier', '--exec']) assert.equal(run(['example', flag, 'yes']).status, 2);
});
