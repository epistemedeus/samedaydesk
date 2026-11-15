import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { LOCK_SCHEMA } from "./constants.mjs";

export function lockPathFor(journeyPath) {
  return `${journeyPath}.retained-lock`;
}

export function readRetainedLock(lockPath) {
  let text;
  try {
    text = readFileSync(lockPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return { ok: true, present: false };
    return { ok: false, reason: "retained_lock_unreadable" };
  }
  try {
    const lock = JSON.parse(text);
    if (!lock || lock.schema !== LOCK_SCHEMA) {
      return { ok: false, reason: "retained_lock_unreadable", present: true };
    }
    return { ok: true, present: true, lock };
  } catch {
    return { ok: false, reason: "retained_lock_unreadable", present: true };
  }
}

export function lockView(lock) {
  if (!lock || typeof lock !== "object") return null;
  return {
    schema: lock.schema,
    holderId: lock.holderId,
    purpose: lock.purpose,
    acquiredAt: lock.acquiredAt,
    pid: lock.pid,
    automaticUnlock: false,
  };
}

export function acquireRetainedLock(lockPath, record) {
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error && error.code === "EEXIST") {
      const current = readRetainedLock(lockPath);
      return {
        ok: false,
        reason: "retained_lock_refused",
        lock: current.present ? current.lock : null,
      };
    }
    return { ok: false, reason: "retained_lock_refused" };
  }
  try {
    writeSync(descriptor, JSON.stringify(record));
  } finally {
    closeSync(descriptor);
  }
  return { ok: true, fencing: record.fencing };
}

export function releaseRetainedLock(lockPath, fencing) {
  const current = readRetainedLock(lockPath);
  if (!current.ok) return { ...current, automaticUnlock: false };
  if (!current.present) return { ok: true, released: false, reason: "no_retained_lock", automaticUnlock: false };
  if (current.lock.fencing !== fencing) {
    return { ok: false, reason: "fencing_mismatch", automaticUnlock: false };
  }
  unlinkSync(lockPath);
  return { ok: true, released: true, automaticUnlock: false };
}

export function lockHoldMs() {
  const raw = process.env.TWO_SIDED_WORK_LOCK_HOLD_MS;
  if (raw == null || raw === "") return 0;
  if (!/^\d+$/.test(raw)) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 2000) return 0;
  return value;
}
