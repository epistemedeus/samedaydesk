import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_CAPTURE_BYTES } from '../bin/limits.mjs';

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

function innerReport(out) {
  return out.report?.report || out.report || {};
}

test('F1: manifest-sourced paths ignore competing same-named CWD files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-f1-'));
  const manDir = path.join(tmp, 'man');
  const cwd = path.join(tmp, 'cwd');
  fs.mkdirSync(manDir);
  fs.mkdirSync(cwd);
  fs.copyFileSync(path.join(S163, 'sources/pricing/public-model-rows/before.json'), path.join(manDir, 'before.json'));
  fs.copyFileSync(
    path.join(S163, 'sources/pricing/public-model-rows/after-unit-case.json'),
    path.join(manDir, 'after.json'),
  );
  fs.writeFileSync(
    path.join(manDir, 'next.json'),
    `${JSON.stringify({
      schema: 's176.next-run-manifest.v1',
      family: 'pricing-row-unit',
      parser: 's134-pricing-table-change',
      inputs: { before: 'before.json', after: 'after.json' },
      paidValueClaim: false,
    }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(cwd, 'before.json'),
    `${JSON.stringify({ rows: [{ field: 'spoiler', value: 1, unit: 'USD' }] })}\n`,
  );
  fs.writeFileSync(
    path.join(cwd, 'after.json'),
    `${JSON.stringify({ rows: [{ field: 'spoiler', value: 9, unit: 'USD' }] })}\n`,
  );
  const r = run(['run', '--from-next-run', path.join(manDir, 'next.json')], cwd);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.inputs.before, path.join(manDir, 'before.json'));
  assert.equal(out.inputs.after, path.join(manDir, 'after.json'));
  const report = innerReport(out);
  assert.ok((report.unitChanges || []).length >= 1 || (report.counts?.unitChanges || 0) >= 1);

  const moved = path.join(tmp, 'moved-pair');
  fs.cpSync(manDir, moved, { recursive: true });
  const r2 = run(['run', '--from-next-run', path.join(moved, 'next.json')], cwd);
  assert.equal(r2.status, 0, r2.stderr || r2.stdout);
  const out2 = parse(r2.stdout);
  assert.equal(out2.inputs.before, path.join(moved, 'before.json'));
});

test('F1: explicit CLI override still resolves against CWD', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-f1cli-'));
  const manDir = path.join(tmp, 'man');
  fs.mkdirSync(manDir);
  fs.copyFileSync(path.join(S163, 'sources/pricing/public-model-rows/before.json'), path.join(manDir, 'before.json'));
  fs.copyFileSync(
    path.join(S163, 'sources/pricing/public-model-rows/after-unit-case.json'),
    path.join(manDir, 'after.json'),
  );
  fs.writeFileSync(
    path.join(manDir, 'next.json'),
    `${JSON.stringify({
      schema: 's176.next-run-manifest.v1',
      family: 'pricing-row-unit',
      parser: 's134-pricing-table-change',
      inputs: { before: 'before.json', after: 'after.json' },
      paidValueClaim: false,
    }, null, 2)}\n`,
  );
  const cwd = path.join(tmp, 'cwd');
  fs.mkdirSync(cwd);
  fs.writeFileSync(
    path.join(cwd, 'override-after.json'),
    `${JSON.stringify({
      rows: [
        { field: 'gpt-4.1-input', value: 2.0, unit: 'USD/1M-tokens' },
        { field: 'gpt-4.1-output', value: 8.0, unit: 'USD/1M-tokens' },
        { field: 'grok-4.6-input', value: 9.0, unit: 'USD/1M-tokens' },
        { field: 'grok-4.6-output', value: 15.0, unit: 'USD/1M-tokens' },
      ],
    })}\n`,
  );
  const r = run(
    [
      'run',
      '--from-next-run',
      path.join(manDir, 'next.json'),
      '--after',
      'override-after.json',
    ],
    cwd,
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = parse(r.stdout);
  assert.equal(out.inputs.after, path.join(cwd, 'override-after.json'));
  const changes = innerReport(out).fieldChanges || [];
  assert.ok(changes.some((c) => c.fieldKey === 'grok-4.6-input' && c.afterValue === 9));
});

test('F2: --write-next-run refuses input aliases and preserves bytes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-f2-'));
  const before = path.join(tmp, 'before.json');
  const after = path.join(tmp, 'after.json');
  fs.copyFileSync(path.join(S163, 'sources/pricing/public-model-rows/before.json'), before);
  fs.copyFileSync(path.join(S163, 'sources/pricing/public-model-rows/after-unit-case.json'), after);
  const orig = fs.readFileSync(before);
  const r = run(['run', '--family', 'pricing-row-unit', '--before', before, '--after', after, '--write-next-run', before], tmp);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = parse(r.stdout);
  assert.equal(out.nextRun.refused, true);
  assert.equal(out.nextRun.prep.code, 'next-run-would-overwrite-input');
  assert.deepEqual(fs.readFileSync(before), orig);

  const link = path.join(tmp, 'after-link.json');
  fs.symlinkSync(after, link);
  const origAfter = fs.readFileSync(after);
  const rLink = run(['run', '--family', 'pricing-row-unit', '--before', before, '--after', after, '--write-next-run', link], tmp);
  const outLink = parse(rLink.stdout);
  assert.equal(outLink.nextRun.refused, true);
  assert.deepEqual(fs.readFileSync(after), origAfter);

  const distinct = path.join(tmp, 'next.json');
  const rOk = run(['run', '--family', 'pricing-row-unit', '--before', before, '--after', after, '--write-next-run', distinct], tmp);
  assert.equal(rOk.status, 0, rOk.stderr || rOk.stdout);
  const ok = parse(rOk.stdout);
  assert.equal(ok.nextRun.refused, undefined);
  assert.ok(fs.existsSync(distinct));
  assert.deepEqual(fs.readFileSync(before), orig);
});

test('F2: imported manifest is not replaced', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-f2imp-'));
  fs.copyFileSync(path.join(S163, 'sources/pricing/public-model-rows/before.json'), path.join(tmp, 'before.json'));
  fs.copyFileSync(path.join(S163, 'sources/pricing/public-model-rows/after-unit-case.json'), path.join(tmp, 'after.json'));
  const manPath = path.join(tmp, 'imported.json');
  const body = `${JSON.stringify({
    schema: 's176.next-run-manifest.v1',
    family: 'pricing-row-unit',
    parser: 's134-pricing-table-change',
    inputs: { before: 'before.json', after: 'after.json' },
    paidValueClaim: false,
  }, null, 2)}\n`;
  fs.writeFileSync(manPath, body);
  const r = run(['run', '--from-next-run', manPath, '--write-next-run', manPath], tmp);
  const out = parse(r.stdout);
  assert.equal(out.nextRun.refused, true);
  assert.equal(fs.readFileSync(manPath, 'utf8'), body);
});

test('F3: first recipe run binds recipe sourceMeta; replay with changed bytes keeps historical', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-f3-'));
  const first = path.join(tmp, 'first.json');
  const r1 = run(['sample', '--recipe', 'R-OPENAPI-PIN-IMPACT', '--write-next-run', first]);
  assert.equal(r1.status, 0, r1.stderr || r1.stdout);
  const man = JSON.parse(fs.readFileSync(first, 'utf8'));
  assert.ok(man.sourceMeta);
  assert.equal(man.sourceMeta.synthetic, false);
  assert.ok(man.sourceMeta.before?.commit || man.sourceMeta.beforeCommit);
  assert.equal(man.currentInputs.before.attribution, 'source-meta-digest-match');
  assert.equal(man.currentInputs.before.observedAt, 'unknown');

  const replayDir = path.join(tmp, 'replay');
  fs.mkdirSync(replayDir);
  fs.copyFileSync(path.join(S163, 'sources/openapi/museum/before.yaml'), path.join(replayDir, 'before.yaml'));
  fs.writeFileSync(
    path.join(replayDir, 'after.yaml'),
    `${fs.readFileSync(path.join(S163, 'sources/openapi/museum/after.yaml'), 'utf8')}\n# caller-changed\n`,
  );
  fs.copyFileSync(path.join(S163, 'sources/openapi/museum/used-ops.pin.json'), path.join(replayDir, 'used.json'));
  const imported = path.join(replayDir, 'imported.json');
  fs.writeFileSync(
    imported,
    `${JSON.stringify({
      schema: 's176.next-run-manifest.v1',
      family: 'openapi-used-ops',
      parser: 's134-openapi-impact',
      inputs: { before: 'before.yaml', after: 'after.yaml', used: 'used.json' },
      sourceMeta: man.sourceMeta,
      paidValueClaim: false,
    }, null, 2)}\n`,
  );
  const generated = path.join(replayDir, 'generated.json');
  const r2 = run(['run', '--from-next-run', imported, '--write-next-run', generated], replayDir);
  assert.equal(r2.status, 0, r2.stderr || r2.stdout);
  const gen = JSON.parse(fs.readFileSync(generated, 'utf8'));
  assert.deepEqual(gen.sourceMetaHistorical, man.sourceMeta);
  assert.notEqual(gen.currentInputs.after.sha256, man.currentInputs.after.sha256);
  assert.equal(gen.currentInputs.after.attribution, 'unknown');
  assert.equal(gen.currentInputs.after.observedAt, 'unknown');
  assert.equal(gen.sourceMeta?.note?.includes('do not match'), true);
});

