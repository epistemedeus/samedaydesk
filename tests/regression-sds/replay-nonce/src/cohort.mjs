import { join } from "node:path";
import {
  ENGINE_AUTHORITY,
  ENGINE_FALLBACK,
  ENGINE_SQL,
  ENGINE_STORE,
  ENGINE_WAL,
  FIXTURES,
  fixture,
  readJson,
} from "./paths.mjs";
import {
  PINNED_CREATED_AT,
  PINNED_NONCE_A,
  applyFlush,
  createStore,
  hydrateWalEntry,
  makeDelta,
  readPulseSql,
  sqlNonceContract,
  walEntryOutcome,
  walStateOutcome,
  withTempWal,
} from "./engine.mjs";

export const SCHEMA = "sds.regression.replay-nonce.v1";

export function loadManifest() {
  return readJson(join(FIXTURES, "manifest.json"));
}

function checkExpect(actual, expected, errors, prefix) {
  if (expected === undefined) return;
  if (actual !== expected) {
    errors.push(`${prefix}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function checkDeep(actual, expected, errors, prefix) {
  if (expected === undefined) return;
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    errors.push(`${prefix}: expected ${right}, got ${left}`);
  }
}

async function runStoreCase(entry) {
  const { store } = createStore();
  const errors = [];
  const acks = [];
  const stepErrors = [];
  for (const step of entry.steps || []) {
    const flushId = step.flushId || entry.flushId || PINNED_NONCE_A;
    const delta = makeDelta(step.delta || {});
    const result = await applyFlush(store, flushId, delta);
    acks.push(result.status);
    stepErrors.push(result.error);
    if (step.expectError) {
      checkExpect(result.error, step.expectError, errors, `step ${flushId} error`);
    } else if (step.expectStatus) {
      checkExpect(result.status, step.expectStatus, errors, `step ${flushId} status`);
    }
  }
  const snapshot = await store.readSnapshot(PINNED_CREATED_AT);
  const expect = entry.expect || {};
  checkDeep(acks, expect.acks, errors, "acks");
  checkExpect(snapshot.total, expect.snapshotTotal, errors, "snapshotTotal");
  if (expect.errors) checkDeep(stepErrors, expect.errors, errors, "errors");
  if (expect.error === null) {
    const unexpected = stepErrors.filter((code, i) => code && !(entry.steps?.[i]?.expectError));
    if (unexpected.length) errors.push(`unexpected errors: ${unexpected.join(",")}`);
  }
  return {
    acks,
    stepErrors,
    snapshotTotal: snapshot.total,
    snapshotHumans: snapshot.humans,
    caseErrors: errors,
  };
}

function runWalEntryCase(entry) {
  const raw = {
    flushId: Object.prototype.hasOwnProperty.call(entry, "flushId") ? entry.flushId : PINNED_NONCE_A,
    createdAt: entry.createdAt || PINNED_CREATED_AT,
    delta: entry.omitDelta ? undefined : makeDelta(entry.delta || { total: 1, humans: 1 }),
  };
  if (entry.omitFlushId) delete raw.flushId;
  if (entry.extraKeys) Object.assign(raw, entry.extraKeys);
  const outcome = walEntryOutcome(raw);
  const errors = [];
  const expect = entry.expect || {};
  checkExpect(outcome.ok, expect.ok, errors, "ok");
  checkExpect(outcome.error, expect.error ?? null, errors, "error");
  return { ...outcome, caseErrors: errors };
}

function runWalStateCase(entry) {
  const outcome = walStateOutcome({
    pendingFlushes: entry.pendingFlushes || [],
    lastSuccessfulFlush: entry.lastSuccessfulFlush ?? null,
  });
  const errors = [];
  const expect = entry.expect || {};
  checkExpect(outcome.ok, expect.ok, errors, "ok");
  checkExpect(outcome.error, expect.error ?? null, errors, "error");
  if (expect.pendingCount !== undefined) {
    checkExpect(outcome.pendingCount, expect.pendingCount, errors, "pendingCount");
  }
  return { ...outcome, caseErrors: errors };
}

function runFallbackCase(entry) {
  return withTempWal(({ fallback }) => {
    const errors = [];
    const outcomes = [];
    for (const step of entry.steps || []) {
      if (step.action === "enqueue") {
        const result = fallback.enqueuePendingFlush(hydrateWalEntry({
          flushId: step.flushId || entry.flushId || PINNED_NONCE_A,
          createdAt: PINNED_CREATED_AT,
          delta: step.delta || { total: 2, humans: 2 },
        }));
        outcomes.push(result.outcome);
      } else if (step.action === "record") {
        const result = fallback.recordSuccessfulFlush({
          flushId: step.flushId || entry.flushId || PINNED_NONCE_A,
          status: step.status || "applied",
          at: PINNED_CREATED_AT,
        });
        outcomes.push(result.outcome);
      }
    }
    const last = fallback.getLastSuccessfulFlush();
    const pending = fallback.loadPendingFlushes();
    const expect = entry.expect || {};
    checkDeep(outcomes, expect.outcomes, errors, "outcomes");
    if (expect.pendingCount !== undefined) {
      checkExpect(pending.length, expect.pendingCount, errors, "pendingCount");
    }
    if (expect.lastSuccessfulFlushId !== undefined) {
      checkExpect(last?.flushId ?? null, expect.lastSuccessfulFlushId, errors, "lastSuccessfulFlushId");
    }
    if (expect.corrupt !== undefined) {
      checkExpect(fallback.isCorrupt(), expect.corrupt, errors, "corrupt");
    }
    return {
      outcomes,
      pendingCount: pending.length,
      lastSuccessfulFlushId: last?.flushId ?? null,
      corrupt: fallback.isCorrupt(),
      caseErrors: errors,
    };
  });
}

function runSqlCase(entry) {
  const contract = sqlNonceContract(readPulseSql());
  const errors = [];
  const expect = entry.expect || {};
  for (const [key, value] of Object.entries(expect)) {
    checkExpect(contract[key], value, errors, key);
  }
  return { contract, caseErrors: errors };
}

export async function runCase(entry) {
  const loaded = entry.file ? fixture(entry.file) : {};
  entry = { ...loaded, ...entry };
  let detail;
  if (entry.kind === "store") detail = await runStoreCase(entry);
  else if (entry.kind === "wal-entry") detail = runWalEntryCase(entry);
  else if (entry.kind === "wal-state") detail = runWalStateCase(entry);
  else if (entry.kind === "fallback") detail = runFallbackCase(entry);
  else if (entry.kind === "sql-source") detail = runSqlCase(entry);
  else detail = { caseErrors: [`unknown kind ${entry.kind}`] };

  const caseErrors = detail.caseErrors || [];
  const { caseErrors: _ignored, ok: engineOk, ...rest } = detail;
  return {
    id: entry.id,
    ok: caseErrors.length === 0,
    kind: entry.kind,
    file: entry.file,
    engineOk: engineOk ?? null,
    ...rest,
    errors: caseErrors,
  };
}

export async function runColdCohort() {
  const manifest = loadManifest();
  const cases = [];
  for (const entry of manifest.cases) {
    cases.push(await runCase(entry));
  }
  const failed = cases.filter((item) => !item.ok);
  const byId = Object.fromEntries(cases.map((item) => [item.id, item]));
  return {
    schema: SCHEMA,
    ok: failed.length === 0,
    mode: "cold",
    engine: {
      store: ENGINE_STORE,
      authority: ENGINE_AUTHORITY,
      wal: ENGINE_WAL,
      fallback: ENGINE_FALLBACK,
      sql: ENGINE_SQL,
    },
    caseCount: cases.length,
    failedCount: failed.length,
    cases,
    invariants: {
      firstApply: byId["first-apply"]?.ok === true && byId["first-apply"]?.snapshotTotal === 2,
      identicalReplayNotDoubleCounted:
        byId["identical-replay"]?.ok === true
        && byId["identical-replay"]?.acks?.[1] === "already_applied"
        && byId["identical-replay"]?.snapshotTotal === 2,
      conflictingReplayRejected:
        byId["conflicting-replay"]?.ok === true
        && (byId["conflicting-replay"]?.stepErrors || []).includes("pulse_flush_id_conflict")
        && byId["conflicting-replay"]?.snapshotTotal === 2,
      freshNonceApplies: byId["fresh-nonce-applies"]?.snapshotTotal === 5,
      invalidNonceRejected: byId["invalid-flush-id"]?.ok === true,
      sqlUuidNonce: byId["sql-nonce-is-uuid"]?.ok === true,
      payment: false,
      checkout: false,
      publish: false,
      neomorphicIo: false,
    },
  };
}
