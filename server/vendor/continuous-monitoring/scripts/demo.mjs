import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { harness, delay } from '../test/harness.mjs';

export async function runDemo() {
  const started = performance.now(), app = await harness();
  try {
    const created = await app.create();
    assert.equal(created.status, 201);
    const id = created.body.monitor.id, root = `/v1/monitors/${id}`;
    const first = await app.tick();
    assert.deepEqual(first.outcomes, ['baseline_established']);
    const baseline = (await app.api(root)).body.monitor.initialEvidenceId;
    assert.ok(baseline);
    // The mounted origin actually changes between scheduled reads.
    app.state.price = 14;
    await delay(150);
    await app.restart();
    const second = await app.tick();
    assert.deepEqual(second.outcomes, ['content_changed']);
    // Independent consumer receives the durable change through the public HTTP API.
    const delivered = await app.api(`${root}/deliveries`);
    assert.equal(delivered.body.deliveries.length, 1);
    const message = delivered.body.deliveries[0];
    assert.equal(message.event.transition, 'content_changed');
    assert.deepEqual(message.event.diff, [{ field: '/price', before: 10, after: 14 }]);
    assert.equal(message.event.capture, 'mounted_http');
    assert.equal(message.event.publicSourceChanged, false);
    assert.equal(message.delivered, false);
    const ack = await app.api(`${root}/deliveries/${message.deliveryId}/ack`, {
      method: 'POST', body: { idempotencyKey: message.deliveryId },
    });
    assert.equal(ack.body.delivered, true);
    await app.restart();
    const readback = (await app.api(`${root}/deliveries/${message.deliveryId}`)).body;
    assert.equal(readback.delivered, true);
    const original = (await app.api(`${root}/snapshots/${baseline}`, { credential: app.readerToken })).body;
    assert.equal(original.material.fields['/price'], 10);
    const usage = (await app.api(`${root}/usage`)).body;
    assert.equal(usage.sourceRequestsKnown, 2);
    assert.equal(usage.acknowledgedEvents, 1);
    const cancel = await app.api(`${root}/cancel`, { method: 'POST', body: {} });
    assert.equal(cancel.body.monitor.status, 'cancelled');
    const metrics = {
      schema: 'continuous-monitoring.mounted-run.v1', capturedAt: new Date().toISOString(),
      environment: { node: process.version, platform: process.platform, arch: process.arch },
      kind: 'actual_mounted_http_origin_and_processes', deployed: false, naturalCustomerDemand: false,
      checks: usage.checksReserved, originRequests: app.state.requests,
      events: usage.transitions.usefulEvents, deliveryAttempts: usage.deliveryAttempts,
      acknowledgedEvents: usage.acknowledgedEvents, receivedBytes: usage.receivedBytesKnown,
      observationRuntimeMs: usage.runtimeMsKnown, retainedPayloadBytes: usage.retainedPayloadBytes,
      elapsedMs: Math.ceil(performance.now() - started),
      testedRestarts: 2, immutableBaselinePrice: original.material.fields['/price'],
      deliveredDiff: message.event.diff, cost: usage.cost,
    };
    return metrics;
  } finally { await app.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const metrics = await runDemo();
  const index = process.argv.indexOf('--evidence');
  if (index >= 0) await writeFile(process.argv[index + 1], `${JSON.stringify(metrics, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
}
