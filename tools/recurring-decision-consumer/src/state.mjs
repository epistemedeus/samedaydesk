import { readBoundedJson, removePath, writeJsonAtomic } from "./io.mjs";
import { STATE_SCHEMA } from "./pins.mjs";
import { STATE_MAX_BYTES } from "./limits.mjs";

export function emptyState({ subject, intentId, clock }) {
  return {
    schema: STATE_SCHEMA,
    subject,
    intentId,
    updatedAt: clock,
    sequence: 0,
    retainedResult: null,
  };
}

export function loadState(path) {
  try {
    const state = readBoundedJson(path, STATE_MAX_BYTES);
    if (!state || state.schema !== STATE_SCHEMA) {
      return { ok: false, message: "state schema unsupported" };
    }
    return { ok: true, state };
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: true, state: null, missing: true };
    if (error?.code === "OVERSIZE") return { ok: false, message: error.message };
    return { ok: false, message: "cannot read state JSON" };
  }
}

export function updateState(path, patch) {
  const loaded = loadState(path);
  if (!loaded.ok) return loaded;
  const current = loaded.state ?? emptyState({
    subject: patch.subject,
    intentId: patch.intentId,
    clock: patch.clock,
  });
  const next = {
    ...current,
    subject: patch.subject ?? current.subject,
    intentId: patch.intentId ?? current.intentId,
    updatedAt: patch.clock,
    sequence: (current.sequence ?? 0) + 1,
    retainedResult: patch.retainedResult,
  };
  writeJsonAtomic(path, next);
  return { ok: true, state: next };
}

export function removeState(path) {
  return { ok: true, removed: removePath(path) };
}

export function showState(path) {
  return loadState(path);
}
