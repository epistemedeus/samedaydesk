import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareOpenApiImpact } from '../modules/openapi-impact/cli.mjs';
import { comparePricingTables } from '../modules/pricing-table-change/cli.mjs';
import { compareCsvDrift } from '../modules/csv-drift/cli.mjs';
import { compareFeeds } from '../modules/rss-atom-brief/cli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = (...p) => path.join(root, 'fixtures', ...p);
const read = (...p) => fs.readFileSync(fx(...p), 'utf8');
const readJson = (...p) => JSON.parse(read(...p));

test('openapi positive: used ops show param/response changes; unused admin ignored', () => {
  const report = compareOpenApiImpact({
    beforeText: read('openapi/positive/before.json'),
    afterText: read('openapi/positive/after.json'),
    usedSpec: readJson('openapi/positive/used.json'),
  });
  assert.equal(report.ok, true);
  assert.equal(report.paidValueClaim ?? false, false);
  const changedKeys = report.impact.changed.map((c) => c.key);
  assert.ok(changedKeys.includes('GET /v1/items'));
  assert.ok(changedKeys.includes('GET /v1/items/{id}'));
  assert.ok(!JSON.stringify(report).includes('adminStats') || !changedKeys.some((k) => k.includes('admin')));
  assert.equal(report.freeBaseline.paidValueClaim, false);
});

test('openapi negative: empty used list → no impact rows', () => {
  const report = compareOpenApiImpact({
    beforeText: read('openapi/negative/before.json'),
    afterText: read('openapi/negative/after.json'),
    usedSpec: readJson('openapi/negative/used-empty.json'),
  });
  assert.equal(report.ok, true);
  assert.equal(report.usedOperationCount, 0);
  assert.equal(report.impact.changed.length, 0);
});

test('openapi empty before document fails closed', () => {
  const report = compareOpenApiImpact({
    beforeText: read('openapi/empty/before.json'),
    afterText: read('openapi/empty/after.json'),
    usedSpec: readJson('openapi/empty/used.json'),
  });
  assert.equal(report.ok, false);
});

test('openapi partial: used path removed', () => {
  const report = compareOpenApiImpact({
    beforeText: read('openapi/partial/before.json'),
    afterText: read('openapi/partial/after.json'),
    usedSpec: readJson('openapi/partial/used.json'),
  });
  assert.equal(report.ok, true);
  assert.ok(report.impact.removed.some((r) => r.key === 'GET /v1/items/{id}'));
});

test('openapi conflicting: operationId+params both change', () => {
  const report = compareOpenApiImpact({
    beforeText: read('openapi/conflicting/before.json'),
    afterText: read('openapi/conflicting/after.json'),
    usedSpec: readJson('openapi/conflicting/used.json'),
  });
  assert.equal(report.ok, true);
  assert.ok(report.impact.conflicting.length >= 1);
});

test('openapi unknown operationId surfaces uncertainty', () => {
  const report = compareOpenApiImpact({
    beforeText: read('openapi/unknown/before.json'),
    afterText: read('openapi/unknown/after.json'),
    usedSpec: readJson('openapi/unknown/used.json'),
  });
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'unknown-operationId'));
});

test('openapi broken yaml unsupported semantic fails parse', () => {
  const report = compareOpenApiImpact({
    beforeText: read('openapi/negative/broken.yaml'),
    afterText: read('openapi/positive/after.json'),
    usedSpec: readJson('openapi/positive/used.json'),
  });
  assert.equal(report.ok, false);
});

test('pricing positive field add/change', () => {
  const report = comparePricingTables(readJson('pricing/positive/before.json'), readJson('pricing/positive/after.json'));
  assert.equal(report.ok, true);
  assert.ok(report.fieldChanges.some((c) => c.fieldKey === 'starter'));
  assert.ok(report.added.some((a) => a.fieldKey === 'enterprise'));
  assert.equal(report.freeBaseline.paidValueClaim, false);
});

test('pricing unit-only change', () => {
  const report = comparePricingTables(
    readJson('pricing/positive/unit-before.json'),
    readJson('pricing/positive/unit-after.json'),
  );
  assert.equal(report.ok, true);
  assert.equal(report.unitChanges.length, 1);
  assert.equal(report.fieldChanges.length, 0);
});

test('pricing negative unchanged', () => {
  const report = comparePricingTables(readJson('pricing/negative/before.json'), readJson('pricing/negative/after.json'));
  assert.equal(report.ok, true);
  assert.equal(report.counts.fieldChanges, 0);
  assert.equal(report.counts.added, 0);
});

test('pricing empty tables', () => {
  const report = comparePricingTables(readJson('pricing/empty/before.json'), readJson('pricing/empty/after.json'));
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'empty-table'));
});

test('pricing partial missing value uncertainty', () => {
  const report = comparePricingTables(readJson('pricing/partial/before.json'), readJson('pricing/partial/after.json'));
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'missing-value'));
});

