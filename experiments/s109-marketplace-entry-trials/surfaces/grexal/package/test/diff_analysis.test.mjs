import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeUnifiedDiff } from '../lib/diff_analysis.js';
import {
  packEvidence,
  normalizeRangeOp,
  describeRangeSemantics,
  DEFAULT_RANGE_OP,
} from '../agent/pack_evidence.js';

function resolveDiffFixtures() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const env = process.env.S121_FIXTURES;
  const candidates = [];
  if (env) {
    candidates.push(path.resolve(env, 'diff'));
    candidates.push(path.resolve(env));
  }
  // S109 tree: surfaces/grexal/package/test → ../../../../s121/fixtures/diff
  candidates.push(path.resolve(here, '../../../../s121/fixtures/diff'));
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, 'simple.patch')));
  return found || candidates[candidates.length - 1];
}
const fix = resolveDiffFixtures();

test('truncated fixture fails structural truncation check', () => {
  const text = fs.readFileSync(path.join(fix, 'truncated.patch'), 'utf8');
  const a = analyzeUnifiedDiff(text);
  assert.equal(a.looksTruncated || a.truncatedHunk, true);
  const r = packEvidence({ unifiedDiff: text });
  assert.equal(r.structuralChecksPass, false);
  assert.equal(r.acceptanceReport.gitApplyVerified, false);
});

test('malicious paths fail', () => {
  const text = fs.readFileSync(path.join(fix, 'malicious-paths.patch'), 'utf8');
  const r = packEvidence({ unifiedDiff: text });
  assert.equal(r.structuralChecksPass, false);
  assert.ok(r.acceptanceReport.unsafePaths.length >= 1);
});

test('rename/binary/nonewline detected', () => {
  const text = fs.readFileSync(path.join(fix, 'rename-binary-nonewline.patch'), 'utf8');
  const r = packEvidence({ unifiedDiff: text });
  assert.equal(r.acceptanceReport.renameDetected, true);
  assert.equal(r.acceptanceReport.binaryDetected, true);
  assert.equal(r.acceptanceReport.noNewlineMarkers, true);
});

test('buyer noteOnly does not verify acceptance', () => {
  const text = fs.readFileSync(path.join(fix, 'simple.patch'), 'utf8');
  const r = packEvidence({
    unifiedDiff: text,
    buyerCriteria: [
      { id: 'structural', type: 'requireStructuralPass' },
      { id: 'human', type: 'noteOnly' },
    ],
  });
  assert.equal(r.structuralChecksPass, true);
  assert.equal(r.buyerAcceptanceVerified, false);
  assert.equal(r.acceptanceReport.buyerAcceptanceVerified, false);
  assert.equal(r.acceptanceReport.buyerCriteria.buyerCriteriaSatisfied, false);
});

test('require-structural fixture: syntactically valid ≠ work accepted', () => {
  const text = fs.readFileSync(path.join(fix, 'simple.patch'), 'utf8');
  const criteria = JSON.parse(
    fs.readFileSync(path.resolve(fix, '../criteria/require-structural.json'), 'utf8'),
  );
  const r = packEvidence({ unifiedDiff: text, buyerCriteria: criteria });
  assert.equal(r.structuralChecksPass, true);
  assert.equal(r.acceptanceReport.allChecksPass, true);
  assert.equal(r.acceptanceReport.allChecksPassScope, 'structural-packaging-checks-only');
  assert.equal(r.gitApplyVerified, false);
  assert.equal(r.buyerAcceptanceVerified, false);
  assert.equal(r.acceptanceReport.buyerAcceptanceVerified, false);
  assert.equal(r.acceptanceReport.escrowApproval, false);
  const bc = r.acceptanceReport.buyerCriteria;
  assert.equal(bc.buyerCriteriaProvided, true);
  assert.equal(bc.buyerCriteriaSatisfied, false);
  assert.equal(bc.localBindingSatisfied, false);
  assert.equal(bc.bindingKind, 'local');
  assert.equal(bc.escrowApproval, false);
  assert.equal(bc.buyerAcceptanceVerified, false);
  const human = bc.results.find((x) => x.id === 'human-review');
  assert.equal(human.type, 'noteOnly');
  assert.equal(human.pass, false);
  assert.match(human.detail, /buyer must visually confirm intent/);
  const structural = bc.results.find((x) => x.id === 'structural');
  assert.equal(structural.pass, true);
});

