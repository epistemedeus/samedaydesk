import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { runDemo } from '../scripts/demo.mjs';

test('first actual test: changing mounted HTTP origin, durable worker, API consumer, acknowledgement and restart', { timeout: 15000 }, async () => {
  const metrics = await runDemo();
  assert.equal(metrics.originRequests, 2);
  assert.equal(metrics.acknowledgedEvents, 1);
  assert.equal(metrics.cost.total, null);
  if (process.env.MONITOR_EVIDENCE) await writeFile(process.env.MONITOR_EVIDENCE, `${JSON.stringify(metrics, null, 2)}\n`);
});
