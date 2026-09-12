import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { replay } from '../../../../tools/output-replay-harness/lib/replay.mjs';
import { runWrapperJob, validateWrapperRun, WRAPPER_BIN } from '../../../../tools/output-replay-harness/lib/wrapper.mjs';
import { bind } from '../../../../tools/repeat-job-binder/lib/bind.mjs';
import { createAdapters } from '../../../../tools/repeat-job-binder/lib/engines.mjs';
import { sha256Bytes } from '../../../../tools/output-replay-harness/lib/digest.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(join(tmpdir(), 'cw61-current-'));
after(() => rmSync(root, { recursive: true, force: true }));
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const hash = (p) => sha256Bytes(readFileSync(p));
function context(afterName = 'changed') {
  const work = mkdtempSync(join(root, 'case-'));
  const inputs = {};
  for (const [key, fixture] of [['before', 'before'], ['after', afterName]]) {
    inputs[key] = join(work, key + '.json');
    writeFileSync(inputs[key], readFileSync(join(base, 'fixtures', fixture + '.json')));
  }
  return { work, inputs, request: { engine: 'd01-wrapper', job: 'vendor-budget-impact', inputs,
    outA: join(work, 'a'), outB: join(work, 'b') } };
}
function assertRealRuns(r) {
  assert.equal(r.runs.length, 2);
  assert.notEqual(r.runs[0].pid, r.runs[1].pid);
  assert.notEqual(r.runs[0].executionId, r.runs[1].executionId);
  assert.notEqual(r.runs[0].outDir, r.runs[1].outDir);
  for (const run of r.runs) {
    assert.equal(run.wrapperBin, WRAPPER_BIN);
    assert.equal(run.processExit, 0);
    assert.equal(run.transport, 'ok');
    assert.equal(run.delivery.complete, true);
    assert.equal(read(join(run.outDir, 'receipt.json')).inputs.length, 2);
  }
  assert.equal(r.purchaseAuthority, false);
  assert.equal(r.semanticCorrectnessVerified, false);
}

test('current wrapper: two real processes use both inspected snapshots despite live mutation', () => {
  const c = context();
  const beforeHash = hash(c.inputs.before), afterHash = hash(c.inputs.after);
  const r = replay({ ...c.request, afterInspect() {
    writeFileSync(c.inputs.before, '{"mutated":true}\n');
    writeFileSync(c.inputs.after, '{"mutated":true}\n');
  }, betweenRuns({ outA }) {
    // Even a later mutation of A cannot rewrite its captured comparison evidence.
    writeFileSync(join(outA, 'budget-impact.md'), 'changed after capture\n');
  } });
  assertRealRuns(r);
  assert.equal(r.identityVerified, true);
  assert.equal(r.classification, 'labelled-drift');
  assert.equal(r.terms.inputsA.before.sha256, beforeHash);
  assert.equal(r.terms.inputsB.after.sha256, afterHash);
  assert.equal(hash(join(c.request.outB, '.replay-inputs/after.json')), afterHash);
  for (const dir of [c.request.outA, c.request.outB]) {
    const report = read(join(dir, 'budget-impact.json'));
    assert.equal(report.status, 'actionable');
    assert.equal(report.underlying.counts.fieldChanges, 1);
    assert.equal(report.actions[0].kind, 'review-price-field');
    assert.equal(report.actions[0].fieldKey, 'cw61-request');
  }
});

test('different numeric inputs break identity even when the current engine omits their values', () => {
  const c = context();
  const different = join(c.work, 'different.json');
  const doc = read(c.inputs.after);
  doc.rows[0].value = 9;
  writeFileSync(different, JSON.stringify(doc));
  const r = replay({ ...c.request, inputsB: { after: different } });
  assertRealRuns(r);
  assert.equal(r.inputsIdentical, false);
  assert.equal(r.classification, 'identity-break');
  assert.equal(r.identityVerified, false);
  // Independent input arithmetic distinguishes 5 - 2 from 9 - 2.
  assert.equal(read(c.inputs.after).rows[0].value - read(c.inputs.before).rows[0].value, 3);
  assert.equal(read(different).rows[0].value - read(c.inputs.before).rows[0].value, 7);
});

test('known no-change is informational through two current wrapper processes', () => {
  const c = context('before');
  const r = replay(c.request);
  assertRealRuns(r);
  assert.equal(r.identityVerified, true);
  assert.ok(r.runs.every((run) => run.analysis.outcome === 'informational'));
  const report = read(join(c.request.outA, 'budget-impact.json'));
  assert.equal(report.underlying.counts.fieldChanges, 0);
  assert.equal(report.underlying.counts.unchanged, 1);
  assert.equal(report.actions[0].kind, 'no-budget-delta');
});

test('known unit mismatch remains partial and cannot verify replay identity', () => {
  const c = context('partial');
  const r = replay(c.request);
  assertRealRuns(r);
  assert.ok(r.runs.every((run) => run.analysis.outcome === 'partial'));
  assert.equal(r.identityVerified, false);
  assert.equal(read(join(c.request.outA, 'budget-impact.json')).status, 'partial');
});

test('real wrapper input refusal cannot become a successful replay', () => {
  const c = context('refused');
  assert.throws(() => replay(c.request), (err) => err.code === 'nonzero-engine-exit' &&
    err.detail.status === 2 && err.detail.transport === 'rejected' && err.detail.delivery.complete === false);
  assert.equal(existsSync(join(c.request.outB, 'budget-impact.json')), false);
});

