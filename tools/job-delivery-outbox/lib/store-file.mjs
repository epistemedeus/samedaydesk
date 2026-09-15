import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STORE_SCHEMA } from "./pins.mjs";
import { atomicWriteJson } from "./atomic-write.mjs";
import { withFileLock } from "./file-lock.mjs";
import { refuse } from "./errors.mjs";

function emptyState() {
  return { schema: STORE_SCHEMA, events: {} };
}

export function createFileStore(storeDir) {
  if (!storeDir) refuse("store-required", "--store directory is required");
  mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  const filePath = join(storeDir, "outbox.json");
  const lockPath = join(storeDir, "outbox.json.lock");

  function readState() {
    if (!existsSync(filePath)) return emptyState();
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (parsed.schema !== STORE_SCHEMA) {
      refuse("store-schema", "Existing store is not a job-delivery-outbox store");
    }
    if (!parsed.events || typeof parsed.events !== "object") {
      refuse("store-corrupt", "Store events map is missing");
    }
    return parsed;
  }

  function writeState(state) {
    atomicWriteJson(filePath, state);
  }

  function withTxn(mutator) {
    return withFileLock(lockPath, () => {
      const state = readState();
      const result = mutator(state);
      if (result.write) writeState(state);
      return result.value;
    });
  }

  return {
    kind: "file",
    path: filePath,
    async init() {
      if (!existsSync(filePath)) writeState(emptyState());
    },
    async close() {
      /* file store has no handle */
    },
    async get(eventId) {
      const state = readState();
      return state.events[eventId] || null;
    },
    async list() {
      const state = readState();
      return Object.values(state.events).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async putNew(event) {
      return withTxn((state) => {
        const existing = state.events[event.eventId];
        if (existing) {
          if (existing.bodyHash === event.bodyHash) {
            return { write: false, value: { event: existing, duplicate: true } };
          }
          refuse("event-id-body-conflict", "Body change under the same event ID is rejected", {
            eventId: event.eventId,
          });
        }
        state.events[event.eventId] = event;
        return { write: true, value: { event, duplicate: false } };
      });
    },
    async recordAttempt({ eventId, attempt }) {
      return withTxn((state) => {
        const event = state.events[eventId];
        if (!event) refuse("event-not-found", "Unknown eventId", { eventId });
        if (event.deliveryState !== "queued") {
          refuse("event-not-queued", `Cannot attempt delivery from state ${event.deliveryState}`, {
            eventId,
            deliveryState: event.deliveryState,
          });
        }
        event.deliveryState = "unknown";
        event.attempts = [...(event.attempts || []), attempt];
        event.updatedAt = attempt.recordedAt;
        return { write: true, value: event };
      });
    },
    async completeAttempt({ eventId, attemptId, outcome, httpStatus, ack, error }) {
      return withTxn((state) => {
        const event = state.events[eventId];
        if (!event) refuse("event-not-found", "Unknown eventId", { eventId });
        const attempt = (event.attempts || []).find((a) => a.attemptId === attemptId);
        if (!attempt) refuse("attempt-not-found", "Unknown attemptId", { attemptId });
        if (attempt.outcome !== "unknown") {
          return { write: false, value: event };
        }
        attempt.outcome = outcome;
        attempt.httpStatus = httpStatus ?? null;
        attempt.ack = ack ?? null;
        attempt.error = error ?? null;
        attempt.completedAt = new Date().toISOString();
        event.deliveryState = outcome;
        if (outcome === "delivered") {
          event.callbackAcknowledged = true;
          event.buyerAccepted = false;
          event.sale = false;
          event.sold = false;
        }
        event.updatedAt = attempt.completedAt;
        return { write: true, value: event };
      });
    },
  };
}
