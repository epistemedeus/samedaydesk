// TEST/DEMO ONLY. Reuses the actual correspondence Express app and PG stores.
import { createApp } from '../../../../services/correspondence/dist/app.js';
import { createPostgresStore } from '../../../../services/correspondence/dist/store/postgres.js';
import { WorkCellStore, createWorkCellRouter } from '../../../../services/correspondence/dist/visitor-work-cells/index.js';
import { ADMIN, databaseUrl, schema, ref } from './helpers.mjs';

if (!databaseUrl || !schema?.startsWith('vf02_')) throw new Error('disposable database/schema required');
const base = await createPostgresStore(databaseUrl, { schema, poolMax: 1 });
const cells = new WorkCellStore(databaseUrl, { schema, poolMax: 2,
  ...(process.env.VF02_FIXTURE_RECEIPTS === '1' ? { resolveReceipt: async (input) => {
    const mode = new URL(input.reference.uri).pathname.slice(1);
    if (mode === 'slow') await new Promise((resolve) => { const t = setTimeout(resolve, 2000); input.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });
    return {
      schema: 'neomorphic.foundry.verification-receipt.v1', id: `vf03:fixture:${mode}`,
      projectId: input.projectId, cellId: input.cellId, submissionId: input.submission.id,
      candidateRevision: mode === 'drift' ? `sha256:${'b'.repeat(64)}` : input.submission.contribution.sourceRevision,
      artifactDigest: input.submission.contribution.artifact.digest,
      executionIdentity: mode === 'self' ? input.submission.grantId : 'verifier:controlled-fixture',
      evaluatorPolicy: ref, environment: 'disposable-postgres-owner-controlled-test',
      independentlyAssigned: true, contributorRelationship: 'owner-controlled',
      outcome: ['rejected', 'deferred'].includes(mode) ? mode : 'accepted',
      limitations: 'Synthetic receipt; does not establish external verification or useful reuse.',
      nextStep: mode === 'deferred' ? 'retry the same admitted receipt after fixture capacity returns' : 'fixture disposition only',
      ...(mode === 'deferred' ? { retryAfterSeconds: 30 } : {}),
    };
  } } : {}),
});
await cells.migrate();
const app = createApp(base, { port: 0, adminToken: ADMIN, databaseUrl, store: 'postgres',
  bodyLimitBytes: 32768, rateLimitWindowMs: 60000, rateLimitMax: 20000,
  corsOrigins: [], trustProxyHops: 0, pgSchema: schema, poolMax: 1 });
app.use(createWorkCellRouter(cells));
const server = app.listen(0, '127.0.0.1', () => {
  process.send?.({ baseUrl: `http://127.0.0.1:${server.address().port}`, pid: process.pid });
});
const lifetime = setTimeout(() => stop(), 180000);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(lifetime);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await Promise.all([base.close(), cells.close()]);
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('disconnect', stop);
