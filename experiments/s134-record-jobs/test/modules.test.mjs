import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareOpenApiImpact } from '../modules/openapi-impact/cli.mjs';
import { comparePricingTables } from '../modules/pricing-table-change/cli.mjs';
import { compareCsvDrift, parseCsvFile } from '../modules/csv-drift/cli.mjs';
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
  assert.equal(report.comparisonStatus, 'indeterminate');
  assert.equal(report.removed.length, 0);
  assert.equal(report.unchangedCount, 0);
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
  assert.ok(report.conflicting.length >= 1);
  assert.equal(report.unchangedCount, 0);
});

test('rss unknown non-feed', () => {
  const report = compareFeeds(read('rss/unknown/before.xml'), read('rss/unknown/after.xml'));
  assert.equal(report.ok, true);
  assert.ok(report.uncertainties.some((u) => u.code === 'unknown-feed-kind'));
  assert.equal(report.comparisonStatus, 'indeterminate');
  assert.equal(report.removed.length, 0);
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

test('s142 gate: openapi used op security+$ref change is not unchanged', () => {
  const before = {
    openapi: '3.0.3',
    info: { title: 't', version: '1' },
    paths: {
      '/x': {
        get: {
          operationId: 'getX',
          security: [{ apiKey: [] }],
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/A' } } },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'X' }, oauth2: { type: 'oauth2', flows: {} } },
      schemas: { A: { type: 'object' }, B: { type: 'object' } },
    },
  };
  const after = structuredClone(before);
  after.paths['/x'].get.security = [{ oauth2: ['read'] }];
  after.paths['/x'].get.responses['200'].content['application/json'].schema.$ref = '#/components/schemas/B';
  const report = compareOpenApiImpact({
    beforeText: JSON.stringify(before),
    afterText: JSON.stringify(after),
    usedSpec: { operations: [{ method: 'get', path: '/x' }] },
  });
  assert.equal(report.ok, true);
  assert.equal(report.impact.unchanged.length, 0);
  const fields = report.impact.changed.flatMap((c) => c.fieldChanges.map((f) => f.field));
  assert.ok(fields.includes('security'));
  assert.ok(fields.includes('responses'));
});

test('s189: missing/blank units are unit-unknown, not silent unchanged or priced fieldChanges', () => {
  const omitted = comparePricingTables(
    { rows: [{ field: 'x', value: 1 }] },
    { rows: [{ field: 'x', value: 1 }] },
  );
  assert.equal(omitted.unchanged.length, 0);
  assert.equal(omitted.fieldChanges.length, 0);
  assert.ok(omitted.unknown.some((u) => u.reason === 'unit-unknown'));
  assert.ok(omitted.uncertainties.some((u) => u.code === 'missing-unit'));

  const valueShift = comparePricingTables(
    { rows: [{ field: 'x', value: 1 }] },
    { rows: [{ field: 'x', value: 2 }] },
  );
  assert.equal(valueShift.fieldChanges.length, 0);
  assert.ok(valueShift.unknown.some((u) => u.reason === 'unit-unknown'));

  const blank = comparePricingTables(
    { rows: [{ field: 'x', value: 1, unit: '   ' }] },
    { rows: [{ field: 'x', value: 1, unit: '\t' }] },
  );
  assert.equal(blank.unchanged.length, 0);
  assert.ok(blank.unknown.some((u) => u.reason === 'unit-unknown'));

  const sameUnit = comparePricingTables(
    { rows: [{ field: 'x', value: 1, unit: 'USD/mo' }] },
    { rows: [{ field: 'x', value: 2, unit: 'USD/mo' }] },
  );
  assert.equal(sameUnit.fieldChanges.length, 1);
  assert.equal(sameUnit.fieldChanges[0].beforeValue, 1);
  assert.equal(sameUnit.fieldChanges[0].afterValue, 2);

  const caseUnit = comparePricingTables(
    { rows: [{ field: 'egress', value: 1, unit: 'USD/GB' }] },
    { rows: [{ field: 'egress', value: 1, unit: 'USD/Gb' }] },
  );
  assert.equal(caseUnit.unchanged.length, 0);
  assert.ok(caseUnit.unitChanges.length >= 1 || caseUnit.conflicting.some((c) => String(c.reason).includes('unit')));
});

test('s142 gate: pricing refuses cross-unit and missing-cell as fieldChanges', () => {
  const report = comparePricingTables(
    { rows: [{ field: 'a', value: 1, unit: 'USD/mo' }, { field: 'b', value: 2, unit: 'USD/mo' }] },
    { rows: [{ field: 'a', value: 1, unit: 'EUR/mo' }, { field: 'b', value: null, unit: 'USD/mo' }] },
  );
  assert.equal(report.ok, true);
  assert.equal(report.fieldChanges.length, 0);
  assert.ok(report.conflicting.some((c) => c.reason === 'cross-unit-incomparable'));
  assert.ok(report.conflicting.some((c) => c.reason === 'missing-cell'));
});

test('s142 gate: csv duplicate keys block silent overwrite', () => {
  const report = compareCsvDrift('sku,price\nA,1\nA,2\n', 'sku,price\nA,3\n', { keyColumns: ['sku'] });
  assert.equal(report.ok, true);
  assert.equal(report.rowDrift.mode, 'duplicate-keys-blocked');
  assert.equal(report.rowDrift.changedCount ?? 0, 0);
});

test('s142 gate: rss exposes missing-item-id and date-ambiguity', () => {
  const before = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>T</title><pubDate>yesterday</pubDate></item>
    <item><title>U</title><guid>urn:u</guid><pubDate>02/01/2024</pubDate></item>
  </channel></rss>`;
  const after = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>T</title><pubDate>today</pubDate></item>
    <item><title>U</title><guid>urn:u</guid><pubDate>2024-01-02</pubDate></item>
  </channel></rss>`;
  const report = compareFeeds(before, after);
  assert.equal(report.ok, true);
  const codes = report.uncertainties.map((u) => u.code);
  assert.ok(codes.includes('missing-item-id'));
  assert.ok(codes.includes('date-ambiguity'));
  assert.ok((report.corrected || []).length >= 1);
});


test('s147 F1: local $ref param required + enum + requestBody.required + response schema not false-unchanged', () => {
  const base = {
    openapi: '3.0.3',
    info: { title: 'F', version: '1' },
    security: [],
    paths: {
      '/x': {
        get: {
          parameters: [{ $ref: '#/components/parameters/Q' }],
          responses: { '200': { description: 'ok' } },
        },
      },
    },
    components: {
      parameters: { Q: { name: 'q', in: 'query', required: false, schema: { type: 'string' } } },
      securitySchemes: { k: { type: 'apiKey', in: 'header', name: 'X-Key' } },
    },
  };
  const afterReq = structuredClone(base);
  afterReq.components.parameters.Q.required = true;
  let report = compareOpenApiImpact({
    beforeText: JSON.stringify(base),
    afterText: JSON.stringify(afterReq),
    usedSpec: { operations: [{ method: 'get', path: '/x' }] },
  });
  assert.equal(report.impact.unchanged.length, 0);
  assert.ok(report.impact.changed.some((c) => c.fieldChanges.some((f) => f.field === 'parameters')));

  const inl = structuredClone(base);
  inl.paths['/x'].get.parameters = [{ name: 'q', in: 'query', schema: { type: 'string', enum: ['a', 'b'] } }];
  const inl2 = structuredClone(inl);
  inl2.paths['/x'].get.parameters[0].schema.enum = ['a'];
  report = compareOpenApiImpact({
    beforeText: JSON.stringify(inl),
    afterText: JSON.stringify(inl2),
    usedSpec: { operations: [{ method: 'get', path: '/x' }] },
  });
  assert.equal(report.impact.unchanged.length, 0);

  const rb = {
    openapi: '3.0.3',
    info: { title: 'F', version: '1' },
    paths: {
      '/x': {
        post: {
          requestBody: { required: false, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { '200': { description: 'ok' } },
        },
      },
    },
  };
  const rb2 = structuredClone(rb);
  rb2.paths['/x'].post.requestBody.required = true;
  report = compareOpenApiImpact({
    beforeText: JSON.stringify(rb),
    afterText: JSON.stringify(rb2),
    usedSpec: { operations: [{ method: 'post', path: '/x' }] },
  });
  assert.equal(report.impact.unchanged.length, 0);
  assert.ok(report.impact.changed.some((c) => c.fieldChanges.some((f) => f.field === 'requestBody')));

  const rs = structuredClone(base);
  rs.paths['/x'].get.parameters = [];
  rs.paths['/x'].get.responses = {
    '200': {
      description: 'ok',
      content: { 'application/json': { schema: { type: 'object', properties: { a: { type: 'string' } } } } },
    },
  };
  const rs2 = structuredClone(rs);
  rs2.paths['/x'].get.responses['200'].content['application/json'].schema.properties = { a: { type: 'integer' } };
  report = compareOpenApiImpact({
    beforeText: JSON.stringify(rs),
    afterText: JSON.stringify(rs2),
    usedSpec: { operations: [{ method: 'get', path: '/x' }] },
  });
  assert.equal(report.impact.unchanged.length, 0);
  assert.ok(report.impact.changed.some((c) => c.fieldChanges.some((f) => f.field === 'responses')));
});

test('s147 F2: USD/GB vs USD/Gb are not unchanged', () => {
  const report = comparePricingTables(
    [{ field: 'egress', value: 1, unit: 'USD/GB' }],
    [{ field: 'egress', value: 1, unit: 'USD/Gb' }],
  );
  assert.equal(report.unchanged.length, 0);
  assert.ok(report.unitChanges.length >= 1 || report.conflicting.some((c) => String(c.reason).includes('unit')));
});

test('s147 F3: duplicate headers / width overflow / short row do not invent schema removals', () => {
  let report = compareCsvDrift('id,v,v\nx,A,Z\n', 'id,v,v\nx,B,Z\n', { keyColumns: ['id'] });
  assert.deepEqual(report.schema.beforeHeaders, ['id', 'v', 'v']);
  assert.ok(String(report.rowDrift.mode).includes('duplicate-header'));
  assert.equal(report.rowDrift.changedCount ?? 0, 0);

  report = compareCsvDrift('id,v\nx,A,old\n', 'id,v\nx,A,new\n', { keyColumns: ['id'] });
  assert.equal(report.schema.columnsRemoved.length, 0);
  assert.ok((report.rowDrift.changedCount ?? report.rowDrift.changed?.length ?? 0) >= 1);

  report = compareCsvDrift('id,v\nx,A\n', 'id,v\nx\n', { keyColumns: ['id'] });
  assert.equal(report.schema.columnsRemoved.length, 0);
  assert.ok(report.rowDrift.changed.some((c) => c.fields.some((f) => f.column === 'v')));
});

test('s147 F4: feed duplicate identities are conflicting not unchanged', () => {
  const before = `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>
<item><guid>urn:x</guid><title>old</title></item>
<item><guid>urn:x</guid><title>stable</title></item>
</channel></rss>`;
  const after = `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>
<item><guid>urn:x</guid><title>new</title></item>
<item><guid>urn:x</guid><title>stable</title></item>
</channel></rss>`;
  const report = compareFeeds(before, after);
  assert.equal(report.unchangedCount, 0);
  assert.ok(report.conflicting.length >= 1);
});

test('s147 F5: description-only body edit is corrected with coverage', () => {
  const before = `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title><link>https://example.invalid/</link><description>F</description>
<item><guid isPermaLink="false">urn:x</guid><title>T</title><description>Old body</description></item>
</channel></rss>`;
  const after = before.replace('Old body', 'Corrected body');
  const report = compareFeeds(before, after);
  assert.equal(report.unchangedCount, 0);
  assert.ok(report.corrected.some((c) => c.changes.some((ch) => ch.field === 'description')));
  assert.ok(report.coverage?.comparedFields?.includes('description'));
});

test('s147 F6: empty/non-feed after is indeterminate without removals; valid empty feed can remove', () => {
  const before = `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>
<item><guid>urn:x</guid><title>T</title><description>Body</description></item>
</channel></rss>`;
  let report = compareFeeds(before, '');
  assert.equal(report.comparisonStatus, 'indeterminate');
  assert.equal(report.removed.length, 0);
  report = compareFeeds(before, '<html><body>Unavailable</body></html>');
  assert.equal(report.comparisonStatus, 'indeterminate');
  assert.equal(report.removed.length, 0);
  report = compareFeeds(before, `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title></channel></rss>`);
  assert.equal(report.comparisonStatus, 'comparable');
  assert.ok(report.removed.some((r) => r.key === 'urn:x'));
});

test('s154: __status / __extraFields / __proto__ headers compare (no __ skip / no meta collision)', () => {
  let report = compareCsvDrift('id,__status\nx,old\n', 'id,__status\nx,new\n', { keyColumns: ['id'] });
  assert.equal(report.rowDrift.mode, 'keyed');
  assert.ok(report.rowDrift.changedCount >= 1);
  assert.ok(
    report.rowDrift.changed.some((c) =>
      c.fields.some((f) => f.column === '__status' && f.before === 'old' && f.after === 'new'),
    ),
  );

  report = compareCsvDrift('id,__extraFields\nx,old\n', 'id,__extraFields\nx,new\n', { keyColumns: ['id'] });
  assert.ok(report.rowDrift.changed.some((c) => c.fields.some((f) => f.column === '__extraFields')));
  assert.equal(report.rowDrift.changed[0].metaChanges, undefined);

  report = compareCsvDrift('id,__proto__\nx,old\n', 'id,__proto__\nx,new\n', { keyColumns: ['id'] });
  assert.ok(
    report.rowDrift.changed.some((c) => c.fields.some((f) => f.column === '__proto__' && f.after === 'new')),
  );
});

test('s154: empty vs missing presence; ragged meta separate from cells', () => {
  const report = compareCsvDrift('id,v\nx,\n', 'id,v\nx\n', { keyColumns: ['id'] });
  assert.equal(report.schema.columnsRemoved.length, 0);
  const ch = report.rowDrift.changed[0];
  assert.ok(ch.fields.some((f) => f.column === 'v' && f.beforePresence === 'empty' && f.afterPresence === 'missing'));
  assert.ok(ch.metaChanges.some((m) => m.field === 'rowWidth'));

  const wide = compareCsvDrift('id,v\nx,A,old\n', 'id,v\nx,A,new\n', { keyColumns: ['id'] });
  assert.ok(wide.rowDrift.changedCount >= 1);
  assert.ok(wide.rowDrift.changed[0].metaChanges.some((m) => m.field === 'extraFields'));
  assert.ok(!('extraFields' in (wide.rowDrift.changed[0].row?.cells || {})));
});

test('s154: duplicate headers still blocked; columns:false keeps first row; relax:false errors', () => {
  const dup = compareCsvDrift('id,v,v\nx,A,Z\n', 'id,v,v\nx,B,Z\n', { keyColumns: ['id'] });
  assert.ok(String(dup.rowDrift.mode).includes('duplicate-header'));

  const matrix = parseCsvFile('a,b\n1,2\n3,4\n', 't', { columns: false });
  assert.equal(matrix.headerRecord, null);
  assert.equal(matrix.rows.length, 3);
  assert.deepEqual(matrix.rows[0].values, ['a', 'b']);

  const bad = parseCsvFile('a,b\n1\n', 't', { relax: false });
  assert.equal(bad.ok, false);
  assert.equal(bad.parseStatus, 'error');
});

