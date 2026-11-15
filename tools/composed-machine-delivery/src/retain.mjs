import { readdirSync } from "node:fs";
import { join } from "node:path";
import { CAPTURE_SCHEMA, RETAINED_SCHEMA } from "./pins.mjs";
import { digest, readJson, removeFile, writeJsonAtomic } from "./json.mjs";

const CURRENT = "capture.json";
const RECOVERY = "capture.recovery.json";
const PREVIOUS = "capture.previous.json";

export function captureDigest(capture) {
  return digest(capture);
}

export function captureProblem(capture) {
  if (!capture || typeof capture !== "object" || Array.isArray(capture)) return "capture required";
  if (capture.schema !== CAPTURE_SCHEMA) return "capture schema unsupported";
  if (typeof capture.captureId !== "string" || capture.captureId.length < 1) return "captureId required";
  if (typeof capture.subject !== "string" || capture.subject.length < 1) return "capture subject required";
  if (typeof capture.capturedAt !== "string") return "capturedAt required";
  if (!capture.payload || typeof capture.payload !== "object" || Array.isArray(capture.payload)) return "capture payload required";
  if (capture.permission?.permitted === false) return "capture is not permitted";
  return null;
}

function recordOf(capture, clock, actor) {
  return {
    schema: RETAINED_SCHEMA,
    retainedAt: clock,
    digest: captureDigest(capture),
    actor: actor || null,
    capture,
  };
}

function readRecord(path) {
  const read = readJson(path);
  if (!read.ok) return read;
  if (read.value?.schema !== RETAINED_SCHEMA || captureProblem(read.value.capture)) {
    return { ok: false, reason: "invalid_record" };
  }
  if (read.value.digest !== captureDigest(read.value.capture)) {
    return { ok: false, reason: "digest_mismatch" };
  }
  return { ok: true, value: read.value };
}

function clearTmp(store) {
  let names = [];
  try {
    names = readdirSync(store);
  } catch {
    return;
  }
  for (const name of names) {
    if (name.includes(".tmp-")) removeFile(join(store, name));
  }
}

export function readRetained(store) {
  return readRecord(join(store, CURRENT));
}

/**
 * Keep one capture. The recovery file is a second copy of the last good
 * capture. A same-digest retain does not write again.
 */
export function retainCapture({ store, capture, clock, actor, replace = false } = {}) {
  const problem = captureProblem(capture);
  if (problem) return { ok: false, reason: "capture_refused", message: problem };
  if (!store) return { ok: false, reason: "store_required" };
  if (typeof clock !== "string" || clock.length < 1) return { ok: false, reason: "clock_required" };
  const next = recordOf(capture, clock, actor);
  const currentPath = join(store, CURRENT);
  const current = readRecord(currentPath);
  if (current.ok && current.value.digest === next.digest) {
    return { ok: true, duplicateEffect: "none", retained: current.value, replaced: false };
  }
  if (current.ok && !replace) {
    return {
      ok: false,
      reason: "capture_already_retained",
      message: "this store already retains a different capture",
      retainedDigest: current.value.digest,
    };
  }
  if (current.ok && replace) {
    const moved = writeJsonAtomic(join(store, PREVIOUS), current.value);
    if (!moved.ok) return moved;
  }
  const saved = writeJsonAtomic(currentPath, next);
  if (!saved.ok) return saved;
  const recovery = writeJsonAtomic(join(store, RECOVERY), next);
  if (!recovery.ok) return recovery;
  clearTmp(store);
  return { ok: true, duplicateEffect: "retained", retained: next, replaced: Boolean(current.ok) };
}

export function recoverCapture(store, { previous = false } = {}) {
  if (!store) return { ok: false, reason: "store_required" };
  clearTmp(store);
  if (previous) {
    const prior = readRecord(join(store, PREVIOUS));
    if (!prior.ok) return { ok: false, reason: "previous_capture_missing" };
    const current = readRecord(join(store, CURRENT));
    if (current.ok && current.value.digest !== prior.value.digest) {
      writeJsonAtomic(join(store, RECOVERY), current.value);
    }
    writeJsonAtomic(join(store, CURRENT), prior.value);
    return { ok: true, recovered: true, source: "previous", retained: prior.value };
  }
  const current = readRecord(join(store, CURRENT));
  if (current.ok) return { ok: true, recovered: false, source: "current", retained: current.value };
  const recovery = readRecord(join(store, RECOVERY));
  if (!recovery.ok) return { ok: false, reason: "capture_lost" };
  const restored = writeJsonAtomic(join(store, CURRENT), recovery.value);
  if (!restored.ok) return restored;
  return { ok: true, recovered: true, source: "recovery", retained: recovery.value };
}