test('F4: omitted/null/whitespace units are not silent unchanged', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-f4-'));
  const cases = [
    [{ field: 'x', value: 1 }, { field: 'x', value: 1 }],
    [{ field: 'x', value: 1, unit: null }, { field: 'x', value: 2, unit: null }],
    [{ field: 'x', value: 1, unit: '   ' }, { field: 'x', value: 1, unit: '\t' }],
  ];
  for (const [b, a] of cases) {
    const before = path.join(tmp, `b-${Math.random().toString(16).slice(2)}.json`);
    const after = path.join(tmp, `a-${Math.random().toString(16).slice(2)}.json`);
    fs.writeFileSync(before, `${JSON.stringify({ rows: [b] })}\n`);
    fs.writeFileSync(after, `${JSON.stringify({ rows: [a] })}\n`);
    const r = run(['run', '--family', 'pricing-row-unit', '--before', before, '--after', after], tmp);
    const out = parse(r.stdout);
    const report = innerReport(out);
    assert.equal((report.unchanged || []).length, 0, JSON.stringify(report.counts));
    assert.equal((report.fieldChanges || []).length, 0);
    assert.ok((report.unknown || []).some((u) => u.reason === 'unit-unknown'));
  }
});

test('F5: null/bad manifest shape and directory captures refuse structurally', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-f5-'));
  const nul = path.join(tmp, 'null.json');
  fs.writeFileSync(nul, 'null\n');
  const rNull = run(['run', '--from-next-run', nul], tmp);
  assert.equal(rNull.status, 0, rNull.stderr);
  const n = parse(rNull.stdout);
  assert.equal(n.refused, true);
  assert.equal(n.prep.code, 'invalid-next-run-manifest');

  const bad = path.join(tmp, 'bad-schema.json');
  fs.writeFileSync(bad, `${JSON.stringify({ schema: 'not-a-s176-schema', family: 'pricing-row-unit' })}\n`);
  const rBad = parse(run(['run', '--from-next-run', bad], tmp).stdout);
  assert.equal(rBad.prep.code, 'unsupported-next-run-schema');

  const mismatch = path.join(tmp, 'mismatch.json');
  fs.writeFileSync(
    mismatch,
    `${JSON.stringify({
      schema: 's176.next-run-manifest.v1',
      family: 'pricing-row-unit',
      parser: 's134-openapi-impact',
      inputs: { before: 'a', after: 'b' },
    })}\n`,
  );
  const rMis = parse(run(['run', '--from-next-run', mismatch], tmp).stdout);
  assert.equal(rMis.prep.code, 'family-parser-mismatch');

  const rDir = parse(
    run(['run', '--family', 'pricing-row-unit', '--before', tmp, '--after', tmp], tmp).stdout,
  );
  assert.equal(rDir.refused, true);
  assert.equal(rDir.prep.code, 'capture-is-directory');
});

