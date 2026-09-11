import { sha256Canonical } from "./hash.mjs";

function identityKey(record) {
  return `${record.source?.adapter || "unknown"}::${record.source?.nativeId || record.taskId}`;
}

function titleUrlKey(record) {
  const title = String(record.title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const url = String(record.source?.url || "")
    .trim()
    .toLowerCase();
  return `${title}|${url}`;
}

/**
 * Duplicate / multi-source reconciliation.
 * Same adapter+nativeId: keep newest observation, flag termsVersion drift.
 * Same title+url across adapters: cluster as possibleDuplicate (do not collapse).
 */
export function reconcile(records) {
  const byId = new Map();
  const termsDrift = [];
  const kept = [];

  const sorted = [...records].sort((a, b) =>
    String(b.observedAt || "").localeCompare(String(a.observedAt || "")),
  );

  for (const rec of sorted) {
    const key = identityKey(rec);
    const prev = byId.get(key);
    if (!prev) {
      byId.set(key, rec);
      kept.push(rec);
      continue;
    }
    if (prev.termsVersion !== rec.termsVersion) {
      termsDrift.push({
        identityKey: key,
        taskId: prev.taskId,
        newerTermsVersion: prev.termsVersion,
        olderTermsVersion: rec.termsVersion,
        newerObservedAt: prev.observedAt,
        olderObservedAt: rec.observedAt,
        staleTerms: true,
      });
      prev.revision = {
        ...prev.revision,
        previousTermsVersion: rec.termsVersion,
        staleTerms: true,
      };
    }
    prev.duplicates = (prev.duplicates || 0) + 1;
  }

  const clusters = new Map();
  for (const rec of kept) {
    const k = titleUrlKey(rec);
    if (!k.startsWith("|") && k.endsWith("|")) continue;
    if (!rec.title && !rec.source?.url) continue;
    if (!clusters.has(k)) clusters.set(k, []);
    clusters.get(k).push(rec.taskId);
  }
  const possibleDuplicates = [];
  for (const [k, ids] of clusters) {
    const uniqueAdapters = new Set(
      kept.filter((r) => ids.includes(r.taskId)).map((r) => r.source.adapter),
    );
    if (ids.length > 1) {
      possibleDuplicates.push({
        keySha256: sha256Canonical(k).slice(0, 16),
        taskIds: ids,
        adapters: [...uniqueAdapters],
        note: "Same title+url observed more than once. Rows are not collapsed; funding is not shared.",
      });
      for (const rec of kept) {
        if (ids.includes(rec.taskId)) rec.possibleDuplicateCluster = ids;
      }
    }
  }

  return {
    records: kept,
    droppedExactDuplicates: records.length - kept.length,
    termsDrift,
    possibleDuplicates,
  };
}
