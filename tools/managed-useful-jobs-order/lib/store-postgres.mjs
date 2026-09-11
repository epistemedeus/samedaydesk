import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { OrderRefuse } from "./errors.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(join(here, "../sql/orders.sql"), "utf8");

function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid SQL identifier ${name}`);
  }
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Isolated order store. Not the I01 earned-work kernel and not a money ledger.
 * Terms hash is the I01-style identity of the bound work.
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
        `SELECT order_id, terms_hash, engine_id, archive_sha256, request_json, result_json, created_at
         FROM managed_useful_jobs_orders WHERE order_id = $1`,
        [orderId],
      );
      if (!rows[0]) return null;
      const row = rows[0];
      return {
        orderId: row.order_id,
        termsHash: row.terms_hash,
        engineId: row.engine_id,
        archiveSha256: row.archive_sha256,
        request: row.request_json,
        result: row.result_json,
        createdAt: row.created_at,
      };
    },
    async put(record) {
      const existing = await this.get(record.orderId);
      if (existing) {
        if (existing.termsHash !== record.termsHash) {
          throw new OrderRefuse(
            "f-order",
            "orderId is immutable; swapped files require a new orderId",
            {
              falsifier: "F-ORDER",
              httpStatus: 409,
              detail: {
                orderId: record.orderId,
                storedTermsHash: existing.termsHash,
                requestedTermsHash: record.termsHash,
              },
            },
          );
        }
        return { replayed: true, record: existing };
      }
      try {
        await client.query(
          `INSERT INTO managed_useful_jobs_orders
            (order_id, terms_hash, engine_id, archive_sha256, request_json, result_json)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
          [
            record.orderId,
            record.termsHash,
            record.engineId,
            record.archiveSha256,
            JSON.stringify(record.request),
            JSON.stringify(record.result),
          ],
        );
      } catch (err) {
        if (err && err.code === "23505") {
          const raced = await this.get(record.orderId);
          if (raced && raced.termsHash !== record.termsHash) {
            throw new OrderRefuse(
              "f-order",
              "orderId is immutable; swapped files require a new orderId",
              { falsifier: "F-ORDER", httpStatus: 409 },
            );
          }
          return { replayed: true, record: raced };
        }
        throw err;
      }
      return { replayed: false, record };
    },
    async close() {
      await client.end();
    },
  };
}
