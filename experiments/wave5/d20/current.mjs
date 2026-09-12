import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLOCK, MAILBOX, PACK, fixture, readJson, until } from '../../codex-window/cw65-delivery-adversarial-harness/lib/context.mjs';
import { assertRefused, missing, sha256 } from '../../codex-window/cw65-delivery-adversarial-harness/lib/oracle.mjs';
import { configFor, logs, orderRequest } from '../d19/current.mjs';

async function job(ctx, name = 'delivery') {
  const f = fixture(ctx, name); const result = ctx.verify(name, await ctx.cli(name, f), f);
  return { f, result, resultPath: ctx.json('execution-' + name, result) };
}
function seedArgs(ctx, job, requestId, mailbox = ctx.path('mailbox')) {
  return ['seed', '--mailbox', mailbox, '--request-id', requestId, '--job-id', job.f.jobId,
    '--from-d01-execution', job.resultPath];
}
async function pickup(ctx, id, mailbox = ctx.path('mailbox'), label = 'pickup') {
  return ctx.mailbox(label, ['pickup', '--mailbox', mailbox, '--request-id', id, '--out', ctx.path(label)]);
}
function verifyPickup(pickup, result) {
  assert.equal(pickup.ok, true, JSON.stringify(pickup));
  assert.equal(pickup.status, 'retrieved'); assert.equal(pickup.deliveredToBuyer, false);
  assert.equal(pickup.sold, false);
  for (const row of result.outputs) {
    const copy = pickup.artifacts.find(a => a.name === row.name);
    assert.equal(copy.sha256, row.sha256); assert.equal(copy.bytes, row.bytes);
    assert.equal(sha256(readFileSync(copy.path)), row.sha256);
  }
}
async function interruptRename(ctx, label, args, destination, timing) {
  const ready = ctx.path(label + '-barrier.json'), release = ctx.path(label + '-release');
  const hook = ctx.json(label + '-hook', { ready, release, destination, timing });
  const child = ctx.start(label, ['--import', join(PACK, 'workers/fs-barrier.mjs'), MAILBOX, ...args, '--clock', CLOCK],
    { env: { CW65_FS_BARRIER: hook } });
  await until(() => existsSync(ready), 'mailbox actual rename ' + timing);
  const stopped = await ctx.stop(child, 'SIGKILL');
  assert.equal(stopped.signal, 'SIGKILL'); assert.equal(stopped.stdout, '', 'result had already escaped before interruption');
  ctx.json(label + '-interruption', { ...readJson(ready), signal: stopped.signal, stdoutBytes: stopped.stdout.length });
}

