export function detectKind(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { kind: "unknown", reason: "not_object" };
  }
  if (input.schema === "pilot.task-commons.page-change-result.v1") {
    return { kind: "n45_page_change_result", envelope: input };
  }
  const report = input.report && typeof input.report === "object" ? input.report : input;
  if (report.schema === "pilot/page-change-brief/v1") {
    return { kind: "page_change_brief", envelope: input, report };
  }
  if (
    input.product === "samedaydesk-extract-batch" ||
    input.schemaVersion === "samedaydesk.extract-batch.v0" ||
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
