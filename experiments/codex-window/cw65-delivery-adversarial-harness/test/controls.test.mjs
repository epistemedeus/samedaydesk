import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { Context, REPO } from '../lib/context.mjs';
import { assertComplete, parseProcess, sha256, CONTRACT } from '../lib/oracle.mjs';
import { classifyEngineLifecycle } from '../../../wave5/d16/src/classify.mjs';

// These are deliberately broken independent controls. None count as real engine readiness.
for (const name of ['decoy-json', 'empty-stdout', 'invalid-json', 'nonzero', 'ok-false', 'ok-true-no-outputs', 'stderr-json', 'hang']) {
  test('expected rejection: ' + name, async () => {
    const ctx = new Context('control-' + name);
    try {
      const proc = await ctx.start(name, [join(REPO, 'experiments/wave5/d16/fixtures/broken-engines', name + '.mjs')],
        { timeoutMs: name === 'hang' ? 250 : 5_000 }).done;
      const classification = classifyEngineLifecycle({ spawn: proc, engineStdout: proc.stdout,
        wrapper: { ok: true, sold: false, outputs: [] } });
      assert.equal(classification.accepted, false);
      let rejected = false;
      try {
        const body = parseProcess(proc);
        assertComplete(body, { jobId: 'vendor-budget-impact', outputs: ['budget-impact.json', 'budget-impact.md'] });
      } catch { rejected = true; }
      assert.equal(rejected, true, 'seeded invalid engine escaped independent acceptance oracle');
      ctx.json('expected-control', { expected: 'rejected', observed: classification, readinessEvidence: false });
    } finally { await ctx.cleanup(); }
  });
}

test('independent identity oracle rejects foreign execution, inputs, nested digest, and changed bytes', () => {
  const ctx = new Context('control-identity');
  const data = Buffer.from('synthetic control only'); writeFileSync(ctx.path('report.json'), data);
  const row = { name: 'report.json', bytes: data.length, sha256: sha256(data) };
  const valid = { ok: true, contract: CONTRACT, transport: 'ok', delivery: { complete: true },
    jobId: 'control', executionId: 'control-a', sold: false, sample: false, outputs: [row], runOutDir: ctx.dir,
    receipt: { contract: CONTRACT, transport: 'ok', delivery: { complete: true }, jobId: 'control', executionId: 'control-a',
      inputs: [{ name: 'before', sha256: 'a'.repeat(64) }], outputs: [{ ...row }] } };
  const expected = { jobId: 'control', executionId: 'control-a', outputs: ['report.json'], inputHashes: { before: 'a'.repeat(64) } };
  assertComplete(valid, expected);
  for (const mutate of [r => { r.executionId = 'control-b'; }, r => { r.receipt.inputs[0].sha256 = 'b'.repeat(64); },
    r => { r.receipt.outputs[0].sha256 = '0'.repeat(64); }, r => { r.outputs.push({ ...row }); }, r => { r.sold = true; }]) {
    const bad = structuredClone(valid); mutate(bad); assert.throws(() => assertComplete(bad, expected));
  }
  writeFileSync(ctx.path('report.json'), 'changed'); assert.throws(() => assertComplete(valid, expected));
  ctx.json('expected-control', { expected: 'all five identity mutations plus changed bytes rejected', readinessEvidence: false });
});
