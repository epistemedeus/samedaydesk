import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');
const CLI = path.join(PKG, 'bin/record-repeat.mjs');
const vendorS163 = path.join(PKG, 'vendor/s163-record-recipes');
const S163 = fs.existsSync(path.join(vendorS163, 'adapters'))
  ? vendorS163
  : path.resolve(PKG, '../s163-record-recipes');

function run(args, cwd = PKG) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function parse(stdout) {
  return JSON.parse(String(stdout).trim());
}

function inner(out) {
  return out.report?.report || out.report || {};
}

test('OpenAPI caller pair: pinned required-param delta; unpinned edit does not widen; replay keeps used ops', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-oa-'));
  const before = path.join(tmp, 'before.yaml');
  const after = path.join(tmp, 'after.yaml');
  const used = path.join(tmp, 'used.json');
  fs.copyFileSync(path.join(S163, 'sources/openapi/museum/before.yaml'), before);
  let afterTxt = fs.readFileSync(path.join(S163, 'sources/openapi/museum/after.yaml'), 'utf8');
  const paramBlock = `      parameters:
        - $ref: "#/components/parameters/StartDate"
        - $ref: "#/components/parameters/PaginationPage"
        - $ref: "#/components/parameters/PaginationLimit"`;
  assert.ok(afterTxt.includes(paramBlock), 'museum-hours parameter block missing from after.yaml');
  afterTxt = afterTxt.replace(
    paramBlock,
    `${paramBlock}
        - name: visitorId
          in: query
          required: true
          schema:
            type: string`,
  );
  fs.writeFileSync(after, afterTxt);
  assert.ok(fs.readFileSync(after, 'utf8').includes('visitorId'));
  fs.copyFileSync(path.join(S163, 'sources/openapi/museum/used-ops.pin.json'), used);

  const next = path.join(tmp, 'next.json');
  const r = parse(
    run(
      ['run', '--family', 'openapi-used-ops', '--before', before, '--after', after, '--used', used, '--write-next-run', next],
      tmp,
    ).stdout,
  );
  assert.equal(r.ok, true, JSON.stringify(r.report).slice(0, 400));
  const impact = inner(r).impact || inner(r).report?.impact;
  const changed = impact?.changed || [];
  assert.ok(
    changed.some(
      (c) =>
        String(c.key).includes('museum-hours') &&
        (c.fieldChanges || []).some((f) => f.field === 'parameters'),
    ),
    JSON.stringify(changed, null, 2).slice(0, 1500),
  );
  assert.equal(
    changed.some((c) => String(c.key).includes('unpinned-webhook')),
    false,
  );
  const man = JSON.parse(fs.readFileSync(next, 'utf8'));
  assert.ok(man.inputs.used);
  const replay = parse(
    run(['run', '--from-next-run', next, '--before', before, '--after', after, '--used', used], tmp).stdout,
  );
  const impact2 = inner(replay).impact || inner(replay).report?.impact;
  assert.equal((impact2?.changed || []).some((c) => String(c.key).includes('unpinned-webhook')), false);
  assert.ok((impact2?.changed || []).some((c) => String(c.key).includes('museum-hours')));
});

