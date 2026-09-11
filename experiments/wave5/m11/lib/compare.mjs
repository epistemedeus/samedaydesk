/**
 * Domain comparison for caller examples.
 * Engine/wrapper digests may include caller paths; unlike hashes are not forced equal.
 */

function sortedActions(artifact) {
  return [...(artifact?.actions || [])]
    .map((a) => ({
      kind: a.kind || null,
      fieldKey: a.fieldKey || a.key || null,
    }))
    .sort((a, b) => `${a.kind}:${a.fieldKey || ""}`.localeCompare(`${b.kind}:${b.fieldKey || ""}`));
}

export function domainView(artifact, { jobId, analysis } = {}) {
  const actions = sortedActions(artifact);
  return {
    jobId: jobId || artifact?.appId || null,
    analysis: analysis || null,
    status: artifact?.status || null,
    purchaseAuthority: artifact?.purchaseAuthority === true,
    actionKinds: [...new Set(actions.map((a) => a.kind).filter(Boolean))].sort(),
    fieldKeys: [...new Set(actions.map((a) => a.fieldKey).filter(Boolean))].sort(),
    eventKeys: [...(artifact?.events || [])].map((e) => e.key).filter(Boolean).sort(),
    actions,
  };
}

export function compareDomain(a, b) {
  if (!a || !b) {
    return { comparable: false, meaningful: false, reason: "missing-domain" };
  }
  if (a.jobId && b.jobId && a.jobId !== b.jobId) {
    return {
      comparable: false,
      meaningful: true,
      reason: "unlike-jobs",
      note: "Unlike jobs are not hash-equalized.",
    };
  }
  const sameStatus = a.status === b.status;
  const sameActions = JSON.stringify(a.actions) === JSON.stringify(b.actions);
  const sameKeys =
    JSON.stringify(a.fieldKeys) === JSON.stringify(b.fieldKeys) &&
    JSON.stringify(a.eventKeys) === JSON.stringify(b.eventKeys);
  return {
    comparable: true,
    meaningful: !(sameStatus && sameActions && sameKeys),
    sameStatus,
    sameActions,
    sameKeys,
    a,
    b,
  };
}
