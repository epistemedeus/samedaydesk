/**
 * Published SDS replay-nonce engines. Flush IDs are UUID nonces:
 * first apply, identical replay (already_applied), conflicting replay
 * (pulse_flush_id_conflict). This pack does not fork those rules.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPulseStoreFromTransport } from "../../../../server/lib/pulse-store/supabase-adapter.js";
import { emptyDelta } from "../../../../server/lib/pulse-store/schema.js";
import { createFileFallbackStore } from "../../../../server/lib/pulse-store/file-fallback.js";
import {
  defaultWalState,
  validateWalFlushEntry,
  validateWalState,
} from "../../../../server/lib/pulse-store/wal-schema.js";
import {
  createFakePulseAuthority,
  createFakeRpcTransport,
} from "../../../../server/scripts/helpers/fake-pulse-authority.js";
import { REPO } from "./paths.mjs";

export const PINNED_OBSERVED_FROM = "2026-09-18T12:00:00.000Z";
export const PINNED_CREATED_AT = "2026-09-18T12:00:00.000Z";
export const PINNED_NONCE_A = "a0000000-0000-4000-8000-000000000099";
export const PINNED_NONCE_B = "a0000000-0000-4000-8000-000000000098";
export const SQL_MIGRATION = "supabase/migrations/0002_pulse_durable.sql";

export function makeDelta(overrides = {}) {
  return {
    ...emptyDelta(PINNED_OBSERVED_FROM),
    ...overrides,
  };
}

export function createStore() {
  const authority = createFakePulseAuthority({
    mcpToolCallsObservedFrom: PINNED_OBSERVED_FROM,
    observationStartedAt: PINNED_OBSERVED_FROM,
  });
  const store = createPulseStoreFromTransport(createFakeRpcTransport(authority));
  return { authority, store };
}

export async function applyFlush(store, flushId, delta) {
  try {
    const ack = await store.flush(flushId, delta);
    return {
      ok: true,
      status: ack?.status ?? null,
      flushId: ack?.flushId ?? flushId,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      flushId,
      error: err.code || err.message,
    };
  }
}

export function walEntryOutcome(raw) {
  try {
    const entry = validateWalFlushEntry(raw);
    return { ok: true, flushId: entry.flushId, error: null };
  } catch (err) {
    return { ok: false, flushId: raw?.flushId ?? null, error: String(err.message || err) };
  }
}

export function hydrateWalEntry(entry) {
  return {
    flushId: entry.flushId,
    createdAt: entry.createdAt || PINNED_CREATED_AT,
    delta: makeDelta(entry.delta || {}),
  };
}

export function hydrateWalState(raw) {
  const base = defaultWalState();
  return {
    ...base,
    ...raw,
    pendingFlushes: (raw.pendingFlushes || []).map(hydrateWalEntry),
    observationStartedAt: raw.observationStartedAt ?? PINNED_OBSERVED_FROM,
    mcpToolCallsObservedFrom: raw.mcpToolCallsObservedFrom ?? PINNED_OBSERVED_FROM,
  };
}

export function walStateOutcome(raw) {
  try {
    const state = validateWalState(hydrateWalState(raw));
    return {
      ok: true,
      pendingCount: state.pendingFlushes.length,
      flushIds: state.pendingFlushes.map((row) => row.flushId),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      pendingCount: null,
      flushIds: [],
      error: String(err.message || err),
    };
  }
}

export function withTempWal(fn) {
  const dir = mkdtempSync(join(tmpdir(), "sds-replay-nonce-"));
  const walFile = join(dir, "fallback.json");
  const fallback = createFileFallbackStore(walFile);
  try {
    return fn({ dir, walFile, fallback });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function readPulseSql() {
  return readFileSync(join(REPO, SQL_MIGRATION), "utf8");
}

export function sqlNonceContract(sql = readPulseSql()) {
  return {
    uuidArg: /create or replace function public\.pulse_apply_delta\(p_flush_id uuid, p_delta jsonb\)/.test(sql),
    nullNonce: /if p_flush_id is null then[\s\S]*raise exception 'pulse_invalid_flush_id'/.test(sql),
    conflict: /raise exception 'pulse_flush_id_conflict'/.test(sql),
    alreadyApplied: /'status', 'already_applied'/.test(sql),
    receipts: /create table if not exists public\.pulse_flush_receipts/.test(sql),
    grantUuid: /grant execute on function public\.pulse_apply_delta\(uuid, jsonb\) to service_role/.test(sql),
  };
}

export function naiveReplayAsFresh(acks, snapshotTotal, firstDeltaTotal) {
  const replayed = acks.length > 1;
  return {
    acks: acks.map((status, i) => (i === 0 ? status : "applied")),
    snapshotTotal: replayed ? firstDeltaTotal * acks.length : snapshotTotal,
  };
}

export function naiveConflictAsOk(firstTotal, secondTotal) {
  return {
    acks: ["applied", "applied"],
    snapshotTotal: firstTotal + secondTotal,
    error: null,
  };
}
