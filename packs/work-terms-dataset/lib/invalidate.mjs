import { INVALIDATION_ACTORS, INVALIDATION_REASONS, NOTE_RE, REPUBLICATION_FORBIDDEN, isRfc3339Utc } from "./schema.mjs";
import { appendInvalidation, loadStore, writeRecord, writeVersions } from "./store.mjs";
import { currentRecords, documentKey } from "./store.mjs";

export function invalidateRecord(store, recordId, spec) {
  const reason = spec.reason;
  const note = spec.note;
  const actor = spec.actor || "operator";
  const at = spec.at || new Date().toISOString();
  const write = spec.write === true;

  if (!INVALIDATION_REASONS.includes(reason)) {
    return {
      ok: false,
      invalidated: false,
      code: "invalid_invalidation_reason",
      message: `reason must be one of ${INVALIDATION_REASONS.join(", ")}`,
    };
  }
  if (typeof note !== "string" || note.length < 8 || !NOTE_RE.test(note)) {
    return {
      ok: false,
      invalidated: false,
      code: "invalid_shape",
      message: "invalidation note required",
    };
  }
  if (!INVALIDATION_ACTORS.includes(actor)) {
    return {
      ok: false,
      invalidated: false,
      code: "invalid_shape",
      message: `actor must be one of ${INVALIDATION_ACTORS.join(", ")}`,
    };
  }
  if (!isRfc3339Utc(at)) {
    return {
      ok: false,
      invalidated: false,
      code: "invalid_shape",
      message: "invalidation at must be RFC3339 UTC",
    };
  }

  const item = store.records.find((row) => row.record.id === recordId);
  if (!item) {
    return {
      ok: false,
      invalidated: false,
      code: "unknown_record",
      message: `no record ${recordId}`,
    };
  }
  if (item.record.status === "invalidated") {
    return {
      ok: false,
      invalidated: false,
      code: "already_invalidated",
      message: `${recordId} is already invalidated`,
      record: item.record,
    };
  }

  const previousStatus = item.record.status;
  const invalidation = { at, reason, note, actor };
  if (write) {
    item.record.status = "invalidated";
    item.record.invalidation = invalidation;
    writeRecord(store.root, item.record);
    appendInvalidation(store.root, {
      at,
      recordId,
      documentKey: documentKey(item.record),
      reason,
      note,
      actor,
      previousStatus,
    });
    writeVersions(store.root, store);
  }

  return {
    ok: true,
    invalidated: true,
    code: "invalidated",
    recordId,
    previousStatus,
    invalidation,
    dryRun: !write,
    currentAfter: currentRecords(store.records)
      .filter((record) => documentKey(record) === documentKey(item.record) && record.id !== recordId)
      .map((record) => record.id),
  };
}

export function invalidateById(root, recordId, spec) {
  const store = loadStore(root);
  return invalidateRecord(store, recordId, spec);
}

export function currentFor(store, platformId, documentKind) {
  return store.records
    .filter(
      (item) =>
        item.record.platformId === platformId &&
        item.record.documentKind === documentKind &&
        item.record.status === "current",
    )
    .map((item) => item.record);
}

export function refuseRepublication(record) {
  if (!record) {
    return { allowed: false, code: "unknown_record", message: "no record" };
  }
  if (record.status === "invalidated") {
    return {
      allowed: false,
      code: "invalidated_not_republishable",
      message: "invalidated terms must not be republished",
      right: record.republication?.right || null,
    };
  }
  const right = record.republication?.right;
  if (!right || REPUBLICATION_FORBIDDEN.includes(right)) {
    return {
      allowed: false,
      code: "republication_not_granted",
      message: "republication right does not grant body or excerpt reuse",
      right,
    };
  }
  return {
    allowed: true,
    code: "cite_only",
    message: record.republication.statement,
    right,
    mustAttribute: record.republication.mustAttribute,
    mustLinkCanonical: record.republication.mustLinkCanonical,
    excerptMaxChars: record.republication.excerptMaxChars,
    mayStoreFullBody: false,
    mayCommerciallyResell: false,
  };
}
