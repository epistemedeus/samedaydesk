import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareCatalogOutputs } from '../../../../tools/output-replay-harness/lib/compare.mjs';
import { assertDisjointOutputDirs } from '../../../../tools/output-replay-harness/lib/locations.mjs';
import { analysisOutcomeOf } from '../../../../tools/repeat-job-binder/lib/engines.mjs';
import { freezeCurrentInputs } from '../../../../tools/repeat-job-binder/lib/freeze.mjs';
import { sha256Buffer } from '../../../../tools/repeat-job-binder/lib/digest.mjs';

const root = mkdtempSync(join(tmpdir(), 'cw61-consumer-'));
after(() => rmSync(root, { recursive: true, force: true }));
function compare(a, b, name = 'report.json') {
  const pair = mkdtempSync(join(root, 'pair-'));
  for (const [dir, body] of [['a', a], ['b', b]]) {
    mkdirSync(join(pair, dir));
    writeFileSync(join(pair, dir, name), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return compareCatalogOutputs({ outA: join(pair, 'a'), outB: join(pair, 'b'), outputNames: [name] });
}
test('nested generatedAt is semantic report data', () => {
  assert.equal(compare({ record: { generatedAt: '2026-01-01T00:00:00Z' } },
    { record: { generatedAt: '2026-02-01T00:00:00Z' } }).classification, 'identity-break');
});
test('a report deadline timestamp is semantic, even in Markdown', () => {
  assert.equal(compare('Deadline: 2026-01-01T00:00:00Z\n', 'Deadline: 2026-02-01T00:00:00Z\n', 'report.md').classification, 'identity-break');
});
test('identical invalid JSON cannot verify output identity', () => {
  assert.equal(compare('{broken', '{broken').classification, 'identity-break');
});
test('nested output directories are overlapping locations', () => {
  assert.throws(() => assertDisjointOutputDirs(join(root, 'a'), join(root, 'a/child')), { code: 'overlapping-output-dirs' });
});
test('partial analysis remains partial', () => {
  assert.equal(analysisOutcomeOf({ ok: true, status: 'partial' }), 'partial');
});
test('freezing inputs cannot follow a preexisting destination symlink', () => {
  const work = mkdtempSync(join(root, 'freeze-'));
  const source = join(work, 'source.json');
  const victim = join(work, 'victim.json');
  const dest = join(work, 'frozen');
  const bytes = Buffer.from('{"current":true}\n');
  writeFileSync(source, bytes);
  writeFileSync(victim, 'original evidence\n');
  mkdirSync(dest);
  symlinkSync(victim, join(dest, 'after.json'));
  assert.throws(() => freezeCurrentInputs({ verifiedInputs: { after: {
    state: 'verified', actual: { path: source, sha256: sha256Buffer(bytes), bytes: bytes.length },
  } }, destDir: dest }));
  assert.equal(readFileSync(victim, 'utf8'), 'original evidence\n');
});