test('satisfied local machine criteria are still not escrow', () => {
  const text = fs.readFileSync(path.join(fix, 'simple.patch'), 'utf8');
  const r = packEvidence({
    unifiedDiff: text,
    buyerCriteria: [
      { id: 'structural', type: 'requireStructuralPass' },
      { id: 'no-trunc', type: 'forbidTruncated' },
    ],
  });
  assert.equal(r.structuralChecksPass, true);
  const bc = r.acceptanceReport.buyerCriteria;
  assert.equal(bc.buyerCriteriaSatisfied, true);
  assert.equal(bc.localBindingSatisfied, true);
  assert.equal(bc.bindingKind, 'local');
  assert.equal(bc.escrowApproval, false);
  assert.equal(bc.buyerAcceptanceVerified, false);
  assert.equal(r.acceptanceReport.buyerAcceptanceVerified, false);
  assert.equal(r.buyerAcceptanceVerified, false);
});

test('rangeOp default is three-dot; unknown values are rejected not coerced', () => {
  assert.equal(normalizeRangeOp(undefined), '...');
  assert.equal(normalizeRangeOp(null), '...');
  assert.equal(normalizeRangeOp('...'), '...');
  assert.equal(normalizeRangeOp('..'), '..');
  assert.equal(DEFAULT_RANGE_OP, '...');
  assert.throws(() => normalizeRangeOp('....'), /not interchangeable/);
  assert.throws(() => normalizeRangeOp('…'), /rangeOp must be/);
  const invoked = describeRangeSemantics({ rangeOp: '...', gitInvoked: true });
  const supplied = describeRangeSemantics({ rangeOp: '...', gitInvoked: false });
  assert.match(invoked, /merge-base/);
  assert.doesNotMatch(invoked, /git was not invoked/);
  assert.match(supplied, /git was not invoked/);
});

test('supplied unifiedDiff does not claim executed git three-dot semantics', () => {
  const text = fs.readFileSync(path.join(fix, 'simple.patch'), 'utf8');
  const d = packEvidence({ unifiedDiff: text });
  assert.equal(d.acceptanceReport.rangeOp, '...');
  assert.equal(d.acceptanceReport.gitRangeExecuted, false);
  assert.match(d.acceptanceReport.rangeSemantics, /git was not invoked/);
  assert.equal(d.acceptanceReport.gitApplyVerified, false);
  assert.equal(d.grexalPaidExecution, false);

  const two = packEvidence({ unifiedDiff: text, rangeOp: '..' });
  assert.equal(two.acceptanceReport.rangeOp, '..');
  assert.equal(two.evidencePack.unifiedDiff, d.evidencePack.unifiedDiff);
  assert.match(two.acceptanceReport.rangeSemantics, /git was not invoked/);
  assert.throws(() => packEvidence({ unifiedDiff: text, rangeOp: '....' }), /not interchangeable/);
});

