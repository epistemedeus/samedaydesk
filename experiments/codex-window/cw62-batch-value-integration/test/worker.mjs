import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createExecutionServer, listenExecutionServer } from '../../../../server/paid-useful-jobs/lib/http.mjs';
import { runPaidOffer } from '../../../../server/paid-useful-jobs/lib/wrapper.mjs';
import { openDesk } from '../../../../tools/job-request-desk/lib/desk.mjs';
import { createLocalDeskServer } from '../../../../tools/job-request-desk/lib/http-adapter.mjs';
import { createPaidBatchServer, listenLocal } from '../../../../tools/paid-batch-reconciler/lib/http.mjs';
import { runBatch } from '../../../../tools/paid-batch-reconciler/lib/ledger.mjs';
import { appendRow } from '../../../../tools/buyer-value-ledger/lib/ledger.mjs';

const mode = process.argv[2], opts = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const send = body => new Promise((resolve, reject) => {
  if (typeof process.send !== 'function') { resolve(); return; }
  process.send(body, err => err ? reject(err) : resolve());
});

if (mode === 'core') {
  const { server } = createExecutionServer({ execute: async request => {
    appendFileSync(opts.events, JSON.stringify({ executionId: request.executionId, phase: 'entered' }) + '\n');
    const result = await runPaidOffer(request);
    if (opts.holdAfter && request.executionId) {
      writeFileSync(opts.holdAfter, JSON.stringify({ executionId: request.executionId, phase: 'executed' }));
      const end = Date.now() + 15_000;
      while (!existsSync(opts.release) && Date.now() < end) await new Promise(r => setTimeout(r, 20));
    }
    return result;
  } });
  await send(await listenExecutionServer(server));
} else if (mode === 'desk-server') {
  const info = await createLocalDeskServer(openDesk(opts.storeDir, { executionOrigin: opts.executionOrigin })).listen();
  await send({ origin: info.baseUrl });
} else if (mode === 'batch-server') {
  const { server } = createPaidBatchServer(opts);
  await send({ origin: (await listenLocal(server)).url });
} else {
  let result;
  if (mode === 'desk') result = openDesk(opts.storeDir, { executionOrigin: opts.executionOrigin }).createRequest(opts.request);
  else if (mode === 'batch') result = await runBatch(opts.request, opts);
  else if (mode === 'value-event') result = appendRow(opts.ledgerPath, opts.row);
  await send(result);
  process.exit(0);
}
