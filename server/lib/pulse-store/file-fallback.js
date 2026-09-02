import fs from "node:fs";
import { deltaCanonicalDigest, MAX_PENDING_FLUSHES, validateDelta } from "./schema.js";
import { atomicWriteJson } from "./atomic-write.js";
import { withWalLock } from "./wal-lock.js";
import { defaultWalState, validateWalState } from "./wal-schema.js";

export function createFileFallbackStore(filePath, options = {}) {
  const writeJson = options.writeJson || atomicWriteJson;
  const lockPath = filePath ? `${filePath}.lock` : null;

  function readDiskRaw() {
    if (!filePath || !fs.existsSync(filePath)) {
      return { corrupt: false, state: defaultWalState() };
    }
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      const state = validateWalState(parsed);
      if (state.snapshotCorrupt) {
        return { corrupt: true, state: null };
      }
      return { corrupt: false, state };
    } catch (err) {
      if (err?.message === "pulse_wal_flush_id_conflict") {
        return { corrupt: true, state: null };
      }
      return { corrupt: true, state: null };
    }
  }

  function withWalTransaction(mutator) {
    if (!filePath || !lockPath) {
      return { outcome: "write_failed" };
    }
    try {
      return withWalLock(lockPath, () => {
        const read = readDiskRaw();
        if (read.corrupt) {
          return { outcome: "corrupt" };
        }
        const result = mutator(structuredClone(read.state));
        if (!result.write) {
          return result;
        }
        const normalizedState = validateWalState(result.state);
        if (!writeJson(filePath, normalizedState)) {
          return { outcome: "write_failed" };
        }
        return { ...result, state: normalizedState };
      });
    } catch (err) {
      if (err?.code === "pulse_wal_lock_timeout") {
        return { outcome: "write_failed" };
      }
      return { outcome: "write_failed" };
    }
  }

  function readView() {
    if (!filePath) {
      return { corrupt: false, state: defaultWalState() };
    }
    return readDiskRaw();
  }

  return {
    isCorrupt() {
      return readView().corrupt;
    },

    loadPendingFlushes() {
      const view = readView();
      if (view.corrupt || !view.state) return [];
      return view.state.pendingFlushes;
    },

    enqueuePendingFlush(entry) {
      const normalizedDelta = validateDelta(entry.delta);
      const canonical = deltaCanonicalDigest(normalizedDelta);
      const normalizedEntry = {
        flushId: entry.flushId,
        delta: normalizedDelta,
        createdAt: entry.createdAt,
      };

      return withWalTransaction((state) => {
        const existing = state.pendingFlushes.find((row) => row.flushId === normalizedEntry.flushId);
        if (existing) {
          if (deltaCanonicalDigest(existing.delta) === canonical) {
            return { outcome: "duplicate_same", write: false, state };
          }
          state.snapshotCorrupt = true;
          return { outcome: "corrupt", write: true, state };
        }

        if (state.pendingFlushes.length >= MAX_PENDING_FLUSHES) {
          state.droppedUnknown += 1;
          return { outcome: "dropped_persisted", write: true, state };
        }

        state.pendingFlushes.push(normalizedEntry);
        return { outcome: "queued", write: true, state };
      });
    },

    removePendingFlush(flushId) {
      return withWalTransaction((state) => {
        state.pendingFlushes = state.pendingFlushes.filter((row) => row.flushId !== flushId);
        return { outcome: "queued", write: true, state };
      });
    },

    recordSuccessfulFlush(meta) {
      return withWalTransaction((state) => {
        state.lastSuccessfulFlush = meta;
        return { outcome: "queued", write: true, state };
      });
    },

    getLastSuccessfulFlush() {
      const view = readView();
      if (view.corrupt || !view.state) return null;
      return view.state.lastSuccessfulFlush;
    },

    getDroppedUnknown() {
      const view = readView();
      if (view.corrupt || !view.state) return 0;
      return view.state.droppedUnknown || 0;
    },

    markLegacyImported() {
      return withWalTransaction((state) => {
        state.legacyImported = true;
        return { outcome: "queued", write: true, state };
      });
    },

    isLegacyImported() {
      const view = readView();
      if (view.corrupt || !view.state) return false;
      return Boolean(view.state.legacyImported);
    },

    getLegacyUncertainty() {
      const view = readView();
      if (view.corrupt || !view.state) return null;
      return view.state.legacyUncertainty ?? null;
    },

    getObservationStartedAt() {
      const view = readView();
      if (view.corrupt || !view.state) return null;
      return view.state.observationStartedAt ?? null;
    },

    persistLocalMetadata({ legacyUncertainty, observationStartedAt } = {}) {
      const result = withWalTransaction((state) => {
        if (legacyUncertainty !== undefined) state.legacyUncertainty = legacyUncertainty;
        if (observationStartedAt !== undefined) state.observationStartedAt = observationStartedAt;
        return { outcome: "queued", write: true, state };
      });
      return result.outcome !== "write_failed" && result.outcome !== "corrupt";
    },

    getMigratedSnapshotDigest() {
      const view = readView();
      if (view.corrupt || !view.state) return null;
      return view.state.migratedSnapshotDigest ?? null;
    },

    markSnapshotMigrated(digest) {
      const result = withWalTransaction((state) => {
        if (state.migratedSnapshotDigest && state.migratedSnapshotDigest !== digest) {
          state.snapshotCorrupt = true;
          return { outcome: "corrupt", write: true, state };
        }
        state.migratedSnapshotDigest = digest;
        return { outcome: "queued", write: true, state };
      });
      return result.outcome === "queued";
    },

    isSnapshotCorrupt() {
      const view = readView();
      if (view.corrupt) return true;
      return Boolean(view.state?.snapshotCorrupt);
    },

    markSnapshotCorrupt() {
      return withWalTransaction((state) => {
        state.snapshotCorrupt = true;
        return { outcome: "queued", write: true, state };
      });
    },
  };
}
