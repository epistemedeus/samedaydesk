import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packEvidence } from '../agent/pack_evidence.js';
import { worksheetRow } from '../bin/fee-worksheet.mjs';
import { validateManifest } from '../bin/validate-manifest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(__dirname, '..');
const fee = path.join(pkg, 'bin', 'fee-worksheet.mjs');
const validate = path.join(pkg, 'bin', 'validate-manifest.mjs');
const pack = path.join(pkg, 'agent', 'pack_evidence.js');
const manifestPath = path.join(pkg, 'grexal.json');
const identityPath = path.join(pkg, '.grexal', 'agent.json');

function run(bin, args = [], opts = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...opts });
}

test('fee worksheet matches docs at $0.10, $0.05, $0.18', () => {
  const a = JSON.parse(run(fee, ['0.10']).stdout);
  const row10 = a.rows[0];
  assert.equal(row10.platformFeeUsd, 0.02);
  assert.equal(row10.sellerEarningsUsd, 0.08);
  assert.equal(row10.effectiveFeePercent, 20);
  assert.equal(row10.binding, 'nominal-20pct');

  const b = JSON.parse(run(fee, ['0.05']).stdout);
  const row05 = b.rows[0];
  assert.equal(row05.platformFeeUsd, 0.015);
  assert.equal(row05.sellerEarningsUsd, 0.035);
  assert.equal(row05.effectiveFeePercent, 30);
  assert.equal(row05.binding, 'cap-30pct');

  const c = JSON.parse(run(fee, ['0.18']).stdout);
  const row18 = c.rows[0];
  assert.equal(row18.platformFeeUsd, 0.036);
  assert.equal(row18.sellerEarningsUsd, 0.144);
  assert.equal(row18.binding, 'nominal-20pct');

  const floorBand = worksheetRow(0.08);
  assert.equal(floorBand.platformFeeUsd, 0.02);
  assert.equal(floorBand.sellerEarningsUsd, 0.06);
  assert.equal(floorBand.binding, 'floor-0.02');
});

test('default --table includes docs rows and zero-LLM backsolve', () => {
  const t = JSON.parse(run(fee, ['--table']).stdout);
  assert.equal(t.ok, true);
  assert.equal(t.cashBoundaryUsd, 0);
  assert.equal(t.willNotPublishFromWorker, true);
  assert.equal(t.thisAgentBacksolve.upstreamLlmUsd, 0);
  assert.equal(t.thisAgentBacksolve.suggestedLineItem.amountUsd, 0.1);
  assert.ok(t.docsWorkedTable.some((r) => r.buyerChargeUsd === 0.1));
});

test('manifest validates offline against 0.4.1 rules', () => {
  const r = run(validate, [manifestPath]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.equal(j.manifest_version, 3);
  assert.equal(j.runtimeLanguage, 'typescript');
  assert.equal(j.entrypoint, 'agent/pack_evidence.js');
  assert.equal(j.identityStub.name, 'samedaydesk-source-change-evidence');
  assert.equal(j.identityStub.agentId, undefined);
});

test('grexal.json uses typed schemas and omits dashboard fields', () => {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.runtime.language, 'typescript');
  assert.equal(m.input_schema.repoPath.type, 'text');
  assert.equal(m.output_schema.acceptanceReport.type, 'json');
  assert.equal(m.output_schema.paidModelCalls.type, 'number');
  for (const k of ['name', 'description', 'category', 'tags', 'homepage', 'repository', 'icon', 'is_open_source', 'pricing', 'visibility']) {
    assert.equal(m[k], undefined, `${k} must not be in grexal.json`);
  }
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  assert.deepEqual(Object.keys(identity), ['name']);
});

test('description in grexal.json is rejected (dashboard field)', () => {
  const errors = validateManifest({
    manifest_version: 3,
    entrypoint: 'agent/pack_evidence.js',
    runtime: { language: 'typescript' },
    description: 'should not be here',
  });
  assert.ok(errors.some((e) => e.path === 'description'));
});

test('mjs entrypoint is rejected for typescript language', () => {
  const errors = validateManifest({
    manifest_version: 3,
    entrypoint: 'agent/pack_evidence.mjs',
    runtime: { language: 'typescript' },
  });
  assert.ok(errors.some((e) => e.path === 'entrypoint' && /Extension/.test(e.message)));
});

test('pack_evidence packages a supplied diff with zero model calls', () => {
  const diff = 'diff --git a/foo.txt b/foo.txt\n--- a/foo.txt\n+++ b/foo.txt\n@@ -1 +1 @@\n-old\n+new\n';
  const result = packEvidence({
    unifiedDiff: diff,
    baseRef: 'aaa',
    headRef: 'bbb',
    acceptanceNotes: 'unit test',
  });
  assert.equal(result.paidModelCalls, 0);
  assert.equal(result.commitRange, 'aaa...bbb');
  assert.equal(result.acceptanceReport.paidModelCalls, 0);
  assert.equal(result.acceptanceReport.fileCount, 1);
  assert.equal(result.evidencePack.unifiedDiff, diff);
  assert.equal(result.acceptanceReport.cashBoundaryUsd, 0);
  assert.ok(result.acceptanceReport.checks.every((c) => c.pass));
});

test('pack_evidence CLI writes diff + acceptance on a tiny git repo', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's109-grexal-pack-'));
  const git = (args) => {
    const r = spawnSync('git', ['-C', tmp, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 's109@example.test']);
  git(['config', 'user.name', 'S109']);
  fs.writeFileSync(path.join(tmp, 'a.txt'), 'one\n');
  git(['add', 'a.txt']);
  git(['commit', '-m', 'one']);
  fs.writeFileSync(path.join(tmp, 'a.txt'), 'two\n');
  git(['add', 'a.txt']);
  git(['commit', '-m', 'two']);
  const outDir = path.join(tmp, 'out');
  const r = run(pack, [
    '--repoPath',
    tmp,
    '--baseRef',
    'HEAD~1',
    '--headRef',
    'HEAD',
    '--outDir',
    outDir,
    '--acceptanceNotes',
    'tmp repo',
  ]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.paidModelCalls, 0);
  assert.equal(j.cashBoundaryUsd, 0);
  assert.ok(j.diffBytes > 0);
  const acceptance = JSON.parse(fs.readFileSync(path.join(outDir, 'acceptance.json'), 'utf8'));
  assert.equal(acceptance.paidModelCalls, 0);
  assert.ok(fs.readFileSync(path.join(outDir, 'changes.diff'), 'utf8').includes('a.txt'));
});