export const cases = [
  ...['reserved', 'before-complete', 'completed'].map(stage => ['d20-order-interrupt-' + stage, async ctx => {
    const f = fixture(ctx, 'interrupt'); const request = await orderRequest(ctx, 'interrupt', f);
    const config = configFor(ctx, 'first', request);
    const ready = ctx.path('durable-stage.json'), release = ctx.path('release');
    const first = ctx.startWorker('first', { ...config, barrier: { stage, ready, release } });
    await until(() => existsSync(ready), 'order durable stage ' + stage);
    const observed = readJson(ready); ctx.json('before-interrupt', observed);
    if (stage === 'before-complete') {
      assert.equal(observed.result.ok, true, observed.result.error);
      cpSync(observed.result.runOutDir, ctx.path('completed-but-uncommitted-package'), { recursive: true });
    }
    const killed = await ctx.stop(first, 'SIGKILL');
    assert.equal(killed.signal, 'SIGKILL'); assert.equal(killed.stdout, '');
    ctx.json('store-after-death', readJson(config.store + '/' + request.orderId + '.json'));
    const before = logs(config.store).length;
    const reopened = await ctx.worker('reopen', { ...config, outDir: ctx.path('published', 'reopen') });
    const after = logs(config.store).length;
    ctx.json('recovery-witness', { stage, before, after, reopened,
      firstExecutionId: observed.result?.wrapper?.executionId || observed.durable?.result?.wrapper?.executionId || null });
    if (stage === 'reserved') {
      assert.equal(before, 0); assert.equal(reopened.ok, true, reopened.error); assert.equal(after, 1);
    } else if (stage === 'completed') {
      assert.equal(before, 1); assert.equal(reopened.ok, true, reopened.error); assert.equal(reopened.replayed, true);
      assert.equal(after, 1); assert.equal(reopened.wrapper.executionId, observed.durable.result.wrapper.executionId);
    } else {
      // A completed real engine was interrupted before durable completion. Refusal or recovery may be safe; a second execution is not.
      assert.equal(before, 1); assert.equal(after, 1, 'ambiguous order automatically reran a completed real engine');
      if (reopened.ok) assert.equal(reopened.wrapper.executionId, observed.result.wrapper.executionId);
    }
  }]),
  ['d20-corrupt-order-no-rerun', async ctx => {
    const f = fixture(ctx, 'corrupt'); const request = await orderRequest(ctx, 'corrupt', f);
    const config = configFor(ctx, 'first', request);
    const first = await ctx.worker('first', config); assert.equal(first.ok, true, first.error);
    const path = config.store + '/' + request.orderId + '.json';
    ctx.json('preserved-complete-record', readJson(path)); writeFileSync(path, '{');
    const reopened = await ctx.worker('reopen-corrupt', config); assertRefused(reopened, 'corrupt-replay');
    assert.equal(logs(config.store).length, 1); assert.equal(readFileSync(path, 'utf8'), '{');
  }],
  ...['before', 'after'].map(timing => ['d20-mailbox-interrupt-' + timing + '-commit', async ctx => {
    const completed = await job(ctx); const id = 'cw65-mail'; const dir = ctx.path('mailbox', id);
    const args = seedArgs(ctx, completed, id);
    await interruptRename(ctx, 'seed', args, dir, timing);
    assert.equal(existsSync(join(dir, 'envelope.json')), timing === 'after');
    if (timing === 'before') {
      const unavailable = await pickup(ctx, id, ctx.path('mailbox'), 'precommit-pickup');
      assertRefused(unavailable, 'unknown-request');
    }
    const retry = await ctx.mailbox('reseed', args);
    assert.equal(retry.ok, true, JSON.stringify(retry)); assert.equal(retry.replayed, timing === 'after');
    verifyPickup(await pickup(ctx, id), completed.result);
    const envelope = readJson(join(dir, 'envelope.json'));
    assert.equal(envelope.deliveredToBuyer, false); assert.equal(envelope.sold, false);
    // Ack is a separate durable transition. Interrupt after envelope update, before ack.json/stdout.
    await interruptRename(ctx, 'ack', ['ack', '--mailbox', ctx.path('mailbox'), '--request-id', id], join(dir, 'envelope.json'), 'after');
    assert.equal(readJson(join(dir, 'envelope.json')).deliveredToBuyer, true);
    const ack = await ctx.mailbox('reack', ['ack', '--mailbox', ctx.path('mailbox'), '--request-id', id]);
    assert.equal(ack.status, 'already-acknowledged'); assert.equal(ack.sold, false);
    assert.equal(readJson(join(dir, 'ack.json')).acknowledgedAt, CLOCK);
  }]),
  ['d20-mailbox-wrong-body-key-and-bytes', async ctx => {
    const a = await job(ctx, 'alpha'), b = await job(ctx, 'bravo');
    const id = 'cw65-mail', dir = ctx.path('mailbox', id), envelopePath = join(dir, 'envelope.json');
    const seeded = await ctx.mailbox('seed-a', seedArgs(ctx, a, id)); assert.equal(seeded.ok, true);
    const original = readFileSync(envelopePath); ctx.json('envelope-original', readJson(envelopePath));
    assertRefused(await ctx.mailbox('seed-b-same-key', seedArgs(ctx, b, id)), 'request-id-conflict');
    assert.deepEqual(readFileSync(envelopePath), original);
    assertRefused(await pickup(ctx, 'cw65-foreign', ctx.path('mailbox'), 'wrong-key'), 'unknown-request');
    assertRefused(await pickup(ctx, '..', ctx.path('mailbox'), 'dot-key'), 'invalid-request-id');
    verifyPickup(await pickup(ctx, id), a.result);
    const artifact = join(dir, 'artifacts', a.f.outputs[0]);
    cpSync(artifact, ctx.path('preserved-artifact.json')); writeFileSync(artifact, '{"foreign":true}\n');
    assertRefused(await pickup(ctx, id, ctx.path('mailbox'), 'corrupt-pickup'), 'digest-mismatch');
    assertRefused(await ctx.mailbox('reseed-corrupt', seedArgs(ctx, a, id)), 'digest-mismatch');
    assert.deepEqual(readFileSync(envelopePath), original);
  }],
  ['d20-current-outbox', async () => {
    missing('No tools/job-delivery-outbox in current integration tree. Callback attempt durability, acknowledgment body/key binding and unknown-outcome replay cannot be accepted from Co09 historical fixtures.');
  }],
];
