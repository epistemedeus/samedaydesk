import { exportReuse, previewReuse } from "../../result-reuse/src/export.mjs";

export function maintenanceBrief({ request, disposition, detected }) {
  const changed = detected?.evidence?.changed ?? [];
  const unchanged = detected?.outcome === "unchanged";
  return {
    job: { id: request.occurrenceId },
    report: {
      schema: "pilot/page-change-brief/v1",
      kind: "compat_maintenance",
      verdict: unchanged ? "unchanged" : "changed",
      fields: request.fields,
      freshness: "unknown",
      claims: {
        noChangeProven: unchanged,
        contentUnchangedProven: unchanged,
        comparable: true,
        complete: detected?.outcome === "changed" || unchanged,
        current: false,
        fresh: false,
        usefulOutputProven: disposition === "repair" || disposition === "useful_no_fit" || disposition === "not_yet_due",
        paymentImpliesUsefulOutput: false,
      },
      summary: {
        matched: unchanged ? request.fields.length : Math.max(0, request.fields.length - changed.length),
        missing: disposition === "useful_no_fit" ? 1 : 0,
        failed: 0,
        unknown: 0,
        duplicates: 0,
        coverageUnknown: 0,
        semantic: changed.length,
      },
      changes: changed.map((row) => ({
        class: "semantic",
        op: "replace",
        path: row.field,
      })),
    },
  };
}

export function projectOccurrence(brief, request) {
  const options = {
    taskId: request.taskId,
    subject: request.subject,
    sequence: request.sequence,
    clock: request.clock,
    optIn: request.optIn === true,
  };
  const preview = previewReuse(brief, options);
  if (request.optIn !== true) {
    return {
      permission: "unavailable",
      granted: false,
      previewOk: preview.ok === true,
      previewMode: preview.ok ? preview.mode : null,
      publicSafeCertified: false,
      message: preview.ok ? null : preview.message,
      observation: null,
    };
  }
  const exported = exportReuse(brief, options);
  return {
    permission: "unavailable",
    granted: false,
    previewOk: preview.ok === true,
    previewMode: preview.ok ? preview.mode : null,
    exportOk: exported.ok === true,
    publicSafeCertified: false,
    message: exported.ok ? null : exported.message,
    observation: exported.ok ? exported.observation : null,
  };
}
