#!/usr/bin/env node
// Explicit private maintenance over the existing VF04 generation journal.
import { PostgresStore } from '@neomorphic/correspondence';
import { parseMountedDatabaseUrl, parseMountedPgSchema } from '../../vendor/visitor-foundry-receiver/services/correspondence/dist/config.js';
import { checkInstalledVerification } from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/src/verification.mjs';
import { exact, need } from '../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/entry/src/contract.mjs';
import { openEntryFacade, closeEntryThenBase } from './compose.js';
import { readPrivateJson } from './private-files.js';
import { verifiedFoundryDatabaseUrl } from './pg-tls.js';
import { REUSE_CLASS, reusesProductDataService } from './product-isolation.js';

let base, mounted;
try {
  const mode = process.argv[2];
  need(['--inspect', '--apply'].includes(mode) && process.argv.length === 3, 400, 'generation_arguments_invalid');
  need(!reusesProductDataService(process.env.CORRESPONDENCE_DATABASE_URL, { supabaseUrl: process.env.SUPABASE_URL }), 400, REUSE_CLASS);
  const databaseUrl = verifiedFoundryDatabaseUrl(parseMountedDatabaseUrl(process.env.CORRESPONDENCE_DATABASE_URL));
  const pgSchema = parseMountedPgSchema(process.env.CORRESPONDENCE_PG_SCHEMA);
  base = new PostgresStore(databaseUrl, { schema: pgSchema, poolMax: 1 });
  ({ mounted } = await openEntryFacade({ store: base, config: { databaseUrl, pgSchema,
    adminToken: 'maintenance-does-not-serve', store: 'postgres', bodyLimitBytes: 524288,
    rateLimitWindowMs: 60000, rateLimitMax: 120, corsOrigins: [], trustProxyHops: 0, poolMax: 1, port: 0,
  }, env: process.env }));
  await mounted.receiver.status(); // Stable allocation must already match. No migration/install.
  const store = mounted.extension.integration;
  if (mode === '--inspect') {
    const pools = await store.db.tx(async c => {
      const rows = (await c.query('SELECT project_id,config,verification FROM correspondence_vf04_pools ORDER BY project_id LIMIT 33')).rows;
      need(rows.length <= 32, 409, 'generation_inspection_capacity');
      const result = [];
      for (const row of rows) {
        let current = false;
        try { checkInstalledVerification(row.verification, row.config); current = true; } catch {}
        const candidates = (await c.query('SELECT id,generation FROM correspondence_vf04_candidates WHERE project_id=$1 ORDER BY id LIMIT 17', [row.project_id])).rows;
        need(candidates.length <= 16, 409, 'generation_inspection_capacity');
        const busy = (await c.query(`SELECT count(*)::int AS n FROM (
          SELECT id FROM correspondence_vf04_attempts WHERE project_id=$1 AND state<>'reconciled'
          UNION ALL SELECT task_id FROM correspondence_vf04_invocations WHERE project_id=$1 AND state<>'completed') work`, [row.project_id])).rows[0].n;
        result.push({ projectId: row.project_id, verificationId: row.verification?.id ?? null,
          revision: row.verification?.policy.revision, validityMs: row.verification?.validityMs,
          installedVerificationMatches: current, outstandingPhysical: busy, candidates });
      }
      return result;
    });
    console.log(JSON.stringify({ ok: true, migrated: false, pools }));
  } else {
    const input = readPrivateJson(process.env.FOUNDRY_GENERATION_REQUEST_FILE);
    exact(input, ['projectId', 'expectedVerificationId', 'revision', 'validityMs', 'key', 'candidates']);
    need(typeof input.projectId === 'string' && Array.isArray(input.candidates) && input.candidates.length <= 16, 400, 'generation_request_invalid');
    for (const item of input.candidates) exact(item, ['candidateId', 'expectedGeneration', 'key', 'reason']);
    const { verification } = await store.configureVerification(input.projectId, {
      expectedVerificationId: input.expectedVerificationId, revision: input.revision, validityMs: input.validityMs,
    }, input.key);
    // An exact journal replay is historical; another runtime change cannot turn
    // that old receipt into renewal for the new installation.
    await store.db.tx(async c => {
      const { config, verification: current } = await store.lock(c, input.projectId, false);
      checkInstalledVerification(verification, config);
      need(current?.id === verification.id, 409, 'verification_revision_conflict');
    });
    const candidates = [];
    for (const item of input.candidates) candidates.push(await store.requestRevalidation(input.projectId, {
      candidateId: item.candidateId, expectedGeneration: item.expectedGeneration,
      expectedVerificationId: verification.id, reason: item.reason,
    }, item.key));
    console.log(JSON.stringify({ ok: true, migrated: false, verificationId: verification.id, candidates,
      freshExecutionRequired: candidates.length > 0, published: false }));
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: /^[a-z_]{1,100}$/.test(error?.code) ? error.code : 'generation_failed' }));
  process.exitCode = 2;
} finally {
  if (base) await closeEntryThenBase(mounted, base).catch(() => {});
}
