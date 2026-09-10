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

test('list exposes four families and excludes bot native05..08', () => {
  const r = run(['list']);
  assert.equal(r.status, 0, r.stderr);
  const out = parse(r.stdout);
  assert.equal(out.families.length, 4);
  const blob = JSON.stringify(out);
  assert.ok(blob.includes('native05'));
  assert.equal(out.paidValueClaim, false);
  assert.equal(out.freeOffline, true);
});

test('positive samples for four families', () => {
  for (const recipe of [
    'R-OPENAPI-PIN-IMPACT',
    'R-PRICE-UNIT-CASE',
    'R-CSV-KEYED-CHANGE',
    'R-FEED-LIVE-NOCHANGE',
  ]) {
    const r = run(['sample', '--recipe', recipe]);
    assert.equal(r.status, 0, `${recipe}: ${r.stderr || r.stdout}`);
    const out = parse(r.stdout);
    assert.equal(out.ok, true, recipe);
    assert.equal(out.paidValueClaim, false);
  }
});

test('HTML pricing refuse stays explicit', () => {
  const r = run(['sample', '--recipe', 'R-PRICE-REFUSE-HTML']);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = parse(r.stdout);
  assert.equal(out.refused, true);
  assert.equal(out.prep.code, 'unsupported-html-extraction');
});

test('duplicate CSV identity is honest blocked mode', () => {
  const r = run(['sample', '--recipe', 'R-CSV-DUP-IDENTITY']);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = parse(r.stdout);
  assert.equal(out.ok, true);
  const blob = JSON.stringify(out.report);
  assert.ok(blob.includes('duplicate') || blob.includes('dup'), blob.slice(0, 500));
});

test('malformed openapi used pin refuses without synthesis', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's176-bad-pin-'));
  const pin = path.join(tmp, 'used.json');
  fs.writeFileSync(pin, JSON.stringify({ operations: [{ nope: true }] }));
  const before = path.join(S163, 'sources/openapi/museum/before.yaml');
  const after = path.join(S163, 'sources/openapi/museum/after.yaml');
  const r = run([
    'run',
    '--family',
    'openapi-used-ops',
    '--before',
    before,
    '--after',
    after,
    '--used',
    pin,
  ]);
  const out = parse(r.stdout);
  assert.equal(out.refused, true);
});

test('next-run manifest enables repeat without private workspace', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's176-next-'));
  const nextPath = path.join(tmp, 'next.json');
  const r1 = run(['sample', '--recipe', 'R-OPENAPI-PIN-IMPACT', '--write-next-run', nextPath]);
  assert.equal(r1.status, 0, r1.stderr || r1.stdout);
  assert.ok(fs.existsSync(nextPath));
  const man = JSON.parse(fs.readFileSync(nextPath, 'utf8'));
  const before = path.join(S163, 'sources/openapi/museum/before.yaml');
  const after = path.join(S163, 'sources/openapi/museum/after.yaml');
  const used = path.join(S163, 'sources/openapi/museum/used-ops.pin.json');
  const r2 = run([
    'run',
    '--from-next-run',
    nextPath,
    '--before',
    before,
    '--after',
    after,
    '--used',
    used,
  ]);
  assert.equal(r2.status, 0, r2.stderr || r2.stdout);
  const second = parse(r2.stdout);
  assert.equal(second.ok, true);
  assert.ok(man.family || man.parser);
  assert.equal(man.paidValueClaim, false);
});

test('package pin and manifest declare both source tips', () => {
  const pin = JSON.parse(fs.readFileSync(path.join(PKG, 'PIN.json'), 'utf8'));
  const man = JSON.parse(fs.readFileSync(path.join(PKG, 'MANIFEST.json'), 'utf8'));
  assert.equal(pin.parserPin, '65ce1867f1b4339cc708bfb72a7d9a5942785632');
  assert.equal(pin.recipePin, 'a022eb6352156dcdcdf2f8730931f5891bd01436');
  assert.equal(man.families.length, 4);
});

test('missing used-ops pin file refuses instead of throwing', () => {
  const r = run([
    'run',
    '--family',
    'openapi-used-ops',
    '--before',
    path.join(S163, 'sources/openapi/museum/before.yaml'),
    '--after',
    path.join(S163, 'sources/openapi/museum/after.yaml'),
    '--used',
    path.join(os.tmpdir(), 's176-no-used.json'),
  ]);
  assert.equal(r.status, 0, r.stderr);
  const out = parse(r.stdout);
  assert.equal(out.refused, true);
  assert.equal(out.prep.code, 'empty-used-ops-pin');
});

