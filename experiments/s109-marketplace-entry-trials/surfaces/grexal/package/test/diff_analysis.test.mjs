import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeUnifiedDiff } from '../lib/diff_analysis.js';
import { packEvidence } from '../agent/pack_evidence.js';

const fix = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../s121/fixtures/diff',
);

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
  assert.equal(r.acceptanceReport.buyerAcceptanceVerified, false);
  assert.equal(r.acceptanceReport.buyerCriteria.buyerCriteriaSatisfied, false);
});
