import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fixture, executionRequest, until } from '../../codex-window/cw65-delivery-adversarial-harness/lib/context.mjs';
import { assertRefused, parseProcess } from '../../codex-window/cw65-delivery-adversarial-harness/lib/oracle.mjs';

export const cases = [
  ['d16-current-vendor', async ctx => {
    const f = fixture(ctx, 'vendor'); ctx.verify('changed', await ctx.cli('changed', f), f);
    const same = fixture(ctx, 'no-change', { change: false });
    const result = ctx.verify('no-change', await ctx.cli('no-change', same), same);
    assert.equal(result.analysis.status, 'informational');
  }],
  ['d16-current-lockfile', async ctx => {
    const f = fixture(ctx, 'lockfile', { jobId: 'lockfile-pin-delta' });
    ctx.verify('lockfile', await ctx.cli('lockfile', f), f);
  }],
  ['d16-current-refusals', async ctx => {
    const f = fixture(ctx, 'missing'); delete f.inputs.after;
    assertRefused(await ctx.cli('missing', f), 'missing-required-inputs');
    const malformed = fixture(ctx, 'malformed'); writeFileSync(malformed.inputs.after, '{"rows":17}');
    assertRefused(await ctx.cli('malformed', malformed), 'input-schema-mismatch');
  }],
  ['d16-staged-input-mutation', async ctx => {
    const f = fixture(ctx, 'frozen'); const request = executionRequest(ctx, 'frozen', f);
    const ready = ctx.path('staged.json'), release = ctx.path('release');
    const proc = ctx.startWorker('staged', { mode: 'execute', request, barrier: { stage: 'staged-inputs', ready, release } });
    await until(() => existsSync(ready), 'real executor staged inputs');
    ctx.json('original-after', JSON.parse(readFileSync(f.inputs.after)));
    writeFileSync(f.inputs.after, '{"rows":[{"field":"foreign-job","value":99,"unit":"USD"}]}');
    writeFileSync(release, 'continue');
    const result = ctx.verify('staged', parseProcess(await proc.done), f, request.executionId);
    assert.equal(readFileSync(result.outputs[0].path, 'utf8').includes('foreign-job'), false);
  }],
];
