import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDesk, prepareRequest } from '../../../../../tools/job-request-desk/lib/desk.mjs';
import { runCurrent } from '../../../../../tools/job-request-desk/lib/current.mjs';
import { digest } from '../../../../../tools/job-request-desk/lib/durable.mjs';
import { runBatch, readBatch } from '../../../../../tools/paid-batch-reconciler/lib/ledger.mjs';
import { measureBatch, measureRequest, runLabelledJob } from '../../../../../tools/buyer-value-ledger/lib/run.mjs';
import { appendRow, loadLedger } from '../../../../../tools/buyer-value-ledger/lib/ledger.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url));
const fixture = join(root, 'tools/job-request-desk/fixtures/caller/vendor-budget-impact');
function caller(extra = {}) { return { engineId: 'vendor-budget-impact', inputs: { before: join(fixture, 'before.json'), after: join(fixture, 'after.json') }, buyerClass: 'owner-qa', ...extra }; }
function work(t) { const dir = mkdtempSync(join(tmpdir(), 'cw62-accept-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
function start(t, dir, mode, options) {
  const config = join(dir, `${mode}-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(config, JSON.stringify(options));
  const child = fork(worker, [mode, config], { silent: true, detached: true, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=768', TMPDIR: dir } });
  let stderr = ''; child.stderr.on('data', c => { stderr += c; });
  const received = new Promise((res, rej) => {
    child.once('message', res); child.once('error', rej);
    child.once('exit', code => { if (code !== 0) rej(new Error(`worker ${mode} exited ${code}: ${stderr.slice(-1500)}`)); });
  });
  // Observe rejection even if a deliberate crash occurs after a marker, before await.
  received.catch(() => {});
  const stop = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch (err) { if (err.code !== 'ESRCH') throw err; } };
  t.after(stop);
  return { child, received, stop };
}
async function until(fn) { const end = Date.now() + 12_000; while (!fn()) { if (Date.now() > end) throw new Error('timed out waiting for process marker'); await new Promise(r => setTimeout(r, 20)); } }
async function json(origin, path, body) { const response = await fetch(origin + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) } : undefined); return { status: response.status, body: await response.json() }; }
function eventCount(file) { return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).length : 0; }

for (const mode of ['library', 'http']) test(`current core -> desk -> batch -> value (${mode}), exact rows and replay`, { timeout: 40_000 }, async t => {
  const dir = work(t), storeDir = join(dir, 'store'), events = join(dir, 'events');
  let executionOrigin;
  if (mode === 'http') executionOrigin = (await start(t, dir, 'core', { events }).received).origin;
  const raw = { batchId: 'two-rows', items: [{ id: 'a', ...caller() }, { id: 'b', ...caller({ funding: 'reserved-fixture', payment: { fixture: true, scheme: 'exact', network: 'eip155:8453', payload: { fixture: true } } }) }] };
  // Use the exact shared funding fixture.
  raw.items[1].payment = JSON.parse(readFileSync(join(root, 'server/paid-useful-jobs/fixtures/payment/reserved-fixture.json')));
  const opts = { storeDir, deskOptions: { executionOrigin } };
  const batch = await runBatch(raw, opts);
  assert.equal(batch.ok, true, JSON.stringify(batch.items.map(i => ({ code: i.code, status: i.outcome, ticketCode: i.ticket?.code }))));
  assert.equal(batch.items.length, 2);
  assert.notEqual(batch.items[0].requestId, batch.items[1].requestId);
  assert.notEqual(batch.items[0].executionId, batch.items[1].executionId);
  for (const item of batch.items) {
    assert.match(item.inputDigest, /^[a-f0-9]{64}$/); assert.match(item.resultDigest, /^[a-f0-9]{64}$/);
    assert.equal(item.ticket.execution.receipt.inputsDigest.length, 64);
    assert.equal(item.settlement.verifiedSettlement, false); assert.equal(item.settlement.amountUsdc, null);
    assert.equal(item.outputs.every(o => o.executionId === item.executionId && o.requestId === item.requestId), true);
  }
  const replay = await runBatch(raw, opts);
  assert.equal(replay.replay, true); assert.deepEqual(replay.items.map(i => i.executionId), batch.items.map(i => i.executionId));
  if (mode === 'http') assert.equal(eventCount(events), 2);
  const ledgerPath = join(dir, 'value.json');
  const value = measureBatch({ batchId: batch.batchId, storeDir, ledgerPath });
  assert.equal(value.rows.length, 2); assert.equal(value.rows.every(r => r.usefulDelivery && !r.usefulPaidWork && r.jobRevenueUsdc === null), true);
  measureBatch({ batchId: batch.batchId, storeDir, ledgerPath });
  assert.equal(loadLedger(ledgerPath).rows.length, 2);
});

test('actual desk and batch HTTP endpoints retain failure and restart reconciliation', { timeout: 40_000 }, async t => {
  const dir = work(t), storeDir = join(dir, 'desk'), events = join(dir, 'events');
  const core = await start(t, dir, 'core', { events }).received;
  const deskServer = start(t, dir, 'desk-server', { storeDir, executionOrigin: core.origin });
  const desk = await deskServer.received;
  const request = caller({ orderId: 'failed-http', inputs: { before: join(fixture, 'before.json') } });
  const first = await json(desk.origin, '/v1/requests', request);
  assert.equal(first.status, 400); assert.equal(first.body.ok, false);
  const replay = await json(desk.origin, '/v1/requests', request);
  assert.equal(replay.status, 400); assert.equal(replay.body.executionId, first.body.executionId); assert.equal(eventCount(events), 1);
  const get = await json(desk.origin, '/v1/requests/' + first.body.requestId);
  assert.equal(get.body.ok, false); assert.equal(get.body.status, 'rejected');
  const batchOpts = { storeDir: join(dir, 'batch'), deskOptions: { executionOrigin: core.origin } };
  const s = start(t, dir, 'batch-server', batchOpts), info = await s.received;
  const posted = await json(info.origin, '/batch', { batchId: 'partial', items: [{ id: 'good', ...caller() }, { id: 'bad', ...request }] });
  assert.equal(posted.body.status, 'partial'); assert.equal(posted.body.ok, false); assert.equal(posted.body.counts.items, 2);
  s.stop();
  const second = await start(t, dir, 'batch-server', batchOpts).received;
  const got = await json(second.origin, '/batch/partial');
  assert.equal(got.body.batchHash, posted.body.batchHash); assert.equal(got.body.items[1].outcome, 'rejected');
});

test('kill after core execution, restart both processes, never dispatch the ambiguous request again', { timeout: 40_000 }, async t => {
  const dir = work(t), storeDir = join(dir, 'desk'), marker = join(dir, 'executed'), release = join(dir, 'release'), events = join(dir, 'events');
  const server = start(t, dir, 'core', { events, holdAfter: marker, release });
  const core = await server.received;
  const request = caller({ orderId: 'lost-reply', statedSettlement: { state: 'simulated' } });
  const process1 = start(t, dir, 'desk', { storeDir, request, executionOrigin: core.origin });
  await until(() => existsSync(marker));
  process1.stop(); writeFileSync(release, 'release');
  await new Promise(r => setTimeout(r, 60)); server.stop();
  const events2 = join(dir, 'events2'), core2 = await start(t, dir, 'core', { events: events2 }).received;
  const replay = await start(t, dir, 'desk', { storeDir, request, executionOrigin: core2.origin }).received;
  assert.equal(replay.status, 'unknown'); assert.equal(replay.ok, false); assert.equal(replay.retryAllowed, false);
  assert.equal(replay.settlement.state, 'unknown'); assert.equal(replay.settlement.amountUsdc, null);
  assert.equal(eventCount(events), 1); assert.equal(eventCount(events2), 0);
});

test('interrupted batch preserves every planned row without resuming dispatch', { timeout: 40_000 }, async t => {
  const dir = work(t), storeDir = join(dir, 'store'), marker = join(dir, 'executed'), events = join(dir, 'events');
  const core = await start(t, dir, 'core', { events, holdAfter: marker, release: join(dir, 'release') }).received;
  const request = { batchId: 'interrupted', items: [{ id: 'first', ...caller() }, { id: 'second', ...caller() }] };
  const writer = start(t, dir, 'batch', { storeDir, request, deskOptions: { executionOrigin: core.origin } });
  await until(() => existsSync(marker)); writer.stop();
  const replay = await runBatch(request, { storeDir });
  assert.equal(replay.ok, false); assert.equal(replay.counts.items, 2);
  assert.deepEqual(replay.items.map(i => i.outcome), ['unknown', 'not-attempted']);
  assert.equal(replay.items[0].settlement.amountUsdc, null); assert.equal(replay.items[1].executionId, null); assert.equal(eventCount(events), 1);
  const values = measureBatch({ batchId: request.batchId, storeDir });
  assert.equal(values.rows.length, 2); assert.equal(values.rows.every(r => !r.usefulDelivery && r.jobRevenueUsdc === null), true);
});

test('concurrent OS desk writers admit exactly one execution for the same request', { timeout: 40_000 }, async t => {
  const dir = work(t), storeDir = join(dir, 'store'), events = join(dir, 'events');
  const core = await start(t, dir, 'core', { events }).received;
  const opts = { storeDir, request: caller({ orderId: 'race' }), executionOrigin: core.origin };
  const writers = Array.from({ length: 6 }, () => start(t, dir, 'desk', opts));
  const rows = await Promise.all(writers.map(w => w.received));
  assert.equal(new Set(rows.map(r => r.requestId)).size, 1); assert.equal(eventCount(events), 1);
  const final = openDesk(storeDir).getRequest(rows[0].requestId);
  assert.equal(final.ok, true); assert.equal(readdirSync(join(storeDir, 'attempts')).filter(n => n.endsWith('.json')).length, 1);
});

test('concurrent same-order input substitution admits only one identity', { timeout: 40_000 }, async t => {
  const dir = work(t), storeDir = join(dir, 'store'), events = join(dir, 'events');
  const core = await start(t, dir, 'core', { events }).received;
  const a = caller({ orderId: 'same-order' }), b = caller({ orderId: 'same-order', inputs: { before: join(fixture, 'after.json'), after: join(fixture, 'before.json') } });
  const rows = await Promise.all([a, b].map(request => start(t, dir, 'desk', { request, storeDir, executionOrigin: core.origin }).received));
  assert.equal(rows.filter(r => r.ok).length, 1); assert.equal(rows.filter(r => ['same-order-id-input-swap', 'record-conflict'].includes(r.code)).length, 1); assert.equal(eventCount(events), 1);
});

for (const mutation of ['execution-id', 'input-receipt', 'nested-delivery', 'funding', 'output-bytes']) test(`reject current-core result substitution: ${mutation}`, t => {
  const dir = work(t);
  const execute = request => {
    const result = runCurrent(request);
    assert.equal(result.ok, true);
    if (mutation === 'execution-id') result.executionId = 'other-attempt';
    if (mutation === 'input-receipt') result.receipt.inputs[0].sha256 = '0'.repeat(64);
    if (mutation === 'nested-delivery') result.receipt.delivery.complete = false;
    if (mutation === 'funding') result.fundingState = 'reserved-fixture';
    if (mutation === 'output-bytes') writeFileSync(join(request.outDir, 'budget-impact.json'), '{}');
    return result;
  };
  const desk = openDesk(join(dir, 'store'), { execute }), request = caller({ orderId: mutation });
  const ticket = desk.createRequest(request);
  assert.equal(ticket.ok, false); assert.equal(ticket.status, 'unknown'); assert.equal(ticket.settlement.amountUsdc, null);
  assert.equal(desk.createRequest(request).executionId, ticket.executionId);
});

test('stored output replacement invalidates desk, batch and value reads', async t => {
  const dir = work(t), storeDir = join(dir, 'store');
  const batch = await runBatch({ batchId: 'tamper', items: [{ id: 'a', ...caller() }] }, { storeDir });
  assert.equal(batch.ok, true);
  writeFileSync(batch.items[0].outputs[0].path, 'swapped result');
  const read = readBatch('tamper', { storeDir });
  assert.equal(read.ok, false); assert.equal(read.items[0].outcome, 'unknown');
  const value = measureBatch({ batchId: 'tamper', storeDir });
  assert.equal(value.rows[0].usefulDelivery, false); assert.equal(value.rows[0].jobRevenueUsdc, null);
});

test('caller bytes are frozen before dispatch even if source file changes', t => {
  const dir = work(t), before = join(dir, 'before.json'), after = join(dir, 'after.json');
  writeFileSync(before, readFileSync(join(fixture, 'before.json'))); writeFileSync(after, readFileSync(join(fixture, 'after.json')));
  const desk = openDesk(join(dir, 'store'), { execute: request => { writeFileSync(after, '{}'); return runCurrent(request); } });
  const result = desk.createRequest(caller({ inputs: { before, after }, orderId: 'frozen' }));
  assert.equal(result.ok, true); assert.equal(result.inputs.find(i => i.name === 'after').sha256, result.execution.receipt.inputs.find(i => i.name === 'after').sha256);
  assert.equal(desk.createRequest(caller({ inputs: { before, after }, orderId: 'frozen' })).code, 'same-order-id-input-swap');
});

for (const state of ['unknown', 'possible-spend', 'settled']) test(`stated settlement ${state} cannot become zero, delivery or retry`, t => {
  const dir = work(t); let executions = 0;
  const desk = openDesk(join(dir, 'store'), { execute: () => { executions++; throw new Error('must not execute'); } });
  const request = caller({ orderId: state, statedSettlement: { state, amountUsdc: '0.02' } });
  const result = desk.createRequest(request), replay = desk.createRequest(request);
  assert.equal(result.ok, false); assert.equal(result.status, 'unknown'); assert.equal(result.settlement.state, 'unknown'); assert.equal(result.settlement.amountUsdc, null);
  assert.equal(result.settlement.stated.amountUsdc, '0.02'); assert.equal(replay.executionId, result.executionId); assert.equal(executions, 0);
});

test('batch identity binds bytes, order and stated settlement; duplicate IDs refuse before execution', async t => {
  const dir = work(t), opts = { storeDir: join(dir, 'store') }, raw = { batchId: 'identity', items: [{ id: 'a', ...caller() }] };
  const first = await runBatch(raw, opts); assert.equal(first.ok, true);
  const changed = await runBatch({ ...raw, items: [{ ...raw.items[0], statedSettlement: { state: 'unknown' } }] }, opts);
  assert.equal(changed.code, 'batch-id-conflict');
  const duplicate = await runBatch({ items: [raw.items[0], raw.items[0]] }, opts); assert.equal(duplicate.code, 'duplicate-item');
});

test('corrupt admission is retained and refused on reads and repeated creates', t => {
  const dir = work(t), storeDir = join(dir, 'store'), desk = openDesk(storeDir), request = caller({ orderId: 'corrupt', defer: true });
  const result = desk.createRequest(request); assert.equal(result.status, 'queued');
  const path = join(storeDir, 'tickets', result.requestId + '.json'); writeFileSync(path, '{');
  assert.equal(desk.createRequest({ ...request, defer: false }).ok, false); assert.equal(desk.listRequests().ok, false); assert.equal(readFileSync(path, 'utf8'), '{');
});

test('duplicate events deduplicate and concurrent distinct value writers lose no rows', { timeout: 40_000 }, async t => {
  const dir = work(t), storeDir = join(dir, 'store'), desk = openDesk(storeDir), ticket = desk.createRequest(caller());
  const row = measureRequest({ storeDir, requestId: ticket.requestId, buyerClass: 'owner-qa' }).row;
  const ledgerPath = join(dir, 'ledger.json');
  const writers = Array.from({ length: 8 }, (_, i) => start(t, dir, 'value-event', { ledgerPath, row: i < 4 ? row : { ...row, runId: `${row.runId}-${i}` } }));
  await Promise.all(writers.map(w => w.received));
  assert.equal(loadLedger(ledgerPath).rows.length, 5);
  assert.throws(() => appendRow(ledgerPath, { ...row, outputBytes: row.outputBytes + 1 }), /conflict/i);
  assert.throws(() => appendRow(ledgerPath, { ...row, usefulPaidWork: true }), /revenue/);
  assert.equal(measureRequest({ storeDir, requestId: ticket.requestId, buyerClass: 'fixture-buyer' }).code, 'buyer-class-conflict');
});

test('actual consumer CLIs share durable request identity and measure existing batch without another run', t => {
  const dir = work(t), storeDir = join(dir, 'batch'), reqPath = join(dir, 'request.json'), ledgerPath = join(dir, 'value.json');
  writeFileSync(reqPath, JSON.stringify({ batchId: 'cli-batch', items: [{ id: 'cli', ...caller() }] }));
  const run = spawnSync(process.execPath, [join(root, 'tools/paid-batch-reconciler/bin/batch.mjs'), 'run', reqPath, '--store', storeDir], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  const value = spawnSync(process.execPath, [join(root, 'tools/buyer-value-ledger/bin/value.mjs'), 'batch', '--batch-id', 'cli-batch', '--store', storeDir, '--ledger', ledgerPath], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(value.status, 0, value.stderr + value.stdout);
  assert.equal(JSON.parse(value.stdout).rows[0].usefulPaidWork, false);
  assert.equal(readdirSync(join(storeDir, 'desk', 'attempts')).filter(n => n.endsWith('.json')).length, 1);
});
