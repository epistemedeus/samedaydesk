/**
 * Classify an SDS fulfillment envelope as partial or complete.
 * Pins the same incomplete signals as tools/result-reuse/src/project.mjs
 * isIncomplete, plus source/accounting rows that under-deliver.
 *
 * charged:true is never treated as settled. Quote presence is not delivery.
 */
import {
  PRODUCT_EXTRACT_BATCH,
  SCHEMA_EXTRACT_BATCH,
  SCHEMA_PAGE_CHANGE,
} from "./catalog.mjs";

const PARTIAL_SOURCE_STATUS = new Set(["partial", "failure", "unknown", "missing", "error"]);

export function detectKind(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { kind: "unknown", reason: "not_object" };
  }
  if (input.schema === "pilot.task-commons.page-change-result.v1") {
    return { kind: "n45_page_change_result", envelope: input };
  }
  const report = input.report && typeof input.report === "object" ? input.report : input;
  if (report.schema === SCHEMA_PAGE_CHANGE) {
    return { kind: "page_change_brief", envelope: input, report };
  }
  if (
    input.product === PRODUCT_EXTRACT_BATCH ||
    input.schemaVersion === SCHEMA_EXTRACT_BATCH ||
    (Array.isArray(input.sources) && (input.jobId || input.quote))
  ) {
    return { kind: "extract_batch", envelope: input };
  }
  if (
    Array.isArray(input.records) &&
    (input.invalidRecords || input.partialRecords || input.networkUsed === false || input.status === "partial")
  ) {
    return { kind: "explicit_record", envelope: input };
  }
  return { kind: "unknown", reason: "unrecognized_result_schema" };
}

function countBy(list, pred) {
  if (!Array.isArray(list)) return 0;
  return list.filter(pred).length;
}

function classifyExtractBatch(envelope) {
  const reasons = [];
  const sources = Array.isArray(envelope.sources) ? envelope.sources : [];
  const accounting = envelope.accounting && typeof envelope.accounting === "object" ? envelope.accounting : {};
  const failedSources = countBy(sources, (row) => PARTIAL_SOURCE_STATUS.has(String(row?.status || "")));
  const successSources = countBy(sources, (row) => row?.status === "success");

  if (envelope.partial === true) reasons.push("flag_partial_true");
  if (envelope.ok === false) reasons.push("ok_false");
  if (envelope.jobStatus && envelope.jobStatus !== "completed") {
    reasons.push(`job_status_${envelope.jobStatus}`);
  }
  if (failedSources > 0) reasons.push(`sources_not_success:${failedSources}`);
  if (Number(accounting.failed || 0) > 0) reasons.push(`accounting_failed:${accounting.failed}`);
  if (Number(accounting.partial || 0) > 0) reasons.push(`accounting_partial:${accounting.partial}`);
  if (Number(accounting.unknown || 0) > 0) reasons.push(`accounting_unknown:${accounting.unknown}`);
  if (sources.length === 0) reasons.push("no_sources");
  if (envelope.charged === true) reasons.push("charged_is_not_settled");

  const partial = reasons.some((r) => r !== "charged_is_not_settled");
  return {
    kind: "extract_batch",
    product: envelope.product || PRODUCT_EXTRACT_BATCH,
    schemaVersion: envelope.schemaVersion || SCHEMA_EXTRACT_BATCH,
    jobId: envelope.jobId || null,
    jobStatus: envelope.jobStatus || null,
    ok: envelope.ok,
    flagPartial: envelope.partial === true,
    sourceCount: sources.length,
    successSources,
    failedSources,
    accounting: {
      succeeded: Number(accounting.succeeded || 0),
      partial: Number(accounting.partial || 0),
      failed: Number(accounting.failed || 0),
      unknown: Number(accounting.unknown || 0),
    },
    charged: envelope.charged === true,
    partial,
    complete: !partial,
    reasons,
  };
}

function classifyPageChange(report) {
  const reasons = [];
  const claims = report.claims && typeof report.claims === "object" ? report.claims : {};
  const summary = report.summary && typeof report.summary === "object" ? report.summary : {};
  if (claims.complete === false) reasons.push("claims_complete_false");
  if (claims.paymentImpliesUsefulOutput === true) {
    reasons.push("payment_does_not_imply_useful_output");
  }
  for (const key of ["missing", "failed", "unknown", "coverageUnknown"]) {
    const n = Number(summary[key] || 0);
    if (n > 0) reasons.push(`summary_${key}:${n}`);
  }
  const rows = report.rows && typeof report.rows === "object" ? report.rows : {};
  for (const key of ["missing", "failed", "unknown"]) {
    if (Array.isArray(rows[key]) && rows[key].length > 0) {
      reasons.push(`rows_${key}:${rows[key].length}`);
    }
  }
  const partial = reasons.some((r) => r !== "payment_does_not_imply_useful_output") || claims.complete !== true;
  if (claims.complete !== true && !reasons.includes("claims_complete_false")) {
    reasons.push("claims_complete_not_true");
  }
  return {
    kind: "page_change_brief",
    product: "samedaydesk-page-change",
    schemaVersion: report.schema || SCHEMA_PAGE_CHANGE,
    verdict: report.verdict || null,
    claimsComplete: claims.complete === true,
    partial,
    complete: !partial,
    reasons,
    summary: {
      matched: Number(summary.matched || 0),
      missing: Number(summary.missing || 0),
      failed: Number(summary.failed || 0),
      unknown: Number(summary.unknown || 0),
      coverageUnknown: Number(summary.coverageUnknown || 0),
    },
  };
}

function classifyRecord(envelope) {
  const reasons = [];
  const invalid = Array.isArray(envelope.invalidRecords) ? envelope.invalidRecords : [];
  const partialRecords = Array.isArray(envelope.partialRecords) ? envelope.partialRecords : [];
  if (envelope.status === "partial") reasons.push("status_partial");
  if (envelope.ok === false) reasons.push("ok_false");
  if (invalid.length > 0) reasons.push(`invalid_records:${invalid.length}`);
  if (partialRecords.length > 0) reasons.push(`partial_records:${partialRecords.length}`);
  const partial = reasons.length > 0;
  return {
    kind: "explicit_record",
    product: "samedaydesk-explicit-record",
    status: envelope.status || null,
    ok: envelope.ok,
    invalidCount: invalid.length,
    partialRecordCount: partialRecords.length,
    partial,
    complete: !partial,
    reasons,
  };
}

function classifyN45(envelope) {
  const reasons = [];
  if (envelope.status && envelope.status !== "ok" && envelope.status !== "success" && envelope.status !== "changed") {
    reasons.push(`status_${envelope.status}`);
  }
  const partial = reasons.length > 0;
  return {
    kind: "n45_page_change_result",
    product: "samedaydesk-page-change-result",
    status: envelope.status || null,
    partial,
    complete: !partial,
    reasons,
  };
}

export function classifyFulfillment(input) {
  const detected = detectKind(input);
  if (detected.kind === "unknown") {
    const err = new Error(`unrecognized fulfillment envelope: ${detected.reason || "unknown"}`);
    err.code = "UNRECOGNIZED";
    err.detail = { reason: detected.reason };
    throw err;
  }
  if (detected.kind === "extract_batch") return classifyExtractBatch(detected.envelope);
  if (detected.kind === "page_change_brief") return classifyPageChange(detected.report);
  if (detected.kind === "explicit_record") return classifyRecord(detected.envelope);
  if (detected.kind === "n45_page_change_result") return classifyN45(detected.envelope);
  const err = new Error(`unhandled kind: ${detected.kind}`);
  err.code = "UNRECOGNIZED";
  throw err;
}