test('two-dot and three-dot are not equated on a diverged merge-base', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's121-c1-range-'));
  const git = (args) => {
    const r = spawnSync('git', ['-C', tmp, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 's121-c1@example.test']);
  git(['config', 'user.name', 'S121 C1']);
  git(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(tmp, 'file.txt'), 'base\n');
  git(['add', 'file.txt']);
  git(['commit', '-m', 'base']);
  const base = git(['rev-parse', 'HEAD']).stdout.trim();
  fs.writeFileSync(path.join(tmp, 'file.txt'), 'base\nmain-only\n');
  git(['add', 'file.txt']);
  git(['commit', '-m', 'main-only']);
  git(['checkout', '-b', 'feature', base]);
  fs.writeFileSync(path.join(tmp, 'file.txt'), 'base\nfeature-only\n');
  git(['add', 'file.txt']);
  git(['commit', '-m', 'feature-only']);

  const three = packEvidence({
    repoPath: tmp,
    baseRef: 'main',
    headRef: 'feature',
    rangeOp: '...',
  });
  const two = packEvidence({
    repoPath: tmp,
    baseRef: 'main',
    headRef: 'feature',
    rangeOp: '..',
  });
  const def = packEvidence({
    repoPath: tmp,
    baseRef: 'main',
    headRef: 'feature',
  });

  assert.notEqual(two.evidencePack.unifiedDiff, three.evidencePack.unifiedDiff);
  assert.equal(def.evidencePack.unifiedDiff, three.evidencePack.unifiedDiff);
  assert.equal(three.commitRange, 'main...feature');
  assert.equal(two.commitRange, 'main..feature');
  assert.equal(three.acceptanceReport.rangeOp, '...');
  assert.equal(two.acceptanceReport.rangeOp, '..');
  assert.equal(three.acceptanceReport.gitRangeExecuted, true);
  assert.equal(two.acceptanceReport.gitRangeExecuted, true);
  assert.match(three.acceptanceReport.rangeSemantics, /merge-base/);
  assert.doesNotMatch(three.acceptanceReport.rangeSemantics, /git was not invoked/);
  assert.match(two.acceptanceReport.rangeSemantics, /two-dot/);
  assert.ok(three.evidencePack.unifiedDiff.includes('+feature-only'));
  assert.equal(three.evidencePack.unifiedDiff.includes('-main-only'), false);
  assert.ok(two.evidencePack.unifiedDiff.includes('-main-only'));
  assert.ok(two.evidencePack.unifiedDiff.includes('+feature-only'));
  assert.equal(three.acceptanceReport.gitApplyVerified, false);
  assert.equal(three.grexalPaidExecution, false);
});

test('oversized fixture fails size limit at maxDiffBytes 100000', () => {
  const text = fs.readFileSync(path.join(fix, 'oversized.patch'), 'utf8');
  assert.ok(Buffer.byteLength(text, 'utf8') > 100000);
  const r = packEvidence({ unifiedDiff: text, maxDiffBytes: 100000 });
  assert.equal(r.structuralChecksPass, false);
  const size = r.acceptanceReport.checks.find((c) => c.id === 'diff-size-limit');
  assert.ok(size);
  assert.equal(size.pass, false);
  assert.equal(r.evidencePack.analysis.exceedsMaxBytes, true);
  assert.equal(r.evidencePack.unifiedDiff, null);
  assert.equal(r.evidencePack.unifiedDiffOmitted, true);
  assert.equal(typeof r.evidencePack.unifiedDiffSha256, 'string');
  assert.equal(r.evidencePack.unifiedDiffSha256.length, 64);
  assert.equal(r.evidencePack.analysis.maxDiffBytes, 100000);
  assert.equal(r.acceptanceReport.gitApplyVerified, false);
  assert.equal(r.grexalPaidExecution, false);
});

test('quoted, +++-only, backslash, and unprefixed path traversal fail closed', () => {
  const cases = [
    'diff --git "a/../../etc/passwd" "b/../../etc/passwd"\n--- a/../../etc/passwd\n+++ b/../../etc/passwd\n@@ -1 +1 @@\n-x\n+y\n',
    'diff --git a/safe.txt b/safe.txt\n--- a/safe.txt\n+++ b/../../etc/passwd\n@@ -1 +1 @@\n-x\n+y\n',
    'diff --git a/..\\..\\etc\\passwd b/..\\..\\etc\\passwd\n--- a/..\\..\\etc\\passwd\n+++ b/..\\..\\etc\\passwd\n@@ -1 +1 @@\n-x\n+y\n',
    'diff --git ../../etc/passwd ../../etc/passwd\n--- ../../etc/passwd\n+++ ../../etc/passwd\n@@ -1 +1 @@\n-x\n+y\n',
    'diff --git a/safe.txt b/safe.txt\nsimilarity index 100%\nrename from safe.txt\nrename to ../../etc/shadow\n',
  ];
  for (const text of cases) {
    const r = packEvidence({ unifiedDiff: text });
    assert.equal(r.structuralChecksPass, false, text.split('\n')[0]);
    assert.ok(r.acceptanceReport.unsafePaths.length >= 1, text.split('\n')[0]);
    assert.equal(r.acceptanceReport.gitApplyVerified, false);
  }

  const addViaDevNull =
    'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+hi\n';
  const ok = packEvidence({ unifiedDiff: addViaDevNull });
  assert.equal(ok.structuralChecksPass, true);
  assert.deepEqual(ok.acceptanceReport.unsafePaths, []);
});