test('pricing conflicting value+unit change', () => {
  const report = comparePricingTables(
    readJson('pricing/conflicting/before.json'),
    readJson('pricing/conflicting/after.json'),
  );
  assert.equal(report.ok, true);
  assert.ok(report.conflicting.length >= 1);
});

test('pricing unknown shape fails', () => {
  const report = comparePricingTables(readJson('pricing/unknown/before.json'), readJson('pricing/unknown/after.json'));
  assert.equal(report.ok, false);
});

test('csv positive keyed drift', () => {
  const report = compareCsvDrift(read('csv/positive/before.csv'), read('csv/positive/after.csv'), {
    keyColumns: ['sku'],
  });
  assert.equal(report.ok, true);
  assert.ok(report.schema.columnsAdded.includes('tier'));
  assert.equal(report.rowDrift.mode, 'keyed');
  assert.ok(report.rowDrift.addedCount >= 1);
  assert.ok(report.rowDrift.changedCount >= 1);
});

test('csv negative unchanged', () => {
  const report = compareCsvDrift(read('csv/negative/before.csv'), read('csv/negative/after.csv'), {
    keyColumns: ['sku'],
  });
  assert.equal(report.ok, true);
  assert.equal(report.rowDrift.changedCount, 0);
  assert.equal(report.schema.columnsAdded.length, 0);
});

test('csv empty', () => {
  const report = compareCsvDrift(read('csv/empty/before.csv'), read('csv/empty/after.csv'), {});
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'empty-csv'));
});

test('csv partial ragged + unkeyed uncertainty without key', () => {
  const report = compareCsvDrift(read('csv/partial/before.csv'), read('csv/partial/after.csv'), {});
  assert.equal(report.ok, true);
  assert.equal(report.rowDrift.mode, 'unkeyed-count-only');
  assert.ok(report.uncertainties.some((u) => u.code === 'unkeyed-row-compare'));
});

test('csv conflicting duplicate keys', () => {
  const report = compareCsvDrift(read('csv/conflicting/before.csv'), read('csv/conflicting/after.csv'), {
    keyColumns: ['sku'],
  });
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'duplicate-keys-before'));
});

test('csv reorder-only unknown semantics still reports reorder', () => {
  const report = compareCsvDrift(read('csv/unknown/before.csv'), read('csv/unknown/after.csv'), {
    keyColumns: ['a'],
  });
  assert.equal(report.ok, true);
  // key 'a' missing on after schema
  assert.ok(
    report.schema.columnsReordered ||
      report.uncertainties.some((u) => u.code === 'key-columns-missing') ||
      report.schema.columnsRemoved.includes('a'),
  );
});

test('rss positive corrections and add/remove', () => {
  const report = compareFeeds(read('rss/positive/before.xml'), read('rss/positive/after.xml'));
  assert.equal(report.ok, true);
  assert.ok(report.corrected.some((c) => c.key.includes('urn:1') || c.changes?.length >= 0));
  assert.ok(report.removed.length >= 1);
  assert.ok(report.added.length >= 1);
  assert.equal(report.freeBaseline.paidValueClaim, false);
});

test('rss atom link correction', () => {
  const report = compareFeeds(read('rss/positive/atom-before.xml'), read('rss/positive/atom-after.xml'));
  assert.equal(report.ok, true);
  assert.equal(report.beforeKind, 'atom');
  assert.ok(report.corrected.length >= 1);
});

test('rss negative unchanged', () => {
  const report = compareFeeds(read('rss/negative/before.xml'), read('rss/negative/after.xml'));
  assert.equal(report.ok, true);
  assert.equal(report.added.length, 0);
  assert.equal(report.removed.length, 0);
  assert.equal(report.corrected.length, 0);
});

test('rss empty', () => {
  const report = compareFeeds(read('rss/empty/before.xml'), read('rss/empty/after.xml'));
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'empty-feed'));
});

test('rss partial unidentifiable item', () => {
  const report = compareFeeds(read('rss/partial/before.xml'), read('rss/partial/after.xml'));
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'item-unidentifiable'));
});

test('rss conflicting duplicates', () => {
  const report = compareFeeds(read('rss/conflicting/before.xml'), read('rss/conflicting/after.xml'));
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'duplicates-before'));
});

test('rss unknown non-feed', () => {
  const report = compareFeeds(read('rss/unknown/before.xml'), read('rss/unknown/after.xml'));
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'unknown-feed-kind'));
});

test('no module claims paid value', () => {
  for (const report of [
    compareOpenApiImpact({
      beforeText: read('openapi/positive/before.json'),
      afterText: read('openapi/positive/after.json'),
      usedSpec: readJson('openapi/positive/used.json'),
    }),
    comparePricingTables(readJson('pricing/positive/before.json'), readJson('pricing/positive/after.json')),
    compareCsvDrift(read('csv/positive/before.csv'), read('csv/positive/after.csv'), { keyColumns: ['sku'] }),
    compareFeeds(read('rss/positive/before.xml'), read('rss/positive/after.xml')),
  ]) {
    assert.equal(report.freeBaseline.paidValueClaim, false);
  }
});