test('Pricing caller pair: same-unit value delta; absent units not comparable', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-pr-'));
  const before = path.join(tmp, 'before.json');
  const after = path.join(tmp, 'after.json');
  fs.writeFileSync(
    before,
    `${JSON.stringify({
      rows: [
        { field: 'grok-4.6-input', value: 3.0, unit: 'USD/1M-tokens' },
        { field: 'orphan', value: 1 },
      ],
    })}\n`,
  );
  fs.writeFileSync(
    after,
    `${JSON.stringify({
      rows: [
        { field: 'grok-4.6-input', value: 4.0, unit: 'USD/1M-tokens' },
        { field: 'orphan', value: 9 },
      ],
    })}\n`,
  );
  const out = parse(
    run(['run', '--family', 'pricing-row-unit', '--before', before, '--after', after], tmp).stdout,
  );
  const report = inner(out);
  const delta = (report.fieldChanges || []).find((c) => c.fieldKey === 'grok-4.6-input');
  assert.ok(delta);
  assert.equal(delta.beforeValue, 3);
  assert.equal(delta.afterValue, 4);
  assert.equal((report.fieldChanges || []).some((c) => c.fieldKey === 'orphan'), false);
  assert.ok((report.unknown || []).some((u) => u.fieldKey === 'orphan' && u.reason === 'unit-unknown'));

  const b2 = path.join(tmp, 'b2.json');
  const a2 = path.join(tmp, 'a2.json');
  fs.writeFileSync(b2, `${JSON.stringify({ rows: [{ field: 'x', value: 1, unit: 'USD/GB' }] })}\n`);
  fs.writeFileSync(a2, `${JSON.stringify({ rows: [{ field: 'x', value: 1, unit: 'USD/Gb' }] })}\n`);
  const cross = inner(parse(run(['run', '--family', 'pricing-row-unit', '--before', b2, '--after', a2], tmp).stdout));
  assert.equal((cross.unchanged || []).length, 0);
  assert.ok((cross.unitChanges || []).length >= 1 || (cross.conflicting || []).some((c) => String(c.reason).includes('unit')));
});

test('Keyed CSV caller pair: id=1 old→new is one changed row; duplicates blocked', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-csv-'));
  const before = path.join(tmp, 'before.csv');
  const after = path.join(tmp, 'after.csv');
  fs.writeFileSync(before, 'id,name\n1,old\n2,keep\n');
  fs.writeFileSync(after, 'id,name\n1,new\n2,keep\n');
  const out = parse(
    run(['run', '--family', 'csv-keyed-drift', '--before', before, '--after', after, '--key', 'id'], tmp).stdout,
  );
  const drift = inner(out).rowDrift || inner(out).report?.rowDrift;
  assert.equal(drift.mode, 'keyed');
  assert.equal(drift.changedCount, 1);
  assert.equal(drift.addedCount, 0);
  assert.equal(drift.removedCount, 0);
  assert.match(String(drift.changed[0].key), /1/);

  const dupB = path.join(tmp, 'dup-before.csv');
  const dupA = path.join(tmp, 'dup-after.csv');
  fs.writeFileSync(dupB, 'id,name\n1,a\n1,b\n');
  fs.writeFileSync(dupA, 'id,name\n1,c\n');
  const blocked = inner(
    parse(run(['run', '--family', 'csv-keyed-drift', '--before', dupB, '--after', dupA, '--key', 'id'], tmp).stdout),
  );
  const d2 = blocked.rowDrift || blocked.report?.rowDrift;
  assert.equal(d2.mode, 'duplicate-keys-blocked');
  assert.equal(d2.changedCount ?? 0, 0);
});

test('RSS/Atom caller pair: description-only correction; non-feed HTML refused', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-rss-'));
  const before = path.join(tmp, 'before.xml');
  const after = path.join(tmp, 'after.xml');
  const atom = (desc) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>caller feed</title>
  <updated>2026-09-10T00:00:00Z</updated>
  <entry>
    <id>urn:item:stable</id>
    <title>Stable</title>
    <updated>2026-09-10T00:00:00Z</updated>
    <link href="https://example.test/stable"/>
    <summary>${desc}</summary>
  </entry>
</feed>
`;
  fs.writeFileSync(before, atom('hello'));
  fs.writeFileSync(after, atom('hello-corrected'));
  const out = parse(run(['run', '--family', 'rss-atom-brief', '--before', before, '--after', after], tmp).stdout);
  const report = inner(out);
  const corrected = report.corrected || [];
  assert.ok(corrected.length >= 1, JSON.stringify(report).slice(0, 800));
  assert.ok(corrected.some((c) => (c.changes || []).some((ch) => ch.field === 'description')));
  assert.equal((report.removed || []).length, 0);

  const html = path.join(tmp, 'page.html');
  fs.writeFileSync(html, '<!doctype html><html><body>not a feed</body></html>\n');
  const refused = parse(run(['run', '--family', 'rss-atom-brief', '--before', before, '--after', html], tmp).stdout);
  assert.equal(refused.refused, true);
  assert.equal(refused.prep.code, 'non-feed-html');
});
