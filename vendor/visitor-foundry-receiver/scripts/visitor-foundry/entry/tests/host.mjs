// Disposable fixture only. Real correspondence app/store, independent HTTP process.
import { createPostgresStore } from '../../../../services/correspondence/dist/store/postgres.js';
import { createEntryMount } from '../src/mount.mjs';
import { express } from '../src/deps.mjs';
const databaseUrl = process.env.VF10_TEST_DATABASE_URL, schema = process.env.VF10_TEST_SCHEMA;
if (!databaseUrl || !/^vf10_[a-z0-9_]+$/.test(schema)) throw new Error('disposable environment required');
const base = await createPostgresStore(databaseUrl, { schema, poolMax: 1 });
const fault = process.env.VF10_FAULT;
for (const [method, role] of [['createProject', null], ['createGrant', 'writer']]) {
  const original = base[method].bind(base);
  base[method] = async input => {
    const result = await original(input);
    if (fault === method && (!role || input.role === role)) process.exit(77);
    return result;
  };
}
let fixtureDb;
// This deliberately tiny durable receiver proves only the entry port protocol.
// It is NOT IntegrationStore or a competing VF04 implementation.
const receiver = process.env.VF10_RECEIVER === '1' ? {
  id: 'vf10:fixture-receiver',
  async begin({ registrationId, projectId }) {
    await fixtureDb.tx(c => c.query('INSERT INTO vf10_fixture_receiving(id,project_id,calls,state) VALUES($1,$2,1,$3) ON CONFLICT(id) DO UPDATE SET calls=vf10_fixture_receiving.calls+1', [registrationId, projectId, 'pending']));
    if (fault === 'receiver') process.exit(78);
    if (fault === 'receiver_hang') await new Promise(() => {});
    throw new Error('fixture lost acknowledgment');
  },
  async read({ registrationId, projectId }) {
    return fixtureDb.tx(async c => (await c.query('SELECT state FROM vf10_fixture_receiving WHERE id=$1 AND project_id=$2', [registrationId, projectId])).rows[0]?.state ?? 'unknown');
  }
} : null;
const config = { port: 0, adminToken: 'vf10-disposable-administrator-only-fixture', databaseUrl, store: 'postgres', bodyLimitBytes: 32768,
  rateLimitWindowMs: 60000, rateLimitMax: 10000, corsOrigins: [], trustProxyHops: 0, pgSchema: schema, poolMax: 1 };
const mounted = createEntryMount({ enabled: true, databaseUrl, schema, correspondence: base, config, receiver });
fixtureDb = mounted.entry;
await mounted.entry.migrate();
if (receiver) await mounted.entry.tx(c => c.query('CREATE TABLE IF NOT EXISTS vf10_fixture_receiving(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,calls INT NOT NULL,state TEXT NOT NULL)'));
await mounted.entry.install(JSON.parse(process.env.VF10_PROFILE));
if (fault === 'reply') mounted.app.use((req, res, next) => next());
// A response is discarded only AFTER the real adapter finishes its commits.
if (fault === 'reply') {
  const original = mounted.entry.register.bind(mounted.entry);
  mounted.entry.register = async (...args) => { await original(...args); process.exit(79); };
}
let cells;
if (process.env.VF10_WITH_CELLS === '1') {
  const { WorkCellStore, createWorkCellRouter } = await import('../../../../services/correspondence/dist/visitor-work-cells/index.js');
  cells = new WorkCellStore(databaseUrl, { schema, poolMax: 1 }); await cells.migrate();
  mounted.app.use(createWorkCellRouter(cells));
}
const outer = express(); outer.use('/api/correspondence', mounted.app);
const server = outer.listen(Number(process.env.VF10_PORT ?? 0), '127.0.0.1', () => {
  process.send({ baseUrl: `http://127.0.0.1:${server.address().port}/api/correspondence`, pid: process.pid });
});
const sockets = new Set(); let receivedClosed = 0, emittedClosed = 0;
server.on('connection', socket => {
  sockets.add(socket);
  socket.on('close', () => { receivedClosed += socket.bytesRead; emittedClosed += socket.bytesWritten; sockets.delete(socket); });
});
process.on('message', message => {
  if (message === 'metrics') process.send({ metrics: { peakPending: mounted.entry.peakPending, peakActive: mounted.entry.peakActive, peakRegistrationRequests: mounted.entry.peakRequests,
    receivedHttpBytes: receivedClosed + [...sockets].reduce((n, s) => n + s.bytesRead, 0),
    emittedHttpBytes: emittedClosed + [...sockets].reduce((n, s) => n + s.bytesWritten, 0) } });
});
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  server.closeAllConnections(); await new Promise(r => server.close(r));
  await cells?.close(); await mounted.close(); await base.close(); process.exit(0);
}
process.on('SIGTERM', stop); process.on('disconnect', stop);
