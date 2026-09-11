import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { OrderRefuse } from "./errors.mjs";
import { liveOtherHolder } from "./pid.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(join(here, "../sql/orders.sql"), "utf8");

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
export async function createPostgresStore({
  connectionString = null,
  clientConfig = null,
  schema = "managed_useful_jobs_order",
} = {}) {
  const client = new pg.Client(connectionString ? { connectionString } : clientConfig);
  await client.connect();
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
  await client.query(`SET search_path TO ${quoteIdent(schema)}`);
  await client.query(SQL);

  return {
    kind: "postgres",
    schema,
    async get(orderId) {
      const { rows } = await client.query(
        `SELECT order_id, terms_hash, status, holder_pid, holder_token, execution_count, engine_id,
                archive_sha256, request_json, result_json, created_at
         FROM managed_useful_jobs_orders WHERE order_id = $1`,
        [orderId],
      );
      return mapRow(rows[0]);
    },
    async reserve(record) {
      await client.query("BEGIN");
      try {
        const { rows } = await client.query(
          `SELECT order_id, terms_hash, status, holder_pid, holder_token, execution_count, engine_id,
                  archive_sha256, request_json, result_json, created_at
           FROM managed_useful_jobs_orders WHERE order_id = $1 FOR UPDATE`,
          [record.orderId],
        );
        if (!rows[0]) {
          try {
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
            await client.query("COMMIT");
            return { kind: "created", record: mapRow(inserted.rows[0]) };
          } catch (err) {
            if (err && err.code === "23505") {
              await client.query("ROLLBACK");
              return this.reserve(record);
            }
            throw err;
          }
        }
        const existing = mapRow(rows[0]);
        if (existing.termsHash !== record.termsHash) {
          await client.query("COMMIT");
          return { kind: "conflict", record: existing };
        }
        if (existing.status === "complete" && existing.result) {
          await client.query("COMMIT");
          return { kind: "replay", record: existing };
        }
        if (liveOtherHolder(existing, record)) {
          await client.query("COMMIT");
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
        await client.query("COMMIT");
        return { kind: "adopt", record: mapRow(adopted.rows[0]) };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* already rolled back */
        }
        throw err;
      }
    },
    async recordExecution(entry) {
      await client.query("BEGIN");
      try {
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
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    },
    async complete(orderId, result) {
      const { rows } = await client.query(
        `UPDATE managed_useful_jobs_orders
         SET status = 'complete', result_json = $2::jsonb, holder_pid = $3, updated_at = NOW()
         WHERE order_id = $1
         RETURNING order_id, terms_hash, status, holder_pid, holder_token, execution_count, engine_id,
                   archive_sha256, request_json, result_json, created_at`,
        [orderId, JSON.stringify(result), process.pid],
      );
      if (!rows[0]) {
        throw new OrderRefuse("missing-reservation", `cannot complete missing order ${orderId}`);
      }
      return mapRow(rows[0]);
    },
    async listExecutions(orderId = null) {
      const { rows } = orderId
        ? await client.query(
            `SELECT order_id, terms_hash, holder_pid, created_at
             FROM managed_useful_jobs_executions WHERE order_id = $1 ORDER BY id`,
            [orderId],
          )
        : await client.query(
            `SELECT order_id, terms_hash, holder_pid, created_at
             FROM managed_useful_jobs_executions ORDER BY id`,
          );
      return rows.map((row) => ({
        orderId: row.order_id,
        termsHash: row.terms_hash,
        holderPid: row.holder_pid,
        at: row.created_at,
      }));
    },
    async put(record) {
      const outcome = await this.reserve(record);
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
        await this.complete(record.orderId, record.result);
      }
      return { replayed: false, record };
    },
    async close() {
      await client.end();
    },
  };
}
