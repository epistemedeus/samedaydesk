import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fixture, executionRequest, readJson, until } from '../../codex-window/cw65-delivery-adversarial-harness/lib/context.mjs';
import { assertRefused, missing, parseProcess } from '../../codex-window/cw65-delivery-adversarial-harness/lib/oracle.mjs';

export async function orderRequest(ctx, label, f) {
  return (await ctx.worker('request-' + label, { mode: 'order-request', orderId: 'cw65-' + label, fixture: f })).request;
}
export function configFor(ctx, label, request, store = ctx.path('store')) {
  return { mode: 'order', request, store, outDir: ctx.path('published', label) };
}
export function logs(store) {
  const path = store + '/executions.jsonl';
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
}

export const cases = [
  ['d19-http-body-and-key', async ctx => {
    const f = fixture(ctx, 'http'); const request = executionRequest(ctx, 'http', f);
    const calls = ctx.path('engine-calls.jsonl'); const server = await ctx.server('server', { calls });
    const [a, b] = await Promise.all([ctx.http('client-a', server.origin, '/execute', request), ctx.http('client-b', server.origin, '/execute', request)]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    ctx.verify('http', a.body, f, request.executionId); assert.deepEqual(b.body, a.body);
    assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 1);
    const wrongKey = await ctx.http('wrong-key', server.origin, '/results/cw65-not-this-execution');
    assert.equal(wrongKey.status, 404); assert.equal(wrongKey.body.code, 'not-found');
    const wrongBody = await ctx.http('wrong-body', server.origin, '/execute', { ...request, jobId: 'lockfile-pin-delta' });
    assert.equal(wrongBody.status, 409); assert.equal(wrongBody.body.code, 'execution-id-conflict');
    const original = readFileSync(f.inputs.after); writeFileSync(f.inputs.after, original.toString().replace('3', '9'));
    const wrongBytes = await ctx.http('wrong-bytes', server.origin, '/execute', request);
    assert.equal(wrongBytes.status, 409); assert.equal(wrongBytes.body.code, 'execution-id-conflict');
    const retrieved = await ctx.http('retrieve', server.origin, '/results/' + request.executionId);
    assert.deepEqual(retrieved.body, a.body);
    assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 1);
  }],
  ['d19-http-principal-boundary', async ctx => {
    const f = fixture(ctx, 'principal'); const request = executionRequest(ctx, 'principal', f);
    const server = await ctx.server();
    const owner = await ctx.http('principal-a', server.origin, '/execute', request, { authorization: 'Bearer cw65-synthetic-principal-a' });
    ctx.verify('owner', owner.body, f, request.executionId);
    const foreign = await ctx.http('principal-b', server.origin, '/results/' + request.executionId, undefined,
      { authorization: 'Bearer cw65-synthetic-principal-b' });
    ctx.json('principal-witness', { ownerStatus: owner.status, foreignStatus: foreign.status,
      sameExecution: foreign.body.executionId === owner.body.executionId, credentials: 'synthetic markers only',
      documentedScope: 'loopback process-local adapter has no authenticated principal contract' });
    if (foreign.status === 200) missing('Current HTTP adapter has no authenticated principal binding; synthetic other-principal request retrieves the result. Do not claim cross-principal acceptance.');
    assert.ok([401, 403, 404].includes(foreign.status));
  }],
  ['d19-simultaneous-orders', async ctx => {
    const f = fixture(ctx, 'same-order'); const request = await orderRequest(ctx, 'same-order', f);
    const config = configFor(ctx, 'first', request);
    const ready = ctx.path('reserved.json'), release = ctx.path('release');
    const first = ctx.startWorker('first', { ...config, barrier: { stage: 'reserved', ready, release } });
    await until(() => existsSync(ready), 'order reservation durable');
    const attempt = ctx.path('second-reserve-attempt.json');
    const second = ctx.startWorker('second', { ...config, reserveAttempt: attempt, outDir: ctx.path('published', 'second') });
    await until(() => existsSync(attempt), 'second process entered reservation while first holds it');
    // The first holder is still alive when the second process starts.
    ctx.json('overlap', { firstPid: first.pid, secondPid: second.pid, reservation: readJson(ready) });
    writeFileSync(release, 'continue');
    const [a, b] = await Promise.all([first.done.then(parseProcess), second.done.then(parseProcess)]);
    ctx.json('orders', { a, b }); assert.equal(a.ok, true, a.error); assert.equal(b.ok, true, b.error);
    assert.equal(a.replayed, false); assert.equal(b.replayed, true);
    assert.equal(a.wrapper.executionId, b.wrapper.executionId);
    assert.equal(logs(config.store).length, 1);
    assert.equal(readJson(config.store + '/' + request.orderId + '.json').executionCount, 1);
    const wrong = structuredClone(request); wrong.inputs[0].sha256 = '0'.repeat(64);
    assertRefused(await ctx.worker('wrong-digest', { ...config, request: wrong }), 'f-input');
    const changed = fixture(ctx, 'other-body'); const swapped = await orderRequest(ctx, 'same-order', changed);
    assertRefused(await ctx.worker('wrong-body', { ...config, request: swapped }), 'f-order');
    assert.equal(logs(config.store).length, 1);
  }],
  ['d19-distinct-orders', async ctx => {
    const f = fixture(ctx, 'order-alpha'), g = fixture(ctx, 'order-bravo');
    const a = await orderRequest(ctx, 'alpha', f), b = await orderRequest(ctx, 'bravo', g);
    const store = ctx.path('store');
    const [ra, rb] = await Promise.all([ctx.worker('alpha', configFor(ctx, 'alpha', a, store)), ctx.worker('bravo', configFor(ctx, 'bravo', b, store))]);
    assert.equal(ra.ok, true, ra.error); assert.equal(rb.ok, true, rb.error);
    assert.notEqual(ra.wrapper.executionId, rb.wrapper.executionId);
    assert.notEqual(ra.wrapper.receipt.inputsDigest, rb.wrapper.receipt.inputsDigest);
    assert.deepEqual(logs(store).map(r => r.orderId).sort(), [a.orderId, b.orderId].sort());
  }],
  ['d19-current-ledger', async () => {
    missing('No tools/buyer-value-ledger in current integration tree. Historical Co16 loaders are excluded; ledger persistence and settlement binding are untested.');
  }],
];
