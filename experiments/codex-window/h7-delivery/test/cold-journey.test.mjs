import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runBatch } from '../../../../tools/paid-batch-reconciler/lib/ledger.mjs';
import { measureBatch } from '../../../../tools/buyer-value-ledger/lib/run.mjs';
import { replay } from '../../../../tools/output-replay-harness/lib/replay.mjs';
import { WRAPPER_BIN } from '../../../../tools/output-replay-harness/lib/wrapper.mjs';
import { spawnExecutionHttp } from '../../../wave5/d14/test/spawn-d01.mjs';
import { runCli, uniquePair } from '../../../wave5/d14/test/helpers.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
function command(bin, args, expected = 0) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=768' },
  });
  assert.equal(result.status, expected, `${bin}: ${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  await exited; clearTimeout(timer);
}

test('H7 cold current-runtime journey: freeze → execute → export/ack → replay/batch → HTTP local acquire', { timeout: 180_000 }, async t => {
  const work = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'h7-cold-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));

  // Frozen caller intent: current first-offer lockfile-pin-delta.
  cpSync(join(ROOT, 'tools/lockfile-pin-delta/fixtures/journey/before.json'), join(work, 'before.json'));
  cpSync(join(ROOT, 'tools/lockfile-pin-delta/fixtures/journey/after.json'), join(work, 'after.json'));
  const frozenBefore = sha(readFileSync(join(work, 'before.json')));
  const execution = command('server/paid-useful-jobs/bin/cli.mjs', [
    'run', 'lockfile-pin-delta',
    '--before', join(work, 'before.json'), '--after', join(work, 'after.json'),
    '--out-dir', join(work, 'published'),
  ]);
  writeFileSync(join(work, 'after.json'), '{"mutated-after-freeze":true}\n');
  assert.equal(execution.contract, 'samedaydesk.paid-useful-jobs.execution.v1');
  assert.equal(execution.ok, true);
  assert.equal(execution.transport, 'ok');
  assert.equal(execution.delivery.complete, true);
  assert.equal(execution.sold, false);
  t.after(() => { if (execution.runOutDir) rmSync(execution.runOutDir, { recursive: true, force: true }); });
  assert.equal(json(join(execution.runOutDir, 'receipt.json')).inputs.find(r => r.name === 'before').sha256, frozenBefore);
  for (const row of execution.outputs) {
    assert.equal(sha(readFileSync(join(execution.runOutDir, row.name))), row.sha256);
  }

  const mailbox = join(work, 'mailbox');
  const clock = '2026-09-12T10:00:00Z';
  writeFileSync(join(work, 'execution.json'), JSON.stringify(execution));
  assert.equal(command('tools/result-mailbox/bin/mailbox.mjs', [
    'seed', '--mailbox', mailbox, '--request-id', 'h7-cold', '--job-id', execution.jobId,
    '--from-d01-execution', join(work, 'execution.json'), '--clock', clock,
  ]).ok, true);
  const pickup = command('tools/result-mailbox/bin/mailbox.mjs', [
    'pickup', '--mailbox', mailbox, '--request-id', 'h7-cold', '--out', join(work, 'pickup'), '--clock', clock,
  ]);
  assert.equal(pickup.ok, true);
  for (const row of execution.outputs) {
    assert.equal(sha(readFileSync(join(work, 'pickup', row.name))), row.sha256);
  }

  const bundle = command('tools/job-artifact-export/bin/export.mjs', [
    'export', '--in-dir', execution.runOutDir, '--out', join(work, 'bundle'),
  ]);
  assert.equal(bundle.completeness.ok, true);

  const receiverStore = join(work, 'receiver');
  const receiver = spawn(process.execPath, [
    'tools/job-delivery-outbox/bin/loopback-receiver.mjs',
    '--mode', 'ack', '--store-dir', receiverStore, '--bundle-dir', join(work, 'bundle'),
    '--path', '/bound?h7=1', '--delay-ms', '200',
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => stop(receiver));
  const info = await new Promise((resolve, reject) => {
    let stdout = '';
    const timeout = setTimeout(() => reject(new Error('receiver startup timeout')), 5000);
    receiver.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.includes('\n')) { clearTimeout(timeout); resolve(JSON.parse(stdout.split('\n')[0])); }
    });
    receiver.on('exit', code => { if (!stdout.includes('\n')) reject(new Error(`receiver exited ${code}`)); });
  });
  const queued = command('tools/job-delivery-outbox/bin/outbox.mjs', [
    'enqueue', '--store', join(work, 'outbox'), '--receipt', join(execution.runOutDir, 'receipt.json'),
    '--zip', bundle.zip, '--callback-url', info.url,
  ]);
  const delivered = command('tools/job-delivery-outbox/bin/outbox.mjs', [
    'deliver-once', '--store', join(work, 'outbox'), '--event-id', queued.event.eventId, '--opt-in',
  ]);
  assert.equal(delivered.deliveryState, 'delivered');
  assert.equal(delivered.event.sold, false);
  const recs = readdirSync(receiverStore).filter(n => n.endsWith('.json'));
  assert.equal(recs.length, 1);
  assert.equal(json(join(receiverStore, recs[0])).committed, true);

  const replayed = replay({
    engine: 'd01-wrapper', job: 'vendor-budget-impact',
    inputs: {
      before: join(ROOT, 'experiments/codex-window/cw61-repeat-replay-integration/fixtures/before.json'),
      after: join(ROOT, 'experiments/codex-window/cw61-repeat-replay-integration/fixtures/changed.json'),
    },
    outA: join(work, 'replay-a'), outB: join(work, 'replay-b'),
  });
  assert.equal(replayed.runs.length, 2);
  assert.notEqual(replayed.runs[0].executionId, replayed.runs[1].executionId);
  assert.equal(replayed.runs.every(r => r.transport === 'ok' && r.delivery.complete), true);
  assert.equal(replayed.semanticCorrectnessVerified, false);

  const fixture = join(ROOT, 'tools/job-request-desk/fixtures/caller/vendor-budget-impact');
  const batch = await runBatch({
    batchId: 'h7-cold',
    items: [
      { id: 'a', engineId: 'vendor-budget-impact', inputs: { before: join(fixture, 'before.json'), after: join(fixture, 'after.json') }, buyerClass: 'owner-qa' },
      { id: 'b', engineId: 'vendor-budget-impact', inputs: { before: join(fixture, 'before.json'), after: join(fixture, 'after.json') }, buyerClass: 'owner-qa' },
    ],
  }, { storeDir: join(work, 'batch-store') });
  assert.equal(batch.ok, true, JSON.stringify(batch.items.map(i => ({ code: i.code, status: i.outcome }))));
  assert.equal(batch.items.length, 2);
  const value = measureBatch({ batchId: batch.batchId, storeDir: join(work, 'batch-store'), ledgerPath: join(work, 'value.json') });
  assert.equal(value.rows.every(r => r.usefulDelivery && !r.usefulPaidWork && r.jobRevenueUsdc === null), true);

  const runtime = spawnExecutionHttp();
  t.after(() => runtime.stop());
  const origin = await runtime.originPromise;
  const pair = uniquePair();
  const ticketPath = join(work, 'http-ticket.json');
  const submitted = runCli([
    'submit', '--base', origin, '--job', 'vendor-budget-impact',
    '--before', pair.beforePath, '--after', pair.afterPath, '--ticket', ticketPath,
    '--execution-id', 'h7-cold-http',
  ]);
  assert.equal(submitted.status, 0, submitted.stderr + submitted.stdout);
  const submitBody = JSON.parse(submitted.stdout);
  assert.equal(submitBody.ticket.executionId, 'h7-cold-http');
  assert.equal(submitBody.ticket.retrieval.path, '/results/h7-cold-http');
  writeFileSync(pair.afterPath, '{"changed-after-freeze":true}\n');
  const fetchOut = join(work, 'http-result.json');
  const fetched = runCli(['fetch', '--ticket', ticketPath, '--out', fetchOut]);
  assert.equal(fetched.status, 0, fetched.stderr + fetched.stdout);
  const fetchStdout = JSON.parse(fetched.stdout);
  assert.equal(fetchStdout.acquisition.code, 'unsupported-portable-acquisition');
  assert.equal(fetchStdout.httpArtifactsDelivered, false);
  const fetchFile = json(fetchOut);
  const hostJson = fetchFile.result.outputs.find(o => o.name === 'budget-impact.json')?.path;
  const hostMd = fetchFile.result.outputs.find(o => o.name === 'budget-impact.md')?.path;
  assert.equal(typeof hostJson, 'string');
  mkdirSync(join(work, 'local-arts'), { recursive: true });
  cpSync(hostJson, join(work, 'local-arts', 'budget-impact.json'));
  cpSync(hostMd, join(work, 'local-arts', 'budget-impact.md'));
  const acquired = runCli([
    'fetch', '--ticket', ticketPath, '--out', join(work, 'http-result-local.json'),
    '--local-artifacts', join(work, 'local-arts'), '--acquire-to', join(work, 'acquired'),
  ]);
  assert.equal(acquired.status, 0, acquired.stderr + acquired.stdout);
  const acq = JSON.parse(acquired.stdout).acquisition;
  assert.equal(acq.code, 'local-acquired');
  assert.equal(acq.source, 'local');
  assert.equal(acq.httpArtifactsDelivered, false);
  assert.equal(existsSync(join(work, 'acquired', 'budget-impact.json')), true);

  if (process.env.H7_EVIDENCE) {
    writeFileSync(join(process.env.H7_EVIDENCE, 'cold-current-runtime-journey.json'), JSON.stringify({
      pin: '6007fcfa27074f9a594248e47296f1afa4f8385d',
      catalog: '1.4.3',
      lockfile: { jobId: execution.jobId, executionId: execution.executionId, transport: execution.transport, sold: false },
      export: { zipSha256: bundle.zipSha256, completeness: bundle.completeness },
      outbox: { deliveryState: delivered.deliveryState, commitBeforeAck: true, sold: false },
      replay: { pids: replayed.runs.map(r => r.pid), executionIds: replayed.runs.map(r => r.executionId) },
      batch: { ok: batch.ok, usefulPaidWork: false },
      http: { executionId: submitBody.ticket.executionId, portable: fetchStdout.acquisition.code, local: acq.code, httpArtifactsDelivered: false },
      wrapperBin: WRAPPER_BIN,
    }, null, 2));
  }
});
