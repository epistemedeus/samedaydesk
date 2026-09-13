import { mkdirSync, readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { OrderRefuse } from "./errors.mjs";
import { liveOtherHolder } from "./pid.mjs";
import { DEFAULT_MAX_ADMISSIONS } from "./acquisition-constants.mjs";
import { sameAdmissionIdentity } from "./acquisition-identity.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(join(here, "../sql/orders.sql"), "utf8");
const ACQUISITION_SQL = readFileSync(join(here, "../sql/acquisition.sql"), "utf8");

function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid SQL identifier ${name}`);
  }
  return `"${name.replaceAll('"', '""')}"`;
}

function mapRow(row) {
  if (!row) return null;
  return {
    orderId: row.order_id,
    termsHash: row.terms_hash,
    status: row.status,
    holderPid: row.holder_pid,
    holderToken: row.holder_token,
    executionCount: row.execution_count,
    engineId: row.engine_id,
    archiveSha256: row.archive_sha256,
    request: row.request_json,
    result: row.result_json,
    createdAt: row.created_at,
  };
}

/**
 * Isolated order store. Not the I01 earned-work kernel and not a money ledger.
 * Terms hash is the I01-style identity of the bound work. D01 receipt hashes stay nested.
 */
function acquisitionFromRow(row) {
  if (!row) return null;
  const meta = row.metadata_json;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta;
  return null;
}

function acquisitionParams(record) {
  return [
    record.executionId,
    record.principalId,
    record.requestHash,
    record.requestHashAlgorithm,
    record.requestHashVersion,
    record.managedOrderTermsHash,
    record.managedOrderTermsSchema,
    record.hashesReconciled === true,
    record.jobId,
    record.termsVersion,
    Boolean(record.sample),
    record.receiptSha256,
    record.outputsDigest,
    record.outputs ? JSON.stringify(record.outputs) : null,
    record.state,
    record.createdAt,
    record.expiresAt,
    false,
    false,
    Boolean(record.bytesPurged),
    record.orderId || null,
    JSON.stringify(record),
  ];
}

