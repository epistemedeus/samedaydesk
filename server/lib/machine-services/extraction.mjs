import pg from 'pg';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readPrivateJson } from '../../vendor/machine-gateway/src/config.mjs';
import { ExtractionService } from '../../vendor/url-extract/experiments/ae19-paid-continuation/extraction-contract/service.mjs';
import { SCHEMA, migrate } from '../../vendor/url-extract/experiments/ae19-paid-continuation/extraction-contract/store.mjs';
import { installedDatabaseUrl } from './postgres.mjs';

// AE21 U2: private binding for the vendored gateway url.extract.* routes.
// Binding file (0600 JSON, or MACHINE_GATEWAY_URL_EXTRACT_JSON materialized by
// private-config.mjs): {"schema":"ae19_paid_continuation","tenantId":"...","actorId":"..."}.
// - Storage is the SAME enrolled async Postgres as the gateway/monitor stores
//   (installedDatabaseUrl: verify-full TLS); there is no SQLite path.
// - Serving never migrates: the extraction schema is provisioned by install.mjs.
// - The merchant kernel root is the vendored directory, never a caller path.
// - The vendored service hard-codes its schema, so the binding must name it.
export const EXTRACTION_SCHEMA = SCHEMA;
export const EXTRACTION_TABLES = Object.freeze(['extraction_job', 'extraction_idem', 'tenant_delivery',
  'source_occurrence', 'later_need', 'capture_verdict']);
const MERCHANT_ROOT = fileURLToPath(new URL('../../vendor/url-extract/', import.meta.url));
const KEYS = new Set(['schema', 'tenantId', 'actorId']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;
const code = value => Object.assign(new Error(value), { code: value });

export function extractionBindingConfigured(env) {
  return !!(env.MACHINE_GATEWAY_URL_EXTRACT_FILE || env.MACHINE_GATEWAY_URL_EXTRACT_JSON);
}

export function readExtractionBinding(env) {
  const file = env.MACHINE_GATEWAY_URL_EXTRACT_FILE;
  if (!file) throw code(env.MACHINE_GATEWAY_URL_EXTRACT_JSON ? 'url_extract_binding_unmaterialized' : 'url_extract_binding_missing');
  if (!existsSync(file)) throw code('url_extract_binding_missing');
  let config;
  try { config = readPrivateJson(file); } catch { throw code('invalid_url_extract_binding'); }
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(key => !KEYS.has(key)) ||
      typeof config.tenantId !== 'string' || typeof config.actorId !== 'string' ||
      !ID.test(config.tenantId) || !ID.test(config.actorId)) throw code('invalid_url_extract_binding');
  if ((config.schema ?? SCHEMA) !== SCHEMA) throw code('invalid_url_extract_binding');
  return { schema: SCHEMA, tenantId: config.tenantId, actorId: config.actorId };
}

// One bounded pool per gateway store, with the same timeouts as PgPort.
export function openExtractionPool(env) {
  const pool = new pg.Pool({ connectionString: installedDatabaseUrl(env), max: 2,
    connectionTimeoutMillis: 3000, statement_timeout: 5000, query_timeout: 6000,
    idle_in_transaction_session_timeout: 8000, lock_timeout: 2000, idleTimeoutMillis: 1000, allowExitOnIdle: true,
    options: `-c search_path=${SCHEMA},pg_catalog` });
  pool.on('error', () => {}); // surfaced through bounded query promises only
  return pool;
}

export async function checkExtractionReady(pool) {
  const { rows } = await pool.query('SELECT count(*)::int n FROM information_schema.tables WHERE table_schema=$1 AND table_name=ANY($2)',
    [SCHEMA, EXTRACTION_TABLES]);
  if (rows[0].n !== EXTRACTION_TABLES.length) throw code('url_extract_schema_absent');
}

// Provisioning only (install.mjs migrate). Additive; never called by serving.
export async function migrateExtraction(env) {
  const pool = openExtractionPool(env);
  try { await migrate(pool); await checkExtractionReady(pool); } finally { await pool.end(); }
}
export async function inspectExtraction(env) {
  const pool = openExtractionPool(env);
  try { await checkExtractionReady(pool); } finally { await pool.end(); }
}

const ENDED = new Set(['Cannot use a pool after calling end on the pool', 'Client was closed and is not queryable']);

export async function openExtractionService(env, { extract } = {}) {
  const binding = readExtractionBinding(env);
  const pool = openExtractionPool(env);
  let closed = false;
  try {
    await checkExtractionReady(pool);
  } catch (error) {
    try { await pool.end(); } catch { /* keep the classification */ }
    throw error;
  }
  // Calls after close (or after the pool ended underneath) fail with one named
  // error instead of a pg diagnostic or a hung pump.
  const fenced = fn => async (...args) => {
    if (closed) throw code('url_extract_store_closed');
    try { return await fn(...args); } catch (error) {
      if (closed || ENDED.has(error?.message)) throw code('url_extract_store_closed');
      throw error;
    }
  };
  const fencedPool = { query: fenced((...args) => pool.query(...args)), connect: fenced(() => pool.connect()) };
  const inner = new ExtractionService({ pool: fencedPool, merchantRoot: MERCHANT_ROOT, ...(extract ? { extract } : {}) });
  const service = {
    pool: fencedPool,
    submit: fenced(input => inner.submit(input)),
    read: fenced(input => inner.read(input)),
    pump: fenced(input => inner.pump(input)),
    recover: fenced(() => inner.recover()),
  };
  return {
    service, schema: binding.schema, tenantId: binding.tenantId, actorId: binding.actorId,
    get closed() { return closed; },
    async close() {
      if (closed) return; closed = true;
      try { await inner.pumping?.catch(() => {}); } finally { await pool.end(); }
    },
  };
}
