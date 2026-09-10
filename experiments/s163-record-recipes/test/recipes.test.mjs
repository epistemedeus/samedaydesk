import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePricingTable } from '../adapters/pricing-row-unit.mjs';
import { loadUsedOpsPin, buildNextRunManifest } from '../adapters/openapi-used-ops.mjs';
import { prepareKeyedCsvPair } from '../adapters/csv-keyed.mjs';
import { prepareFeedCapture } from '../adapters/rss-atom.mjs';
import { ROOT, s134Module, runNode, parseCliJson } from '../demos/lib.mjs';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('registry lists four families and excludes bot native05..08', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(pkg, 'registry/recipes.json'), 'utf8'));
  assert.ok(String(reg.s134Pin || reg.s134Commit).startsWith('65ce186'));
  assert.equal(reg.families.length, 4);
  const excl = reg.excludes?.botRecordNativeCells || reg.excludes?.botRecordNativeCells;
  assert.ok(excl?.includes('native05'));
});

test('openapi used-ops pin loads and CLI matches expected unchanged count', () => {
  const used = path.join(pkg, 'sources/openapi/museum/used-ops.pin.json');
  const pin = loadUsedOpsPin(used);
  assert.equal(pin.ok, true);
  const r = runNode(s134Module('openapi-impact'), [
    '--before',
    path.join(pkg, 'sources/openapi/museum/before.yaml'),
    '--after',
    path.join(pkg, 'sources/openapi/museum/after.yaml'),
    '--used',
    used,
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const report = parseCliJson(r.stdout).report;
  assert.equal(report.ok, true);
  assert.equal(report.usedOperationCount, 5);
  assert.equal(report.impact.changed.length, 0);
  assert.equal(report.impact.unchanged.length, 5);
  const man = buildNextRunManifest('R-OPENAPI-PIN-IMPACT', {
    before: 'sources/openapi/museum/before.yaml',
    after: 'sources/openapi/museum/after.yaml',
    usedPin: 'sources/openapi/museum/used-ops.pin.json',
    sourceMeta: JSON.parse(fs.readFileSync(path.join(pkg, 'sources/openapi/museum/SOURCE.json'), 'utf8')),
    lastReport: report,
  });
  assert.equal(man.parser, 's134-openapi-impact');
  assert.equal(man.coverage.scope, 'used-operations-only');
});

test('pricing unit case change and HTML refuse', () => {
  const html = preparePricingTable(path.join(pkg, 'sources/pricing/public-model-rows/unsupported-page.html'));
  assert.equal(html.refused, true);
  assert.equal(html.code, 'unsupported-html-extraction');
  const r = runNode(s134Module('pricing-table-change'), [
    '--before',
    path.join(pkg, 'sources/pricing/public-model-rows/before.json'),
    '--after',
    path.join(pkg, 'sources/pricing/public-model-rows/after-unit-case.json'),
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const report = parseCliJson(r.stdout).report;
  assert.equal(report.counts.unitChanges, 1);
  assert.equal(report.unitChanges[0].fieldKey, 'grok-4.6-input');
  assert.match(report.unitChanges[0].numericComparison, /not-applicable-across-units/);
});

test('csv keyed change, dup block, and real no-row-change', () => {
  const prep = prepareKeyedCsvPair({
    before: path.join(pkg, 'sources/csv/airline-safety/synthetic-keyed-before.csv'),
    after: path.join(pkg, 'sources/csv/airline-safety/synthetic-keyed-after.csv'),
    keyColumns: ['airline'],
  });
  assert.equal(prep.ok, true);
  let r = runNode(s134Module('csv-drift'), ['--before', prep.before, '--after', prep.after, '--key', 'airline']);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  let report = parseCliJson(r.stdout).report;
  assert.equal(report.rowDrift.mode, 'keyed');
  assert.ok(report.rowDrift.changedCount >= 1);

  r = runNode(s134Module('csv-drift'), [
    '--before',
    path.join(pkg, 'sources/csv/airline-safety/synthetic-dup-before.csv'),
    '--after',
    path.join(pkg, 'sources/csv/airline-safety/synthetic-dup-after.csv'),
    '--key',
    'airline',
  ]);
  report = parseCliJson(r.stdout).report;
  assert.equal(report.rowDrift.mode, 'duplicate-keys-blocked');

  r = runNode(s134Module('csv-drift'), [
    '--before',
    path.join(pkg, 'sources/csv/airline-safety/before.csv'),
    '--after',
    path.join(pkg, 'sources/csv/airline-safety/after.csv'),
    '--key',
    'airline',
  ]);
  report = parseCliJson(r.stdout).report;
  assert.equal(report.rowDrift.mode, 'keyed');
  assert.equal(report.rowDrift.changedCount, 0);
});

test('rss live no-change and synthetic correction', () => {
  const live = prepareFeedCapture(path.join(pkg, 'sources/feeds/electron-releases/capture-a.xml'));
  assert.equal(live.ok, true);
  assert.equal(live.synthetic, false);
  let r = runNode(s134Module('rss-atom-brief'), [
    '--before',
    path.join(pkg, 'sources/feeds/electron-releases/capture-a.xml'),
    '--after',
    path.join(pkg, 'sources/feeds/electron-releases/capture-b.xml'),
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  let report = parseCliJson(r.stdout).report;
  assert.equal(report.comparisonStatus, 'comparable');
  assert.equal((report.corrected || []).length, 0);

  const syn = prepareFeedCapture(path.join(pkg, 'sources/feeds/nodejs-releases/synthetic-correction-dedup-after.xml'));
  assert.equal(syn.synthetic, true);
  r = runNode(s134Module('rss-atom-brief'), [
    '--before',
    path.join(pkg, 'sources/feeds/nodejs-releases/synthetic-correction-dedup-before.xml'),
    '--after',
    path.join(pkg, 'sources/feeds/nodejs-releases/synthetic-correction-dedup-after.xml'),
  ]);
  report = parseCliJson(r.stdout).report;
  assert.equal(report.comparisonStatus, 'comparable');
  assert.ok((report.corrected || []).length >= 1);
});

test('S134 modules remain present at pin (s163 does not replace them)', () => {
  assert.ok(fs.existsSync(path.join(ROOT, '../s134-record-jobs/modules/csv-drift/cli.mjs')));
});