export async function createPostgresStore({
  connectionString = null,
  clientConfig = null,
  schema = "managed_useful_jobs_order",
  artifactRoot = null,
  maxAdmissions = DEFAULT_MAX_ADMISSIONS,
  statementTimeoutMs = 30_000,
} = {}) {
  const cfg = connectionString ? { connectionString } : { ...clientConfig };
  const boot = new pg.Client(cfg);
  await boot.connect();
  try {
    await boot.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
    await boot.query(`SET search_path TO ${quoteIdent(schema)}`);
    if (Number.isSafeInteger(statementTimeoutMs) && statementTimeoutMs > 0) {
      await boot.query(`SET statement_timeout = ${statementTimeoutMs}`);
    }
    await boot.query(SQL);
    await boot.query(ACQUISITION_SQL);
  } finally {
    await boot.end();
  }

  const pool = new pg.Pool({ ...cfg, max: 8 });
  const als = new AsyncLocalStorage();
  const timeoutSql =
    Number.isSafeInteger(statementTimeoutMs) && statementTimeoutMs > 0
      ? `SET statement_timeout = ${statementTimeoutMs}`
      : null;

  async function prepare(client) {
    if (client.__ha1Prepared) return;
    await client.query(`SET search_path TO ${quoteIdent(schema)}`);
    if (timeoutSql) await client.query(timeoutSql);
    client.__ha1Prepared = true;
  }

  async function withClient(fn) {
    const existing = als.getStore();
    if (existing) return fn(existing);
    const leased = await pool.connect();
    try {
      await prepare(leased);
      return await als.run(leased, () => fn(leased));
    } finally {
      leased.release();
    }
  }

  async function withTx(fn) {
    const existing = als.getStore();
    if (existing?.__ha1InTx) return fn(existing);
    if (existing) {
      await existing.query("BEGIN");
      existing.__ha1InTx = true;
      try {
        const result = await fn(existing);
        await existing.query("COMMIT");
        existing.__ha1InTx = false;
        return result;
      } catch (err) {
        existing.__ha1InTx = false;
        try {
          await existing.query("ROLLBACK");
        } catch {
          /* already rolled back */
        }
        throw err;
      }
    }
    return withClient(async (client) => {
      await client.query("BEGIN");
      client.__ha1InTx = true;
      try {
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* already rolled back */
        }
        throw err;
      } finally {
        client.__ha1InTx = false;
      }
    });
  }

  const cap =
    Number.isSafeInteger(maxAdmissions) && maxAdmissions > 0 ? maxAdmissions : DEFAULT_MAX_ADMISSIONS;
  if (artifactRoot) mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });

  const store = {
    kind: "postgres",
    schema,
    artifactRoot,
    maxAdmissions: cap,
    async get(orderId) {
      const { rows } = await withClient((client) =>
        client.query(
          `SELECT order_id, terms_hash, status, holder_pid, holder_token, execution_count, engine_id,
                archive_sha256, request_json, result_json, created_at
         FROM managed_useful_jobs_orders WHERE order_id = $1`,
          [orderId],
        ),
      );
      return mapRow(rows[0]);
    },
    async reserve(record) {
      try {
        return await withTx(async (client) => {
          const { rows } = await client.query(
            `SELECT order_id, terms_hash, status, holder_pid, holder_token, execution_count, engine_id,
                  archive_sha256, request_json, result_json, created_at
           FROM managed_useful_jobs_orders WHERE order_id = $1 FOR UPDATE`,
            [record.orderId],
          );
          if (!rows[0]) {
            const inserted = await client.query(
              `INSERT INTO managed_useful_jobs_orders
                (order_id, terms_hash, status, holder_pid, holder_token, execution_count, engine_id, archive_sha256, request_json)
               VALUES ($1, $2, 'reserved', $3, $4, 0, $5, $6, $7::jsonb)
               RETURNING order_id, terms_hash, status, holder_pid, holder_token, execution_count, engine_id,
                         archive_sha256, request_json, result_json, created_at`,
              [
                record.orderId,
                record.termsHash,
                process.pid,
                record.holderToken || null,
                record.engineId,
                record.archiveSha256,
                JSON.stringify(record.request),
              ],
            );
            return { kind: "created", record: mapRow(inserted.rows[0]) };
          }
          const existing = mapRow(rows[0]);
          if (existing.termsHash !== record.termsHash) {
            return { kind: "conflict", record: existing };
          }
          if (existing.status === "complete" && existing.result) {
            return { kind: "replay", record: existing };
          }
          if (liveOtherHolder(existing, record)) {
            return { kind: "held", record: existing };
          }
          const adopted = await client.query(
            `UPDATE managed_useful_jobs_orders
           SET holder_pid = $2, holder_token = $3, status = 'reserved', updated_at = NOW()
           WHERE order_id = $1
           RETURNING order_id, terms_hash, status, holder_pid, holder_token, execution_count, engine_id,
                     archive_sha256, request_json, result_json, created_at`,
            [record.orderId, process.pid, record.holderToken || null],
          );
          return { kind: "adopt", record: mapRow(adopted.rows[0]) };
        });
      } catch (err) {
        if (err && err.code === "23505") {
          return store.reserve(record);
        }
        throw err;
      }
    },
    async recordExecution(entry) {
      await withTx(async (client) => {
        await client.query(
          `UPDATE managed_useful_jobs_orders
           SET execution_count = execution_count + 1, updated_at = NOW()
           WHERE order_id = $1`,
          [entry.orderId],
        );
        await client.query(
          `INSERT INTO managed_useful_jobs_executions (order_id, terms_hash, holder_pid)
           VALUES ($1, $2, $3)`,
          [entry.orderId, entry.termsHash, process.pid],
        );
      });
    },
    async complete(orderId, result) {
      const { rows } = await withClient((client) =>
        client.query(
          `UPDATE managed_useful_jobs_orders
         SET status = 'complete', result_json = $2::jsonb, holder_pid = $3, updated_at = NOW()
         WHERE order_id = $1
         RETURNING order_id, terms_hash, status, holder_pid, holder_token, execution_count, engine_id,
                   archive_sha256, request_json, result_json, created_at`,
          [orderId, JSON.stringify(result), process.pid],
        ),
      );
      if (!rows[0]) {
        throw new OrderRefuse("missing-reservation", `cannot complete missing order ${orderId}`);
      }
      return mapRow(rows[0]);
    },
    async listExecutions(orderId = null) {
      const { rows } = orderId
        ? await withClient((client) =>
            client.query(
              `SELECT order_id, terms_hash, holder_pid, created_at
             FROM managed_useful_jobs_executions WHERE order_id = $1 ORDER BY id`,
              [orderId],
            ),
          )
        : await withClient((client) =>
            client.query(
              `SELECT order_id, terms_hash, holder_pid, created_at
             FROM managed_useful_jobs_executions ORDER BY id`,
            ),
          );
      return rows.map((row) => ({
        orderId: row.order_id,
        termsHash: row.terms_hash,
        holderPid: row.holder_pid,
        at: row.created_at,
      }));
    },
    async put(record) {
      const outcome = await store.reserve(record);
      if (outcome.kind === "conflict") {
        throw new OrderRefuse(
          "f-order",
          "orderId is immutable; swapped files require a new orderId",
          {
            falsifier: "F-ORDER",
            httpStatus: 409,
            detail: {
              orderId: record.orderId,
              storedTermsHash: outcome.record.termsHash,
              requestedTermsHash: record.termsHash,
            },
          },
        );
      }
      if (outcome.kind === "replay") {
        return { replayed: true, record: outcome.record };
      }
      if (record.result) {
        await store.complete(record.orderId, record.result);
      }
      return { replayed: false, record };
    },
    async close() {
      await pool.end();
    },
    async getAcquisition(executionId) {
      const { rows } = await withClient((client) =>
        client.query(`SELECT metadata_json FROM managed_useful_jobs_acquisitions WHERE execution_id = $1`, [
          executionId,
        ]),
      );
      return acquisitionFromRow(rows[0]);
    },
    async countAdmissions() {
      const { rows } = await withClient((client) =>
        client.query(`SELECT COUNT(*)::int AS n FROM managed_useful_jobs_acquisitions`),
      );
      return rows[0]?.n || 0;
    },
    async withAcquisitionLock(executionId, fn) {
      return withTx(async (client) => {
        await client.query(
          `SELECT execution_id FROM managed_useful_jobs_acquisitions WHERE execution_id = $1 FOR UPDATE`,
          [executionId],
        );
        return fn();
      });
    },
    async saveAcquisitionUnlocked(record) {
      await withClient((client) =>
        client.query(
          `UPDATE managed_useful_jobs_acquisitions SET
           principal_id = $2,
           request_hash = $3,
           request_hash_algorithm = $4,
           request_hash_version = $5,
           managed_order_terms_hash = $6,
           managed_order_terms_schema = $7,
           hashes_reconciled = $8,
           job_id = $9,
           terms_version = $10,
           sample = $11,
           receipt_sha256 = $12,
           outputs_digest = $13,
           outputs_json = $14::jsonb,
           state = $15,
           created_at = $16::timestamptz,
           expires_at = $17::timestamptz,
           purchase_authority = $18,
           sold = $19,
           bytes_purged = $20,
           order_id = $21,
           metadata_json = $22::jsonb,
           updated_at = NOW()
         WHERE execution_id = $1`,
          acquisitionParams(record),
        ),
      );
      return record;
    },
    async admitAcquisition(record, { maxAdmissions: limit } = {}) {
      const capNow = Number.isSafeInteger(limit) && limit > 0 ? limit : store.maxAdmissions;
      try {
        return await withTx(async (client) => {
          await client.query("LOCK TABLE managed_useful_jobs_acquisitions IN SHARE ROW EXCLUSIVE MODE");
          const existing = await client.query(
            `SELECT metadata_json FROM managed_useful_jobs_acquisitions WHERE execution_id = $1`,
            [record.executionId],
          );
          if (existing.rows[0]) {
            const rec = acquisitionFromRow(existing.rows[0]);
            if (sameAdmissionIdentity(rec, record)) return { kind: "identical", record: rec };
            return { kind: "conflict", record: rec };
          }
          const counted = await client.query(
            `SELECT COUNT(*)::int AS n FROM managed_useful_jobs_acquisitions`,
          );
          if ((counted.rows[0]?.n || 0) >= capNow) {
            return { kind: "capacity" };
          }
          await client.query(
            `INSERT INTO managed_useful_jobs_acquisitions (
             execution_id, principal_id, request_hash, request_hash_algorithm, request_hash_version,
             managed_order_terms_hash, managed_order_terms_schema, hashes_reconciled,
             job_id, terms_version, sample, receipt_sha256, outputs_digest, outputs_json,
             state, created_at, expires_at, purchase_authority, sold, bytes_purged, order_id, metadata_json
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb,
             $15, $16::timestamptz, $17::timestamptz, $18, $19, $20, $21, $22::jsonb
           )`,
            acquisitionParams(record),
          );
          return { kind: "created", record };
        });
      } catch (err) {
        if (err && err.code === "23505") {
          return store.admitAcquisition(record, { maxAdmissions: capNow });
        }
        throw err;
      }
    },
    async withLeasedClient(fn) {
      return withClient(fn);
    },
  };
  return store;
}