test('F5: capture larger than documented limit is refused before a full useful parse', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's189-f5lim-'));
  const before = path.join(tmp, 'before.json');
  const after = path.join(tmp, 'after.json');
  fs.writeFileSync(before, `${JSON.stringify({ rows: [{ field: 'x', value: 1, unit: 'USD' }] })}\n`);
  const fh = fs.openSync(after, 'w');
  fs.writeSync(fh, '{"rows":[');
  const chunk = `${'a'.repeat(1024)}`;
  let written = 0;
  while (written <= MAX_CAPTURE_BYTES) {
    fs.writeSync(fh, `"${chunk}",`);
    written += chunk.length + 3;
  }
  fs.writeSync(fh, ']}');
  fs.closeSync(fh);
  assert.ok(fs.statSync(after).size > MAX_CAPTURE_BYTES);
  const r = parse(run(['run', '--family', 'pricing-row-unit', '--before', before, '--after', after], tmp).stdout);
  assert.equal(r.refused, true);
  assert.equal(r.prep.code, 'capture-too-large');
  assert.equal(r.prep.evidence.limit, MAX_CAPTURE_BYTES);
});

test('F3: JSON null/scalar pricing files structured-refuse (no throw)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's206-f3-'));
  const after = path.join(S163, 'sources/pricing/public-model-rows/before.json');
  for (const [name, body] of [
    ['null.json', 'null\n'],
    ['str.json', '"x"\n'],
    ['num.json', '7\n'],
    ['bool.json', 'true\n'],
  ]) {
    const before = path.join(tmp, name);
    fs.writeFileSync(before, body);
    const r = run(['run', '--family', 'pricing-row-unit', '--before', before, '--after', after], tmp);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const out = parse(r.stdout);
    assert.equal(out.refused, true, name);
    assert.equal(out.prep.code, 'unsupported-pricing-shape', name);
  }
});
