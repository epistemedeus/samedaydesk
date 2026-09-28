import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { REPO, readJson, writeJson } from '../lib/context.mjs';

const config = readJson(process.argv[2]);
const core = path => import(pathToFileURL(join(REPO, path)).href);
const emit = body => { process.stdout.write(JSON.stringify(body, null, 2) + '\n'); process.exitCode = body.ok === true ? 0 : 2; };
async function barrier(stage, detail = {}) {
  if (config.barrier?.stage !== stage) return;
  writeJson(config.barrier.ready, { stage, pid: process.pid, ...detail });
  const start = Date.now();
  while (!existsSync(config.barrier.release)) {
    if (Date.now() - start > 20_000) throw new Error('barrier release timeout: ' + stage);
    await delay(15);
  }
}

if (config.mode === 'http') {
  const url = new URL(config.path, config.origin);
  if (url.hostname !== '127.0.0.1') throw new Error('CW65 HTTP must stay loopback');
  const response = await fetch(url, { method: config.body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...config.headers },
    body: config.body === undefined ? undefined : JSON.stringify(config.body), signal: AbortSignal.timeout(20_000) });
  const raw = await response.text();
  emit({ ok: true, status: response.status, body: JSON.parse(raw), raw });
} else if (config.mode === 'execute') {
  const { createExecutor } = await core('server/paid-useful-jobs/lib/wrapper.mjs');
  const { runEngineJob } = await core('server/paid-useful-jobs/lib/engine.mjs');
  const { runEngineForD01 } = await core('experiments/wave5/m01/lib/d01-adapter.mjs');
  const { isM01JobId } = await core('server/paid-useful-jobs/lib/delivery-catalog.mjs');
  const execute = config.barrier ? createExecutor({ runEngine: async (jobId, options) => {
    await barrier('staged-inputs', { files: options.files, outDir: options.outDir });
    return isM01JobId(jobId) ? runEngineForD01(jobId, options) : runEngineJob(jobId, options);
  } }) : createExecutor();
  emit(await execute(config.request));
} else if (config.mode === 'server') {
  const { createExecutionServer, listenExecutionServer } = await core('server/paid-useful-jobs/lib/http.mjs');
  const { runPaidOffer } = await core('server/paid-useful-jobs/lib/wrapper.mjs');
  const { server } = createExecutionServer({
    ...(config.ttlMs ? { resultTtlMs: config.ttlMs } : {}),
    execute: async request => {
      if (config.calls) appendFileSync(config.calls, JSON.stringify({ pid: process.pid, executionId: request.executionId }) + '\n');
      return runPaidOffer(request);
    },
  });
  const info = await listenExecutionServer(server, { host: '127.0.0.1', port: 0 });
  writeJson(config.ready, { ...info, pid: process.pid });
  process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
} else if (config.mode === 'order-request') {
  const { loadPins } = await core('tools/managed-useful-jobs-order/lib/pins.mjs');
  const { loadDeliveryCatalog, pinForDeliveryJob } = await core('server/paid-useful-jobs/lib/delivery-catalog.mjs');
  const { sha256 } = await import('../lib/oracle.mjs');
  const job = loadDeliveryCatalog().jobs.find(j => j.id === config.fixture.jobId);
  const request = { orderId: config.orderId, engineId: job.id, fundingState: 'unfunded',
    enginePin: pinForDeliveryJob(job, loadPins()),
    inputs: Object.entries(config.fixture.inputs).map(([key, path]) => {
      const bytes = readFileSync(path); return { flag: '--' + key, path, sha256: sha256(bytes), bytes: bytes.length };
    }) };
  emit({ ok: true, request });
} else if (config.mode === 'order') {
  const { runCreateOrder } = await core('tools/managed-useful-jobs-order/lib/create-order.mjs');
  const { createFileStore } = await core('tools/managed-useful-jobs-order/lib/store-file.mjs');
  const { loadDeliveryCatalog } = await core('server/paid-useful-jobs/lib/delivery-catalog.mjs');
  const store = createFileStore(config.store);
  const original = { reserve: store.reserve.bind(store), recordExecution: store.recordExecution.bind(store), complete: store.complete.bind(store) };
  store.reserve = async record => {
    if (config.reserveAttempt) writeJson(config.reserveAttempt, { pid: process.pid, orderId: record.orderId });
    const outcome = await original.reserve(record);
    if (outcome.kind === 'created' || outcome.kind === 'adopt') await barrier('reserved', { outcome, durable: await store.get(record.orderId) });
    return outcome;
  };
  store.recordExecution = async record => {
    await original.recordExecution(record);
    await barrier('execution-recorded', { durable: await store.get(record.orderId) });
  };
  store.complete = async (id, result) => {
    await barrier('before-complete', { result, durable: await store.get(id) });
    const record = await original.complete(id, result);
    await barrier('completed', { durable: record });
    return record;
  };
  try {
    const result = await runCreateOrder(config.request, { store, requestDir: dirname(process.argv[2]),
      outDir: config.outDir, catalog: loadDeliveryCatalog(), executeUrl: config.executeUrl || null });
    emit(result);
  } finally { await store.close(); }
} else if (config.mode === 'verify') {
  const { verifyComplete } = await core('tools/job-output-atomicity/lib/verify.mjs');
  const { loadDeliveryCatalog, pinForDeliveryJob } = await core('server/paid-useful-jobs/lib/delivery-catalog.mjs');
  const { loadPins } = await core('tools/managed-useful-jobs-order/lib/pins.mjs');
  const catalog = loadDeliveryCatalog(), job = catalog.jobs.find(j => j.id === config.jobId);
  const pin = pinForDeliveryJob(job, loadPins());
  emit(verifyComplete({ root: config.root, catalog, expectedArchiveSha256: pin.sha256, expectedArchiveBytes: pin.bytes }));
} else throw new Error('Unknown CW65 worker mode: ' + config.mode);
