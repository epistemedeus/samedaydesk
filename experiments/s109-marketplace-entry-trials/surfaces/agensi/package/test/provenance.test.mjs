import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareProvenance } from '../bin/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(__dirname, '..');
const baselineDir = path.resolve(pkg, 'fixtures/free');
const candidateDir = path.resolve(pkg, 'fixtures/paid');
const PIN = 'epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666';

const CONTROLLER_CLUTTER = [
  'officialHosts',
  'unrelatedHostDoNotEnter',
  'cashBoundaryUsd',
  'unknowns',
  'listingPerformed',
  'mcpPaidUnlockPerformed',
  'claimsProprietaryOwnershipOfFreeRecipes',
  'paidDeliverableIs',
  'freeAlternativeIs',
  'exclusivityClaim',
  'licenseClaim',
  'surface',
];

test('provenance: reports packaging delta without controller clutter', () => {
  const r = compareProvenance({ baselineDir, candidateDir, skillRecipePin: PIN });
  assert.equal(r.skillRecipePin, PIN);
  assert.equal(r.sourceRevisionVerified, false);
  assert.deepEqual(r.packagingDeltaFiles, ['ACCEPTANCE.md', 'DELIVERY.md']);
  assert.deepEqual(r.identicalSample, ['SKILL.md']);
  assert.deepEqual(r.addedFiles, ['ACCEPTANCE.md', 'DELIVERY.md']);
  assert.deepEqual(r.removedFiles, ['README.md']);
  assert.deepEqual(r.modifiedFiles, []);
  assert.equal(r.counts.modified, 0);
  assert.equal(r.counts.candidateOnly, 2);
  assert.equal(r.counts.baselineOnly, 1);
  assert.equal(r.counts.baselineFiles, 2);
  assert.equal(r.counts.candidateFiles, 3);
  assert.equal(r.counts.identical, 1);
  assert.deepEqual(r.excludedDirectoryNames, ['.git', 'node_modules']);
  assert.deepEqual(r.inputLabels, { baseline: 'supplied baseline', candidate: 'supplied candidate' });
  for (const key of CONTROLLER_CLUTTER) assert.equal(Object.hasOwn(r, key), false, key);
});

test('provenance accepts legacy freeDir/paidDir aliases', () => {
  const a = compareProvenance({ baselineDir, candidateDir });
  const b = compareProvenance({ freeDir: baselineDir, paidDir: candidateDir });
  assert.deepEqual(a, b);
});

test('provenance.mjs CLI exits 0 on fixtures with baseline/candidate names', () => {
  const r = spawnSync(
    process.execPath,
    [path.join(pkg, 'bin/provenance.mjs'), '--baselineDir', baselineDir, '--candidateDir', candidateDir, '--skillRecipePin', PIN],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.packagingDeltaFiles, ['ACCEPTANCE.md', 'DELIVERY.md']);
  assert.equal(j.sourceRevisionVerified, false);
  for (const key of CONTROLLER_CLUTTER) assert.equal(Object.hasOwn(j, key), false, key);
});

test('provenance.mjs CLI accepts legacy --freeDir/--paidDir', () => {
  const r = spawnSync(
    process.execPath,
    [path.join(pkg, 'bin/provenance.mjs'), '--freeDir', baselineDir, '--paidDir', candidateDir],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.counts.candidateOnly, 2);
});
