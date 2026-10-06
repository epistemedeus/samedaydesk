// Disposable installer tests only. Production runBounded still drains/discards
// stderr. Copy only a typed code to captured stdout; never forward error prose.
import pg from 'pg';
let disposable = false;
try {
  const url = new URL(process.env.CORRESPONDENCE_DATABASE_URL);
  disposable = url.hostname === '127.0.0.1' && /^\/generation_[a-f0-9]{32}$/.test(url.pathname);
} catch {}
if (!disposable) throw new Error('disposable_database_required');
let failurePhase = null;
const query = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? '';
  const phase = sql.includes('ADD COLUMN IF NOT EXISTS active_profile') ? 'entry_migration'
    : sql.includes('CREATE TABLE IF NOT EXISTS correspondence_vf12_host') ? 'receiver_migration'
    : sql.includes('ALTER TABLE correspondence_vf04') || sql.includes('CREATE TABLE IF NOT EXISTS correspondence_vf04_pools') ? 'integration_migration'
    : sql.includes('CREATE TABLE IF NOT EXISTS correspondence_vf02_work_cells') ? 'cells_migration'
    : sql.includes('CREATE TABLE IF NOT EXISTS correspondence_projects') ? 'base_migration'
    : sql.startsWith('SELECT\n   (SELECT count(*)::int FROM correspondence_vf10_registrations)') ? 'receiving_counts'
    : sql.startsWith('INSERT INTO correspondence_vf10_installation') ? 'original_install'
    : 'other';
  const result = query.apply(this, args);
  if (result?.catch) return result.catch(error => { failurePhase = phase; throw error; });
  return result;
};
const original = console.error;
console.error = (...args) => {
  if (args.length === 1 && typeof args[0] === 'string' && args[0].length <= 256) {
    try {
      const value = JSON.parse(args[0]);
      if (value.ok === false && typeof value.code === 'string'
        && /^(?:[A-Z0-9]{5}|[a-z][a-z0-9_]{0,79})$/.test(value.code)) {
        console.log(JSON.stringify({ fixtureInstallerFailure: value.code, fixturePhase: failurePhase }));
      }
    } catch {}
  }
  original(...args);
};
