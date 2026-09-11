import { readFileSync } from "node:fs";
import { sha256File } from "./sha.mjs";

export function loadExtractBatch(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return { path, sha256: sha256File(path), parsed };
}

export function sourceField(batch, sourceKey, field) {
  const sources = Array.isArray(batch?.sources) ? batch.sources : [];
  const row = sources.find((item) => item && item.source === sourceKey);
  if (!row) return { present: false, row: null, value: undefined };
  if (!row.data || typeof row.data !== "object" || !Object.hasOwn(row.data, field)) {
    return { present: false, row, value: undefined };
  }
  return { present: true, row, value: row.data[field] };
}

export function verifyChangedFact({ beforeBatch, afterBatch, report, fact }) {
  const before = sourceField(beforeBatch, fact.sourceKey, fact.field);
  const after = sourceField(afterBatch, fact.sourceKey, fact.field);
  const captureMatches =
    before.present &&
    after.present &&
    before.value === fact.before &&
    after.value === fact.after;
  const path = `/${fact.field}`;
  const change = Array.isArray(report?.changes)
    ? report.changes.find(
        (item) =>
          item.sourceKey === fact.sourceKey &&
          item.path === path &&
          item.class === "semantic" &&
          item.op === "replace",
      )
    : null;
  const engineMatches = Boolean(
    change && change.before === fact.before && change.after === fact.after,
  );
  return {
    kind: "changed",
    sourceKey: fact.sourceKey,
    field: fact.field,
    expectedBefore: fact.before,
    expectedAfter: fact.after,
    captureMatches,
    engineMatches,
    verified: captureMatches && engineMatches,
    captureBefore: before.present ? before.value : null,
    captureAfter: after.present ? after.value : null,
  };
}

export function verifyUnchangedFact({ beforeBatch, afterBatch, report, fact }) {
  const before = sourceField(beforeBatch, fact.sourceKey, fact.field);
  const after = sourceField(afterBatch, fact.sourceKey, fact.field);
  const expected = fact.before ?? fact.after;
  const captureMatches =
    before.present &&
    after.present &&
    before.value === expected &&
    after.value === expected;
  const path = `/${fact.field}`;
  const semantic = Array.isArray(report?.changes)
    ? report.changes.some(
        (item) =>
          item.sourceKey === fact.sourceKey &&
          item.path === path &&
          item.class === "semantic",
      )
    : false;
  return {
    kind: "unchanged",
    sourceKey: fact.sourceKey,
    field: fact.field,
    expected,
    captureMatches,
    engineMatches: !semantic,
    verified: captureMatches && !semantic,
    captureBefore: before.present ? before.value : null,
    captureAfter: after.present ? after.value : null,
  };
}

export function verifyOrderFact({ report, fact }) {
  const path = fact.path || `/${fact.field}`;
  const change = Array.isArray(report?.changes)
    ? report.changes.find(
        (item) =>
          item.class === "order" &&
          item.path === path &&
          (fact.sourceKey == null || item.sourceKey === fact.sourceKey),
      )
    : null;
  return {
    kind: "order",
    sourceKey: fact.sourceKey ?? null,
    path,
    verified: Boolean(change),
    engineMatches: Boolean(change),
    captureMatches: true,
  };
}

export function verifyFacts({ beforeBatch, afterBatch, report, facts }) {
  return (facts || []).map((fact) => {
    if (fact.kind === "unchanged") {
      return verifyUnchangedFact({ beforeBatch, afterBatch, report, fact });
    }
    if (fact.kind === "order") {
      return verifyOrderFact({ report, fact });
    }
    return verifyChangedFact({ beforeBatch, afterBatch, report, fact });
  });
}

export function provenanceMatches(report, beforeSha256, afterSha256) {
  return (
    report?.provenance?.beforeSha256 === beforeSha256 &&
    report?.provenance?.afterSha256 === afterSha256
  );
}
