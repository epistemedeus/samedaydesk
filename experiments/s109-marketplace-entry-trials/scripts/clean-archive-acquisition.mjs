#!/usr/bin/env node
/**
 * Clean-archive acquisition tests for S109 packages (offline preferred).
 * Verifies runnable paths relative to repository root.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXP = path.resolve(__dirname, '..');
const REPO = path.resolve(EXP, '../..');

const checks = [];
function run(name, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: REPO, ...opts });
  checks.push({
    name,
    ok: r.status === 0,
    status: r.status,
    stdoutTail: (r.stdout || '').slice(-400),
    stderrTail: (r.stderr || '').slice(-200),
  });
}

const mustExist = [
  'experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/checklist.mjs',
  'experiments/s109-marketplace-entry-trials/surfaces/grexal/package/grexal.json',
  'experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs',
  'experiments/s109-marketplace-entry-trials/surfaces/dealwork/package/bin/discover.mjs',
  'experiments/s109-marketplace-entry-trials/fixtures/dealwork-jobs-sample.json',
  'experiments/s109-marketplace-entry-trials/fixtures/grexal-payments.txt',
  'experiments/s109-marketplace-entry-trials/scripts/buyer-worksheet.mjs',
];

for (const rel of mustExist) {
  const p = path.join(REPO, rel);
  checks.push({ name: `exists:${rel}`, ok: fs.existsSync(p), path: rel });
}

run('agensi-checklist', process.execPath, [
  'experiments/s109-marketplace-entry-trials/surfaces/agensi/package/bin/checklist.mjs',
]);
run('agensi-npm-test', 'npm', ['--prefix', 'experiments/s109-marketplace-entry-trials/surfaces/agensi/package', 'test']);
run('grexal-validate', process.execPath, [
  'experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/validate-manifest.mjs',
]);
run('grexal-fee-010', process.execPath, [
  'experiments/s109-marketplace-entry-trials/surfaces/grexal/package/bin/fee-worksheet.mjs',
  '0.10',
]);
run('grexal-npm-test', 'npm', ['--prefix', 'experiments/s109-marketplace-entry-trials/surfaces/grexal/package', 'test']);
run('dealwork-discover', process.execPath, [
  'experiments/s109-marketplace-entry-trials/surfaces/dealwork/package/bin/discover.mjs',
]);
run('dealwork-npm-test', 'npm', ['--prefix', 'experiments/s109-marketplace-entry-trials/surfaces/dealwork/package', 'test']);
run('buyer-agensi', process.execPath, [
  'experiments/s109-marketplace-entry-trials/scripts/buyer-worksheet.mjs',
  'agensi',
]);
run('buyer-grexal', process.execPath, [
  'experiments/s109-marketplace-entry-trials/scripts/buyer-worksheet.mjs',
  'grexal',
]);
run('buyer-dealwork', process.execPath, [
  'experiments/s109-marketplace-entry-trials/scripts/buyer-worksheet.mjs',
  'dealwork',
]);

const failed = checks.filter((c) => !c.ok);
const summary = {
  cashBoundaryUsd: 0,
  repoRootRelative: true,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.map((f) => f.name),
  checks,
};
const outDir = path.join(EXP, 'receipts');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'clean-archive-acquisition.json'), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: failed.length === 0, passed: summary.passed, total: summary.total, failed: summary.failed }, null, 2)}\n`);
process.exit(failed.length ? 1 : 0);
