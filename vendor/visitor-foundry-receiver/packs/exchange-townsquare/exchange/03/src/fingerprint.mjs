import { createHash } from "node:crypto";

/**
 * Stable revision fingerprint over the parts of a brief that define acceptance scope.
 * Ignores generatedAt so re-builds with identical criteria share a revision.
 */
export function briefRevisionFingerprint(brief) {
  const payload = {
    taskId: brief.taskId ?? null,
    title: brief.title ?? null,
    summary: brief.summary ?? null,
    deliverableContract: {
      format: brief.deliverableContract?.format ?? null,
      maxBytes: brief.deliverableContract?.maxBytes ?? null,
      requiredFields: brief.deliverableContract?.requiredFields ?? [],
      statement: brief.deliverableContract?.statement ?? null,
    },
    objectiveChecks: (brief.objectiveChecks || []).map((c) => ({
      id: c.id,
      description: c.description,
      check: c.check,
    })),
    subjectiveCriteria: (brief.subjectiveCriteria || []).map((c) => ({
      id: c.id,
      description: c.description,
      reviewHint: c.reviewHint ?? null,
    })),
    bounds: brief.bounds ?? {},
  };
  const canonical = stableStringify(payload);
  const sha256 = createHash("sha256").update(canonical, "utf8").digest("hex");
  return { sha256, canonical };
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function revisionsEqual(a, b) {
  return Boolean(a && b && a.sha256 && a.sha256 === b.sha256);
}
