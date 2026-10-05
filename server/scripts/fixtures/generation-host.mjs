// Disposable database authority only; never a serving/operator product route.
import { PostgresStore } from '@neomorphic/correspondence';
import { openEntryFacade, closeEntryThenBase } from '../../foundry/compose.js';
import { supervise } from '../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/supervisor.mjs';
import { express } from '../../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/deps.mjs';
if (!/^postgres:\/\/sds@127\.0\.0\.1:\d+\/generation_[a-f0-9]+$/.test(process.env.CORRESPONDENCE_DATABASE_URL ?? '')) throw new Error('disposable_only');
const config = { databaseUrl: process.env.CORRESPONDENCE_DATABASE_URL, pgSchema: process.env.CORRESPONDENCE_PG_SCHEMA,
  adminToken: 'disposable-never-issued-admin-token', store: 'postgres', bodyLimitBytes: 524288,
  rateLimitWindowMs: 60000, rateLimitMax: 10000, corsOrigins: [], trustProxyHops: 0, poolMax: 1, port: 0 };
const base = new PostgresStore(config.databaseUrl, { schema: config.pgSchema, poolMax: 1 });
const { mounted } = await openEntryFacade({ store: base, config });
const store = mounted.extension.integration;
const app = express(); app.use('/api/correspondence', mounted.app);
const server = app.listen(0, '127.0.0.1', () => process.send({ baseUrl: `http://127.0.0.1:${server.address().port}/api/correspondence` }));
process.on('message', async m => {
  try {
    let result;
    if (m.op === 'verify' || m.op === 'verify-reserved') {
      const id = m.op === 'verify' ? (await store.reserve(m.projectId)).assignment.id : m.candidateId;
      result = await supervise(store, m.projectId, id);
      await store.reconcile(m.projectId, id);
    } else if (m.op === 'reserve') {
      result = await store.reserve(m.projectId);
    } else if (m.op === 'publish') result = await store.publish(m.projectId, m.candidateId, m.generation ?? 1);
    else throw new Error('unsupported_private_control');
    process.send({ id: m.id, result });
  } catch (e) { process.send({ id: m.id, error: e.code ?? 'private_control_failed' }); }
});
let stopped = false;
async function stop() {
  if (stopped) return; stopped = true; clearTimeout(timer);
  server.closeAllConnections(); await new Promise(r => server.close(r));
  await closeEntryThenBase(mounted, base); process.exit(0);
}
const timer = setTimeout(stop, 180000);
process.on('SIGTERM', stop); process.on('disconnect', stop);
