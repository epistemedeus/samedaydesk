// Explicit, one-shot, free read of the existing foundation. Never follows a payment challenge.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { MonitorStore } from '../src/store.mjs';
import { createApi } from '../src/api.mjs';
import { tick } from '../src/worker.mjs';

process.umask(0o077);
const directory = await mkdtemp(path.join(tmpdir(), 'neo-monitor-public-'));
const store = new MonitorStore(path.join(directory, 'public.sqlite'));
const server = createApi(store);
try {
  const token = randomBytes(32).toString('base64url');
  store.provision({ id: 'readonly-public-proof', token });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const create = await fetch(`${base}/v1/monitors`, { method: 'POST', headers: {
    authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': 'public-observatory-read',
  }, body: JSON.stringify({ url: 'https://samedaydesk.com/api/observatory/snapshot', mode: 'observatory', sourceId: 'moltjobs',
    intervalMs: 60000, expiresAt: new Date(Date.now() + 60000).toISOString(), budget: { maxChecks: 1, timeoutMs: 8000 } }) });
  if (create.status !== 201) throw new Error('public proof monitor not created');
  const id = (await create.json()).monitor.id;
  const result = await tick(store);
  const consumer = await fetch(`${base}/v1/monitors/${id}/runs`, { headers: { authorization: `Bearer ${token}` } });
  const run = (await consumer.json()).runs[0];
  let delivery = null;
  if (run?.eventId) {
    const inbox = await fetch(`${base}/v1/monitors/${id}/deliveries`, { headers: { authorization: `Bearer ${token}` } });
    const message = (await inbox.json()).deliveries[0];
    if (!message) throw new Error('public negative evidence not deliverable');
    await fetch(`${base}/v1/monitors/${id}/deliveries/${message.deliveryId}/ack`, { method: 'POST', headers: {
      authorization: `Bearer ${token}`, 'content-type': 'application/json',
    }, body: JSON.stringify({ idempotencyKey: message.deliveryId }) });
    const readback = await fetch(`${base}/v1/monitors/${id}/deliveries/${message.deliveryId}`, { headers: { authorization: `Bearer ${token}` } });
    const accepted = await readback.json();
    if (!accepted.delivered) throw new Error('public negative delivery not acknowledged');
    delivery = { transition: message.event.transition, failureCode: message.event.failureCode,
      acknowledged: accepted.delivered, attempts: accepted.attempts };
  }
  const row = store.owned('readonly-public-proof', id);
  const proof = { schema: 'continuous-monitoring.public-read.v1', capturedAt: new Date().toISOString(),
    node: process.version, source: 'https://samedaydesk.com/api/observatory/snapshot', sourceId: 'moltjobs',
    demoException: false, upstreamMethod: 'GET', deployed: false, naturalCustomerDemand: false,
    outcome: result.completed[0]?.outcome ?? null, failure: run?.observation?.failureCode ?? run?.failure ?? null,
    consumerHttpStatus: consumer.status, delivery, metrics: run?.metrics ?? null, usage: store.usageFor(row),
    limitation: 'one public baseline or unavailable-evidence read; no public change or customer subscription claimed' };
  const index = process.argv.indexOf('--evidence');
  if (index >= 0) await writeFile(process.argv[index + 1], `${JSON.stringify(proof, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close();
  await rm(directory, { recursive: true, force: true });
}
