import pg from "pg";
import { markClaimed } from "./claim.mjs";
import { WatchError } from "./errors.mjs";

const SCHEMA_RE = /^[a-z][a-z0-9_]{0,62}$/;
const IDENTIFIER = "pilot_correspondence";

function assertSchema(schema) {
  if (schema !== IDENTIFIER || !SCHEMA_RE.test(schema)) {
    throw new WatchError("invalid_config", "managed watch schema must be pilot_correspondence", 503);
  }
}

function table(schema, name) {
  return `"${schema}"."${name}"`;
}

export async function openPgWatchStore({ databaseUrl, schema = IDENTIFIER }) {
  assertSchema(schema);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  // Idle clients emit error when the server drops them. The query promise already rejects.
  pool.on("error", () => {});
  const watchTable = table(schema, "correspondence_l12_managed_watch");
  const grantTable = table(schema, "correspondence_grants");
  await pool.query(`CREATE TABLE IF NOT EXISTS ${watchTable} (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    document JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (project_id, task_id)
  )`);

  async function transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* keep the original error */ }
      if (error instanceof WatchError) throw error;
      const detail = String(error?.message || "watch store write failed").slice(0, 180);
      throw new WatchError("store_unavailable", detail, 503);
    } finally {
      client.release();
    }
  }

  function rowWatch(row) {
    const watch = row.document;
    watch.version = row.version;
    return watch;
  }

  return {
    kind: "postgres",
    schema,
    async findGrant(tokenHash, nowIso) {
      const result = await pool.query(
        `SELECT id, project_id, role, expires_at, revoked_at FROM ${grantTable} WHERE token_hash = $1`,
        [tokenHash],
      );
      const grant = result.rows[0];
      if (!grant || grant.revoked_at) return null;
      if (grant.expires_at && new Date(grant.expires_at).getTime() <= Date.parse(nowIso)) return null;
      return {
        id: grant.id,
        projectId: grant.project_id,
        role: grant.role,
        expiresAt: grant.expires_at ? new Date(grant.expires_at).toISOString() : null,
      };
    },
    async getWatch(projectId, taskId) {
      const result = await pool.query(
        `SELECT version, document FROM ${watchTable} WHERE project_id = $1 AND task_id = $2`,
        [projectId, taskId],
      );
      return result.rows[0] ? rowWatch(result.rows[0]) : null;
    },
    async insertWatch(watch) {
      return transaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO ${watchTable} (project_id, task_id, version, document, updated_at)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           ON CONFLICT DO NOTHING
           RETURNING version`,
          [watch.projectId, watch.taskId, watch.version, JSON.stringify(watch), watch.updatedAt],
        );
        return { ok: inserted.rowCount === 1 };
      });
    },
    async claimDue({ nowIso, workerId, projectId = null, leaseMs }) {
      return transaction(async (client) => {
        const selected = await client.query(
          `SELECT project_id, task_id, version, document
           FROM ${watchTable}
           WHERE ($1::text IS NULL OR project_id = $1)
             AND document->>'status' = 'scheduled'
             AND document->>'nextDueAt' <= $2
           ORDER BY document->>'nextDueAt'
           FOR UPDATE SKIP LOCKED
           LIMIT 1`,
          [projectId, nowIso],
        );
        const row = selected.rows[0];
        if (!row) return null;
        const watch = row.document;
        const action = markClaimed(watch, { nowIso, workerId, leaseMs });
        watch.version = row.version + 1;
        const saved = await client.query(
          `UPDATE ${watchTable}
           SET version = $1, document = $2::jsonb, updated_at = $3
           WHERE project_id = $4 AND task_id = $5 AND version = $6`,
          [watch.version, JSON.stringify(watch), nowIso, row.project_id, row.task_id, row.version],
        );
        if (saved.rowCount !== 1) return null;
        return { action, watch };
      });
    },
    async listRunning() {
      const result = await pool.query(
        `SELECT version, document FROM ${watchTable} WHERE document->>'status' = 'running'`,
      );
      return result.rows.map(rowWatch);
    },
    async compareAndSave(watch, expectedVersion) {
      return transaction(async (client) => {
        const next = structuredClone(watch);
        next.version = expectedVersion + 1;
        const saved = await client.query(
          `UPDATE ${watchTable}
           SET version = $1, document = $2::jsonb, updated_at = $3
           WHERE project_id = $4 AND task_id = $5 AND version = $6
           RETURNING version`,
          [next.version, JSON.stringify(next), next.updatedAt, next.projectId, next.taskId, expectedVersion],
        );
        if (saved.rowCount !== 1) {
          const current = await client.query(
            `SELECT version, document FROM ${watchTable} WHERE project_id = $1 AND task_id = $2`,
            [next.projectId, next.taskId],
          );
          return { ok: false, watch: current.rows[0] ? rowWatch(current.rows[0]) : null };
        }
        return { ok: true, watch: next };
      });
    },
    async nextDueAt(projectId = null) {
      const result = await pool.query(
        `SELECT min(document->>'nextDueAt') AS next_due
         FROM ${watchTable}
         WHERE document->>'status' = 'scheduled'
           AND ($1::text IS NULL OR project_id = $1)`,
        [projectId],
      );
      const value = result.rows[0]?.next_due;
      return value ? Date.parse(value) : null;
    },
    async storageBytes() {
      const result = await pool.query(`SELECT coalesce(sum(pg_column_size(document)), 0)::int AS bytes FROM ${watchTable}`);
      return result.rows[0].bytes;
    },
    async close() {
      await pool.end();
    },
  };
}
