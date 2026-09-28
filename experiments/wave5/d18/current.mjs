import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, executionRequest, until } from '../../codex-window/cw65-delivery-adversarial-harness/lib/context.mjs';
import { assertComplete, parseProcess, sha256 } from '../../codex-window/cw65-delivery-adversarial-harness/lib/oracle.mjs';

export const cases = [
  ['d18-simultaneous-same-publication', async ctx => {
    const a = fixture(ctx, 'alpha'), b = fixture(ctx, 'bravo');
    const shared = ctx.path('shared-publication');
    const launch = (label, f) => {
      const request = { ...executionRequest(ctx, label, f), outDir: shared };
      const ready = ctx.path(label + '-ready.json'), release = ctx.path(label + '-release');
      return { f, request, ready, release, process: ctx.startWorker(label, { mode: 'execute', request,
        barrier: { stage: 'staged-inputs', ready, release } }) };
    };
    const jobs = [launch('alpha', a), launch('bravo', b)];
    await until(() => jobs.every(j => existsSync(j.ready)), 'two real executors simultaneously staged');
    ctx.json('overlap', jobs.map(j => ({ pid: j.process.pid, ready: j.ready })));
    jobs.forEach(j => writeFileSync(j.release, 'continue'));
    const results = await Promise.all(jobs.map(async (j, i) => ctx.verify(String(i), parseProcess(await j.process.done), j.f, j.request.executionId)));
    assert.notEqual(results[0].runOutDir, results[1].runOutDir);
    assert.notEqual(results[0].receipt.inputsDigest, results[1].receipt.inputsDigest);
    assert.throws(() => assertComplete(results[0], { ...b, executionId: jobs[1].request.executionId }));
    assert.throws(() => assertComplete(results[1], { ...a, executionId: jobs[0].request.executionId }));
    for (const [i, body] of results.entries()) {
      const verdict = await ctx.worker('verify-' + i, { mode: 'verify', jobId: body.jobId, root: body.runOutDir });
      assert.equal(verdict.ok, true, JSON.stringify(verdict));
    }
  }],
  ['d18-sequential-different-jobs', async ctx => {
    const shared = ctx.path('shared-publication');
    const a = fixture(ctx, 'vendor'), b = fixture(ctx, 'lock', { jobId: 'lockfile-pin-delta' });
    const first = ctx.verify('first', await ctx.cli('first', a, shared), a);
    const bytesBefore = first.outputs.map(r => sha256(readFileSync(join(first.runOutDir, r.name))));
    const second = ctx.verify('second', await ctx.cli('second', b, shared), b);
    assertComplete(first, a);
    assert.deepEqual(first.outputs.map(r => sha256(readFileSync(join(first.runOutDir, r.name)))), bytesBefore);
    assert.throws(() => assertComplete(second, a));
    assert.throws(() => assertComplete(first, b));
    ctx.json('publication-is-alias', { first: first.runOutDir, second: second.runOutDir, shared,
      oldSiblingsPresent: a.outputs.every(n => existsSync(join(shared, n))), identitySource: 'runOutDir' });
  }],
  ['d18-current-verifier-corruption', async ctx => {
    const f = fixture(ctx, 'verify'); const good = ctx.verify('good', await ctx.cli('good', f), f);
    const control = await ctx.worker('verify-good', { mode: 'verify', jobId: f.jobId, root: good.runOutDir });
    assert.equal(control.ok, true, JSON.stringify(control));
    for (const mutation of ['truncated-receipt', 'missing-output', 'changed-bytes', 'empty-output-row']) {
      const target = ctx.path('corruptions', mutation); cpSync(good.runOutDir, target, { recursive: true });
      if (mutation === 'truncated-receipt') writeFileSync(join(target, 'receipt.json'), '{');
      if (mutation === 'missing-output') {
        const { unlinkSync } = await import('node:fs'); unlinkSync(join(target, f.outputs[1]));
      }
      if (mutation === 'changed-bytes') writeFileSync(join(target, f.outputs[0]), '{"foreign":true}\n');
      if (mutation === 'empty-output-row') {
        const receipt = JSON.parse(readFileSync(join(target, 'receipt.json'))); receipt.outputs = [{}];
        writeFileSync(join(target, 'receipt.json'), JSON.stringify(receipt));
      }
      const bad = await ctx.worker(mutation, { mode: 'verify', jobId: f.jobId, root: target });
      assert.equal(bad.ok, false, mutation + ' was accepted');
      assert.notEqual(bad.classification, 'complete');
    }
  }],
  ['d18-publication-rollback', async ctx => {
    const f = fixture(ctx, 'rollback'); const out = ctx.path('existing-publication'); mkdirSync(out);
    const first = join(out, f.outputs[0]); writeFileSync(first, 'previous caller-owned publication\n');
    // A real filesystem failure on the second copy, with the first alias already present.
    mkdirSync(join(out, f.outputs[1]));
    const before = readFileSync(first); ctx.json('before', { sha256: sha256(before), bytes: before.toString() });
    const result = await ctx.cli('blocked-second-copy', f, out); ctx.json('result', result);
    const after = readFileSync(first); ctx.json('after', { sha256: sha256(after), bytes: after.toString() });
    assert.equal(result.ok, false, 'publication failure must refuse');
    assert.equal(result.sold, false);
    assert.deepEqual(after, before, 'failed publication partially overwrote an existing caller artifact');
  }],
];