for (const alias of ['same', 'dot', 'symlink', 'nested', 'symlink-parent']) test(`current wrapper refuses ${alias} output aliases before execution`, () => {
  const c = context();
  let a = c.request.outA, b;
  if (alias === 'same') b = a;
  if (alias === 'dot') b = join(a, '.');
  if (alias === 'nested') b = join(a, 'child');
  if (alias === 'symlink') { mkdirSync(a); b = join(c.work, 'alias'); symlinkSync(a, b); }
  if (alias === 'symlink-parent') {
    mkdirSync(join(c.work, 'parent'));
    symlinkSync(join(c.work, 'parent'), join(c.work, 'alias'));
    a = join(c.work, 'parent/new'); b = join(c.work, 'alias/new');
  }
  assert.throws(() => replay({ ...c.request, outA: a, outB: b }), { code: 'overlapping-output-dirs' });
  assert.equal(existsSync(join(a, 'budget-impact.json')), false);
});

test('preexisting output bytes are preserved and refused', () => {
  const c = context();
  mkdirSync(c.request.outA);
  const evidence = join(c.request.outA, 'budget-impact.json');
  writeFileSync(evidence, 'original evidence\n');
  assert.throws(() => replay(c.request), { code: 'reused-output-path' });
  assert.equal(readFileSync(evidence, 'utf8'), 'original evidence\n');
});

test('real subprocess nonzero after valid successful stdout is never accepted', () => {
  const c = context();
  const cli = join(c.work, 'nonzero.mjs');
  writeFileSync(cli, `process.stdout.write(JSON.stringify({ok:true,transport:'ok',analysis:{outcome:'actionable'}})); process.exit(7);\n`);
  assert.throws(() => replay({ ...c.request, paidWrapperBin: cli }), (err) =>
    err.code === 'nonzero-engine-exit' && err.detail.status === 7);
});

function binderArgs(c, previousName = 'before') {
  const ticketDir = join(c.work, 'previous');
  mkdirSync(ticketDir);
  const ticket = join(ticketDir, 'next-run.json');
  const previous = readFileSync(join(base, 'fixtures', previousName + '.json'));
  writeFileSync(ticket, JSON.stringify({ schema: 's176.next-run-manifest.v1', family: 'pricing-row-unit', parser: 'pricing-row-unit',
    currentInputs: { before: { sha256: hash(c.inputs.before) }, after: { sha256: sha256Bytes(previous) } } }));
  return { ticket, before: c.inputs.before, after: c.inputs.after,
    'declare-after-sha256': hash(c.inputs.after), 'engine': 'd01-wrapper', 'out-dir': join(c.work, 'bound') };
}
for (const [fixture, status, outcome, previous] of [
  ['changed', 'actionable', 'completed', 'before'],
  ['before', 'analysis-no-change', 'no-change', 'changed'],
  ['partial', 'analysis-partial', 'partial', 'before'],
]) test(`binder current wrapper preserves ${fixture} outcome and frozen refs`, async () => {
  const c = context(fixture);
  const args = binderArgs(c, previous);
  const adapters = createAdapters({ paidWrapperBin: WRAPPER_BIN });
  const realRun = adapters.paidWrapper.run;
  adapters.paidWrapper.run = async (request) => {
    writeFileSync(c.inputs.after, '{"mutated-after-inspect":true}');
    return realRun(request);
  };
  const r = await bind(args, adapters);
  assert.equal(r.status, status);
  assert.equal(r.analysisOutcome, outcome);
  assert.equal(r.transport.ok, true);
  assert.equal(r.record.frozen.current.after.sha256, args['declare-after-sha256']);
  assert.equal(hash(r.record.frozen.current.after.frozenPath), args['declare-after-sha256']);
  assert.ok(r.record.secondRun.engine.executionId);
  assert.equal(r.record.secondRun.engine.provenance.archiveSha256.length, 64);
});

test('public binder CLI runs the current wrapper without old kit injection', () => {
  const c = context();
  const args = binderArgs(c);
  const cliArgs = Object.entries(args).flatMap(([key, value]) => ['--' + key, value]);
  const run = spawnSync(process.execPath, [resolve('tools/repeat-job-binder/bin/bind.mjs'), ...cliArgs],
    { encoding: 'utf8', timeout: 90_000 });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.equal(JSON.parse(run.stdout).status, 'actionable');
});

test('binder preserves refusal details from actual current wrapper', async () => {
  const c = context('refused');
  await assert.rejects(bind(binderArgs(c)), (err) => err.code === 'nonzero-engine-exit' && err.detail.transport === 'rejected');
});

test('wrapper receipt contradictions are rejected independently of parser success', () => {
  const c = context();
  mkdirSync(c.request.outA);
  const inputHashes = Object.fromEntries(Object.entries(c.inputs).map(([key, file]) => [key, { sha256: hash(file), bytes: readFileSync(file).length }]));
  const opts = { jobId: 'vendor-budget-impact', files: c.inputs, inputHashes, outputNames: ['budget-impact.json', 'budget-impact.md'], outDir: c.request.outA };
  const run = runWrapperJob(opts.jobId, opts);
  for (const corrupt of [
    (r) => { r.json.receipt.delivery.complete = false; },
    (r) => { r.json.receipt.inputs[0].sha256 = '0'.repeat(64); },
    (r) => { r.json.outputs[0].sha256 = '0'.repeat(64); },
    (r) => { r.json.receipt.analysis.outcome = 'partial'; },
    (r) => { r.json.jobId = 'different-job'; },
  ]) {
    const changed = structuredClone(run);
    corrupt(changed);
    assert.throws(() => validateWrapperRun(changed, opts));
  }
});
