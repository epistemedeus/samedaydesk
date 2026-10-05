import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { refuse } from "./errors.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(join(here, "../sql/001_outbox.sql"), "utf8");

function rowToEvent(eventRow, attempts) {
  return {
    eventId: eventRow.event_id,
    bodyHash: eventRow.body_hash,
    termsHash: eventRow.terms_hash,
    termsVersion: eventRow.terms_version,
    deliveryState: eventRow.delivery_state,
    sample: eventRow.sample,
    sold: eventRow.sold,
    buyerAccepted: eventRow.buyer_accepted,
    sale: eventRow.sale,
    callbackAcknowledged: eventRow.callback_acknowledged,
    callbackUrl: eventRow.callback_url,
    payload: eventRow.payload,
    createdAt: toIso(eventRow.created_at),
    updatedAt: toIso(eventRow.updated_at),
    attempts: attempts.map((a) => ({
      attemptId: a.attempt_id,
      recordedAt: toIso(a.recorded_at),
      completedAt: a.completed_at ? toIso(a.completed_at) : null,
      outcome: a.outcome,
      httpStatus: a.http_status,
      ack: a.ack,
      error: a.error,
    })),
  };
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export async function createPostgresStore({ connectionString, client: existing, config } = {}) {
  let Client;
  try {
    const mod = await import("pg");
    Client = mod.default?.Client || mod.Client;
  } catch (err) {
    refuse("postgres-driver-missing", "The pg driver is not installed in this module (npm install inside tools/job-delivery-outbox)", {
      error: err.message,
    });
  }

  const client = existing || new Client(config || { connectionString });
  const ownsClient = !existing;

  async function loadEvent(eventId) {
    const eventRes = await client.query(
      "SELECT * FROM job_delivery_outbox_events WHERE event_id = $1",
      [eventId],
    );
    if (!eventRes.rowCount) return null;
    const attempts = await client.query(
      "SELECT * FROM job_delivery_outbox_attempts WHERE event_id = $1 ORDER BY recorded_at ASC",
      [eventId],
    );
    return rowToEvent(eventRes.rows[0], attempts.rows);
  }

  return {
    kind: "postgres",
    async init() {
      if (ownsClient) await client.connect();
      await client.query(MIGRATION_SQL);
    },
    async close() {
      if (ownsClient) await client.end();
    },
    async get(eventId) {
      return loadEvent(eventId);
    },
    async list() {
      const events = await client.query(
        "SELECT * FROM job_delivery_outbox_events ORDER BY created_at ASC",
      );
      const out = [];
      for (const row of events.rows) {
        const attempts = await client.query(
          "SELECT * FROM job_delivery_outbox_attempts WHERE event_id = $1 ORDER BY recorded_at ASC",
          [row.event_id],
        );
        out.push(rowToEvent(row, attempts.rows));
      }
      return out;
    },
    async putNew(event) {
      const existing = await loadEvent(event.eventId);
      if (existing) {
        if (existing.bodyHash === event.bodyHash) {
          return { event: existing, duplicate: true };
        }
        refuse("event-id-body-conflict", "Body change under the same event ID is rejected", {
          eventId: event.eventId,
        });
      }
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO job_delivery_outbox_events (
            event_id, body_hash, terms_hash, terms_version, delivery_state, sample,
            sold, buyer_accepted, sale, callback_acknowledged, callback_url, payload, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,FALSE,FALSE,FALSE,FALSE,$7,$8,$9,$10)`,
          [
            event.eventId,
            event.bodyHash,
            event.termsHash,
            event.termsVersion,
            event.deliveryState,
            event.sample,
            event.callbackUrl,
            event.payload,
            event.createdAt,
            event.updatedAt,
          ],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      return { event, duplicate: false };
    },
    async recordAttempt({ eventId, attempt }) {
      await client.query("BEGIN");
      try {
        const current = await client.query(
          "SELECT delivery_state FROM job_delivery_outbox_events WHERE event_id = $1 FOR UPDATE",
          [eventId],
        );
        if (!current.rowCount) refuse("event-not-found", "Unknown eventId", { eventId });
        const state = current.rows[0].delivery_state;
        if (state !== "queued") {
          refuse("event-not-queued", `Cannot attempt delivery from state ${state}`, {
            eventId,
            deliveryState: state,
          });
        }
        await client.query(
          `UPDATE job_delivery_outbox_events
           SET delivery_state = 'unknown', updated_at = $2
           WHERE event_id = $1`,
          [eventId, attempt.recordedAt],
        );
        await client.query(
          `INSERT INTO job_delivery_outbox_attempts (
            attempt_id, event_id, recorded_at, outcome, http_status, ack, error
          ) VALUES ($1,$2,$3,'unknown',NULL,NULL,NULL)`,
          [attempt.attemptId, eventId, attempt.recordedAt],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      return loadEvent(eventId);
    },
    async completeAttempt({ eventId, attemptId, outcome, httpStatus, ack, error }) {
      await client.query("BEGIN");
      try {
        const attemptRes = await client.query(
          "SELECT outcome FROM job_delivery_outbox_attempts WHERE attempt_id = $1 FOR UPDATE",
          [attemptId],
        );
        if (!attemptRes.rowCount) refuse("attempt-not-found", "Unknown attemptId", { attemptId });
        if (attemptRes.rows[0].outcome !== "unknown") {
          await client.query("ROLLBACK");
          return loadEvent(eventId);
        }
        const completedAt = new Date().toISOString();
        await client.query(
          `UPDATE job_delivery_outbox_attempts
           SET outcome = $2, http_status = $3, ack = $4, error = $5, completed_at = $6
           WHERE attempt_id = $1`,
          [attemptId, outcome, httpStatus ?? null, ack, error ?? null, completedAt],
        );
        await client.query(
          `UPDATE job_delivery_outbox_events
           SET delivery_state = $2,
               callback_acknowledged = $3,
               buyer_accepted = FALSE,
               sale = FALSE,
               sold = FALSE,
               updated_at = $4
           WHERE event_id = $1`,
          [eventId, outcome, outcome === "delivered", completedAt],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      return loadEvent(eventId);
    },
  };
}
