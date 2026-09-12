import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const ROOT = process.cwd();
const EXPORT = 'tools/job-artifact-export/bin/export.mjs';
const OUTBOX = 'tools/job-delivery-outbox/bin/outbox.mjs';
const MAILBOX = 'tools/result-mailbox/bin/mailbox.mjs';
const RECEIVER = 'tools/job-delivery-outbox/bin/loopback-receiver.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));
function command(bin, args, expected = 0) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, expected, `${bin}: ${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}
function current(t, same = false) {
  const root = mkdtempSync(join(tmpdir(), 'cw60-cold-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync('tools/lockfile-pin-delta/fixtures/journey/before.json', join(root, 'before.json'));
  cpSync(`tools/lockfile-pin-delta/fixtures/journey/${same ? 'before' : 'after'}.json`, join(root, 'after.json'));
  const execution = command('server/paid-useful-jobs/bin/cli.mjs', ['run', 'lockfile-pin-delta',
    '--before', join(root, 'before.json'), '--after', join(root, 'after.json'), '--out-dir', join(root, 'published')]);
  assert.equal(execution.contract, 'samedaydesk.paid-useful-jobs.execution.v1');
  assert.equal(execution.transport, 'ok'); assert.equal(execution.delivery.complete, true);
  t.after(() => rmSync(execution.runOutDir, { recursive: true, force: true }));
  const receiptPath = join(execution.runOutDir, 'receipt.json');
  const bundle = command(EXPORT, ['export', '--in-dir', execution.runOutDir, '--out', join(root, 'bundle')]);
  assert.equal(bundle.completeness.ok, true);
  return { root, execution, receiptPath, bundle, store: join(root, 'outbox') };
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  await exited; clearTimeout(timer);
}
async function receiver(t, p, mode = 'ack', extra = []) {
  const store = join(p.root, `receiver-${mode}-${Math.random().toString(16).slice(2)}`);
  const child = spawn(process.execPath, [RECEIVER, '--mode', mode, '--store-dir', store,
    '--bundle-dir', join(p.root, 'bundle'), '--path', '/bound?revision=1', ...extra], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => stop(child));
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const info = await new Promise((resolve, reject) => {
    let stdout = ''; const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`Receiver startup timeout ${stderr}`)); }, 5000);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.includes('\n')) { clearTimeout(timeout); resolve(JSON.parse(stdout.split('\n')[0])); } });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { clearTimeout(timeout); if (!stdout.includes('\n')) reject(new Error(`Receiver exited ${code}: ${stderr}`)); });
  });
  return { child, store, ...info };
}
function enqueue(p, url, extra = [], expected = 0) {
  return command(OUTBOX, ['enqueue', '--store', p.store, '--receipt', p.receiptPath,
    '--zip', p.bundle.zip, '--callback-url', url, ...extra], expected);
}
function deliver(p, eventId, expected = 0) {
  return command(OUTBOX, ['deliver-once', '--store', p.store, '--event-id', eventId, '--opt-in', '--timeout-ms', '2000'], expected);
}
const records = r => readdirSync(r.store).filter(name => name.endsWith('.json'));
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('condition timeout'); await new Promise(r => setTimeout(r, 10)); }
}

test('cold current wrapper → existing mailbox → exact export → independent receiver; commit precedes ack and replay is idempotent', async t => {
  const p = current(t); const executionFile = join(p.root, 'execution.json'); save(executionFile, p.execution);
  const mailbox = join(p.root, 'mailbox'), clock = '2026-09-12T08:00:00Z';
  const seed = command(MAILBOX, ['seed', '--mailbox', mailbox, '--request-id', 'cw60-current', '--job-id', p.execution.jobId,
    '--from-d01-execution', executionFile, '--clock', clock]);
  assert.equal(seed.ok, true);
  const pickup = command(MAILBOX, ['pickup', '--mailbox', mailbox, '--request-id', 'cw60-current', '--out', join(p.root, 'pickup'), '--clock', clock]);
  assert.equal(pickup.ok, true);
  for (const row of p.execution.outputs) {
    assert.equal(sha(readFileSync(join(p.root, 'pickup', row.name))), row.sha256);
  }
  const r = await receiver(t, p, 'ack', ['--delay-ms', '700']);
  assert.notEqual(r.child.pid, process.pid);
  const queued = enqueue(p, r.url); const eventId = queued.event.eventId;
  const sender = spawn(process.execPath, [OUTBOX, 'deliver-once', '--store', p.store, '--event-id', eventId, '--opt-in']);
  t.after(() => stop(sender)); let stdout = '', stderr = '';
  sender.stdout.on('data', c => { stdout += c; }); sender.stderr.on('data', c => { stderr += c; });
  const senderExit = once(sender, 'exit');
  await until(() => records(r).length === 1);
  const committed = json(join(r.store, records(r)[0]));
  assert.equal(committed.committed, true);
  assert.equal(json(join(p.store, 'outbox.json')).events[eventId].deliveryState, 'unknown');
  for (const row of p.execution.outputs) {
    assert.equal(sha(readFileSync(join(committed.artifactOut, row.name))), row.sha256);
  }
  assert.equal((await senderExit)[0], 0, stderr);
  const delivered = JSON.parse(stdout); assert.equal(delivered.deliveryState, 'delivered');
  assert.equal(delivered.event.attempts[0].ack.zipSha256, p.bundle.zipSha256);
  assert.equal(delivered.event.sold, false); assert.equal(delivered.event.buyerAccepted, false);
  assert.equal(enqueue(p, r.url).duplicate, true);
  assert.equal(deliver(p, eventId).network, false);
  const replay = await fetch(r.url, { method: 'POST', headers: { 'x-outbox-event-id': eventId }, body: JSON.stringify(queued.event.payload) });
  assert.equal(replay.status, 200); assert.equal(records(r).length, 1);
  const reconciled = command(OUTBOX, ['reconcile', '--store', p.store]); assert.equal(reconciled.counts.delivered, 1);
  if (process.env.CW60_EVIDENCE) save(join(process.env.CW60_EVIDENCE, 'cold-journey.json'), {
    producer: resolve('server/paid-useful-jobs/bin/cli.mjs'), source: p.execution.receipt.engine,
    jobId: p.execution.jobId, transport: p.execution.transport, analysis: p.execution.analysis,
    outputs: p.execution.outputs, outputsDigest: p.execution.receipt.outputsDigest,
    export: { zipSha256: p.bundle.zipSha256, termsVersion: p.bundle.termsVersion, completeness: p.bundle.completeness },
    receiverPid: r.child.pid, senderPid: sender.pid, callbackPath: committed.callbackPath,
    commitBeforeAck: true, replaySingleRecord: true, event: delivered.event,
    mailboxPickup: { ok: pickup.ok }, sold: false,
  });
});

for (const mode of ['empty-body', 'close-after-store', 'ack-wrong-path', 'ack-wrong-digest', 'ack-event-only']) {
  test(`independent receiver ${mode} cannot create false completion`, async t => {
    const p = current(t); const r = await receiver(t, p, mode);
    const q = enqueue(p, r.url); const result = deliver(p, q.event.eventId);
    assert.equal(result.deliveryState, mode === 'close-after-store' ? 'unknown' : 'failed');
    assert.equal(records(r).length, 1); assert.equal(result.event.callbackAcknowledged, false);
    assert.equal(deliver(p, q.event.eventId, 2).ok, false);
    const rec = command(OUTBOX, ['reconcile', '--store', p.store]); assert.equal(rec.counts.delivered, 0);
  });
}

test('same-origin changed path/query changes terms; same event ID conflicts and changed stored endpoint refuses before HTTP', async t => {
  const p = current(t); const r = await receiver(t, p);
  const a = enqueue(p, r.url); const other = r.url.replace('revision=1', 'revision=2');
  const b = enqueue(p, other);
  assert.notEqual(a.event.eventId, b.event.eventId); assert.notEqual(a.event.termsHash, b.event.termsHash);
  assert.equal(enqueue(p, other, ['--event-id', a.event.eventId], 2).code, 'event-id-body-conflict');
  const statePath = join(p.store, 'outbox.json'); const state = json(statePath);
  state.events[a.event.eventId].callbackUrl = other; save(statePath, state);
  assert.equal(deliver(p, a.event.eventId, 2).ok, false); assert.equal(records(r).length, 0);
  const wrongPath = deliver(p, b.event.eventId); assert.equal(wrongPath.deliveryState, 'failed'); assert.equal(records(r).length, 0);
});

test('different receiver process has an independent commit and destination identity', async t => {
  const p = current(t); const a = await receiver(t, p); const b = await receiver(t, p);
  const qa = enqueue(p, a.url); const qb = enqueue(p, b.url);
  assert.notEqual(a.child.pid, b.child.pid); assert.notEqual(qa.event.termsHash, qb.event.termsHash);
  assert.equal(deliver(p, qa.event.eventId).deliveryState, 'delivered'); assert.equal(records(b).length, 0);
  assert.equal(deliver(p, qb.event.eventId).deliveryState, 'delivered'); assert.equal(records(a).length, 1); assert.equal(records(b).length, 1);
});

test('current no-change analysis stays exportable and retrievable', t => {
  const p = current(t, true);
  assert.equal(p.execution.analysis.status, 'informational');
  const imported = command(EXPORT, ['import', '--zip', p.bundle.zip, '--out', join(p.root, 'import')]);
  assert.equal(imported.completeness.ok, true); assert.equal(imported.transport, 'ok');
});

test('partial current receipt, changed exact output, missing bundle and swapped receipt refuse', t => {
  const p = current(t); const url = 'http://127.0.0.1:9/bound';
  const noBundle = command(OUTBOX, ['enqueue', '--store', p.store, '--receipt', p.receiptPath, '--callback-url', url], 2);
  assert.equal(noBundle.code, 'bundle-required');
  const receipt = json(p.receiptPath); receipt.delivery.complete = false; save(p.receiptPath, receipt);
  assert.equal(enqueue(p, url, [], 2).code, 'receipt-not-completed');
  assert.equal(command(EXPORT, ['export', '--in-dir', p.execution.runOutDir, '--out', join(p.root, 'partial')], 2).ok, false);
  receipt.delivery.complete = true; save(p.receiptPath, receipt);
  writeFileSync(join(p.execution.runOutDir, receipt.outputs[0].name), 'changed');
  assert.equal(command(EXPORT, ['export', '--in-dir', p.execution.runOutDir, '--out', join(p.root, 'changed')], 2).code, 'receipt-output-mismatch');
  receipt.sample = !receipt.sample; save(p.receiptPath, receipt);
  assert.equal(enqueue(p, url, [], 2).code, 'bundle-receipt-mismatch');
});
