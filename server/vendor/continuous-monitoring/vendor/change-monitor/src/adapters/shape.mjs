export function observation(subscription, fields) {
  const comparable = fields.evidenceClass === "comparable";
  return {
    adapterId: fields.adapterId,
    schemaId: fields.schemaId ?? null,
    sourceKind: subscription.source.kind,
    sourceScope: subscription.source.scope,
    sourceVersion: fields.sourceVersion ?? null,
    observedAt: fields.observedAt ?? null,
    evidenceClass: fields.evidenceClass,
    failureCode: comparable ? null : fields.failureCode,
    material: comparable ? fields.material : null,
    coverage: fields.coverage ?? null,
    nonSemantic: fields.nonSemantic ?? null,
    correctsEvidenceId: fields.correctsEvidenceId ?? null,
  };
}

export function isPlain(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sortedStrings(value) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return null;
  return [...value].sort();
}
