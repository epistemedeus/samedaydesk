import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { verifiedFoundryDatabaseUrl } from '../../foundry/pg-tls.js';

export const SCHEMAS = Object.freeze({ gateway: 'pilot_gateway', monitor: 'pilot_monitor' });
const identities = Object.freeze({ gateway: 'sds.machine-gateway.pg.v1', monitor: 'sds.continuous-monitoring.pg.v1' });
const code = value => Object.assign(new Error(value), { code: value });

// Only the already enrolled correspondence DB is selected. Keep its CA policy,
// require hostname verification, and never fall back to a product DB or disk.
export function installedDatabaseUrl(env = process.env) {
  const raw = env.MACHINE_SERVICES_DATABASE_URL || env.CORRESPONDENCE_DATABASE_URL;
  let url;
  try { url = new URL(raw); } catch { throw code('machine_database_unconfigured'); }
  // An optional TLS-specific binding can strengthen this pool's URL without
  // editing correspondence's environment. It must use the same enrolled DB/principal.
  if (env.MACHINE_SERVICES_DATABASE_URL) {
    let enrolled;
    try { enrolled = new URL(env.CORRESPONDENCE_DATABASE_URL); } catch { throw code('machine_database_unconfigured'); }
    if (url.hostname !== enrolled.hostname || (url.port || '5432') !== (enrolled.port || '5432') ||
        url.pathname !== enrolled.pathname || url.username !== enrolled.username) throw code('machine_database_binding_refused');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || isIP(url.hostname.replace(/^\[|\]$/g, '')) || url.pathname.length < 2 || url.hash ||
      url.searchParams.getAll('sslmode').length !== 1 || url.searchParams.get('sslmode') !== 'verify-full' ||
      [...url.searchParams.keys()].some(key => !['sslmode', 'sslrootcert', 'application_name'].includes(key)) ||
      url.searchParams.getAll('sslrootcert').length > 1 ||
      env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw code('machine_database_verify_full_required');
  }
  return verifiedFoundryDatabaseUrl(raw, { ...env,
    CORRESPONDENCE_PGSSL_CA_FILE: env.MACHINE_SERVICES_PGSSL_CA_FILE || env.CORRESPONDENCE_PGSSL_CA_FILE });
}

function safeInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw code('store_integer_overflow');
  return number;
}

// The two pinned SQLite ports use a small common SQL subset. The adapter only
// maps placeholders, conflict syntax and byte-count/scalar-max expressions.
function sql(text) {
  let i = 0;
  const ignored = /^INSERT OR IGNORE /i.test(text);
  text = text.replace(/^INSERT OR IGNORE /i, 'INSERT ')
    .replace(/length\(CAST\(document AS BLOB\)\)/g, "octet_length(document)")
    .replace(/event_floor=max\(event_floor,/g, 'event_floor=greatest(event_floor,')
    .replace(/\?/g, () => '$' + ++i);
  return ignored ? text + ' ON CONFLICT DO NOTHING' : text;
}

export class PgPort {
  constructor({ databaseUrl, service }) {
    if (!Object.hasOwn(SCHEMAS, service)) throw code('machine_schema_refused');
    this.service = service; this.schema = SCHEMAS[service]; this.context = new AsyncLocalStorage();
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 2,
      connectionTimeoutMillis: 3000, statement_timeout: 5000, query_timeout: 6000,
      idle_in_transaction_session_timeout: 8000, lock_timeout: 2000,
      idleTimeoutMillis: 1000, allowExitOnIdle: true,
      options: `-c search_path=${this.schema},pg_catalog`,
      types: { getTypeParser: (oid, format) => [20, 1700].includes(oid) ? safeInteger : pg.types.getTypeParser(oid, format) },
    });
    this.pool.on('error', () => {}); // errors surface through bounded query promises, never connection strings
  }
  query(text, args = []) { return (this.context.getStore() || this.pool).query(text, args); }
  async one(text, ...args) { return (await this.query(sql(text), args)).rows[0]; }
  async all(text, ...args) { return (await this.query(sql(text), args)).rows; }
  async write(text, ...args) { return this.tx(async () => ({ changes: (await this.query(sql(text), args)).rowCount })); }
  async tx(fn) {
    if (this.context.getStore()) return fn();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Host capacities, credential identities and source cooldowns are shared
      // across tenants. A short transaction lock also fences concurrent owners.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1), 243001)', [this.schema]);
      const result = await this.context.run(client, fn);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* retain the first failure */ }
      throw error;
    } finally { client.release(); }
  }
  async checkReady() {
    const row = await this.one('SELECT identity,version FROM schema_identity WHERE singleton=1');
    if (row?.identity !== identities[this.service] || row.version !== 1) throw code('machine_schema_version_refused');
    const tables = this.service === 'gateway' ? ['quotes', 'usage', 'attempts', 'credentials']
      : ['tenants', 'credentials', 'monitors', 'runs', 'run_outputs', 'snapshots', 'events', 'deliveries', 'delivery_attempts', 'source_gates'];
    const present = await this.query('SELECT count(*) n FROM information_schema.tables WHERE table_schema=$1 AND table_name=ANY($2)', [this.schema, tables]);
    if (present.rows[0].n !== tables.length) throw code('machine_schema_incomplete');
  }
  async migrate() {
    const migration = await readFile(new URL(`./deploy/${this.service}-001.sql`, import.meta.url), 'utf8');
    await this.tx(async () => {
      const present = await this.one('SELECT count(*) n FROM information_schema.tables WHERE table_schema=?', this.schema);
      if (present.n) await this.checkReady(); // refuse a foreign/unsupported schema before DDL
      await this.query(migration);
      await this.checkReady();
    });
  }
  close() { return this.pool.end(); }
}