test('missing openapi captures refuse without parser ENOENT', () => {
  const r = run([
    'run',
    '--family',
    'openapi-used-ops',
    '--before',
    '/tmp/s176-no-before.yaml',
    '--after',
    '/tmp/s176-no-after.yaml',
    '--used',
    path.join(S163, 'sources/openapi/museum/used-ops.pin.json'),
  ]);
  assert.equal(r.status, 0, r.stderr);
  const out = parse(r.stdout);
  assert.equal(out.refused, true);
  assert.equal(out.prep.code, 'missing-openapi-capture');
});

test('from-next-run missing and invalid JSON refuse', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's176-nrun-'));
  const r1 = run(['run', '--from-next-run', path.join(tmp, 'missing.json')]);
  assert.equal(r1.status, 0, r1.stderr);
  const o1 = parse(r1.stdout);
  assert.equal(o1.refused, true);
  assert.equal(o1.prep.code, 'missing-next-run-manifest');

  const bad = path.join(tmp, 'bad.json');
  fs.writeFileSync(bad, 'not json\n');
  const r2 = run(['run', '--from-next-run', bad]);
  assert.equal(r2.status, 0, r2.stderr);
  const o2 = parse(r2.stdout);
  assert.equal(o2.refused, true);
  assert.equal(o2.prep.code, 'invalid-next-run-manifest');
});

test('from-next-run resolves captures relative to the manifest directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's176-relman-'));
  fs.copyFileSync(
    path.join(S163, 'sources/pricing/public-model-rows/before.json'),
    path.join(tmp, 'before.json'),
  );
  fs.copyFileSync(
    path.join(S163, 'sources/pricing/public-model-rows/after-unit-case.json'),
    path.join(tmp, 'after.json'),
  );
  const manPath = path.join(tmp, 'next.json');
  fs.writeFileSync(
    manPath,
    `${JSON.stringify({
      schema: 's176.next-run-manifest.v1',
      family: 'pricing-row-unit',
      parser: 's134-pricing-table-change',
      inputs: { before: 'before.json', after: 'after.json' },
      paidValueClaim: false,
    }, null, 2)}\n`,
  );
  const r = run(['run', '--from-next-run', manPath], os.tmpdir());
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.refused, undefined);
});

test('write-next-run without a file path refuses instead of throwing', () => {
  const r = run(['sample', '--recipe', 'R-OPENAPI-PIN-IMPACT', '--write-next-run']);
  assert.equal(r.status, 0, r.stderr);
  const out = parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.nextRun.refused, true);
  assert.equal(out.nextRun.prep.code, 'invalid-next-run-path');
});

test('from-next-run rewrite copies sourceMeta and pricing stores resolved paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's176-inherit-'));
  const sourceMetaPath = path.join(S163, 'sources/openapi/museum/SOURCE.json');
  const sourceMeta = JSON.parse(fs.readFileSync(sourceMetaPath, 'utf8'));
  fs.copyFileSync(path.join(S163, 'sources/openapi/museum/before.yaml'), path.join(tmp, 'before.yaml'));
  fs.copyFileSync(path.join(S163, 'sources/openapi/museum/after.yaml'), path.join(tmp, 'after.yaml'));
  fs.copyFileSync(path.join(S163, 'sources/openapi/museum/used-ops.pin.json'), path.join(tmp, 'used.json'));
  const srcPath = path.join(tmp, 'imported.json');
  fs.writeFileSync(
    srcPath,
    `${JSON.stringify({
      schema: 's176.next-run-manifest.v1',
      recipeId: 'R-OPENAPI-PIN-IMPACT',
      family: 'openapi-used-ops',
      parser: 's134-openapi-impact',
      inputs: { before: 'before.yaml', after: 'after.yaml', used: 'used.json' },
      sourceMeta,
      paidValueClaim: false,
    }, null, 2)}\n`,
  );
  const outPath = path.join(tmp, 'replayed.json');
  const r1 = run(['run', '--from-next-run', srcPath, '--write-next-run', outPath], tmp);
  assert.equal(r1.status, 0, r1.stderr || r1.stdout);
  const replayed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.deepEqual(replayed.sourceMeta, sourceMeta);
  assert.equal(replayed.paidValueClaim, false);

  const pricePath = path.join(tmp, 'price-next.json');
  const r2 = run(['sample', '--recipe', 'R-PRICE-UNIT-CASE', '--write-next-run', pricePath]);
  assert.equal(r2.status, 0, r2.stderr || r2.stdout);
  const priceMan = JSON.parse(fs.readFileSync(pricePath, 'utf8'));
  assert.ok(path.isAbsolute(priceMan.inputs.before), priceMan.inputs.before);
  assert.ok(fs.existsSync(priceMan.inputs.before));
  assert.ok(fs.existsSync(priceMan.inputs.after));
  assert.ok(priceMan.sourceMeta);
});
