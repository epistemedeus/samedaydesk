import { readByPath } from "./classify.mjs";

const OPTIONAL_INPUT_FLAGS = [
  ["maxBytes", "max-bytes"],
  ["maxChanges", "max-changes"],
  ["maxSources", "max-sources"],
  ["maxStaleMs", "max-stale-ms"],
  ["maxJsonDepth", "max-json-depth"],
  ["maxJsonNodes", "max-json-nodes"],
  ["maxExcerptBytes", "max-excerpt-bytes"],
  ["maxFields", "max-fields"],
];

export function usefulStatus(engine, stdoutDoc, outputJson = null) {
  const field = engine.analysisField;
  if (field === "counts") {
    return stdoutDoc?.counts || outputJson?.counts || null;
  }
  if (field === "outcome") {
    return stdoutDoc?.outcome || outputJson?.outcome || null;
  }
  if (field === "report.verdict") {
    return stdoutDoc?.report?.verdict || outputJson?.report?.verdict || null;
  }
  return readByPath(stdoutDoc, field) ?? readByPath(outputJson, field) ?? null;
}

export function d01AnalysisStatus(engine, stdoutDoc, outputJson = null) {
  const value = usefulStatus(engine, stdoutDoc, outputJson);
  if (engine.id === "lockfile-pin-delta" || engine.id === "json-schema-webhook-drift") {
    if (value === "actionable" || value === "informational" || value === "partial") return value;
    return value || "completed";
  }
  if (engine.id === "route-table-diff") {
    if (value === "no-change" || value === "permutation" || value === "title-only") return "informational";
    if (value === "changed" || value === "breaking") return "actionable";
    return value || "completed";
  }
  if (engine.id === "page-change-offline-job") {
    if (value === "unchanged" || value === "reordered") return "informational";
    if (value === "changed") return "actionable";
    if (value === "incomplete" || value === "ambiguous" || value === "incomparable") return "partial";
    return value || "completed";
  }
  return value || "completed";
}

export function optionalFlagArgv(inputs = {}) {
  const argv = [];
  for (const [camel, flag] of OPTIONAL_INPUT_FLAGS) {
    if (inputs[camel] != null && inputs[camel] !== "") {
      argv.push(`--${flag}`, String(inputs[camel]));
    }
  }
  return argv;
}

export function jobCatalogContract(catalog) {
  return {
    schema: "samedaydesk.wave5.m01.job-catalog.v1",
    catalogSchema: catalog.schema,
    id: catalog.id,
    firstOffer: catalog.firstOffer,
    firstOfferRationale: catalog.firstOfferRationale,
    source: catalog.source || "in-tree",
    d01Binding: catalog.d01Binding,
    outcomeKinds: catalog.outcomeKinds || ["analysis", "refused", "incomplete-delivery", "transport-failure"],
    jobs: catalog.engines.map((engine) => ({
      id: engine.id,
      selected: engine.selected === true,
      firstOffer: engine.firstOffer === true,
      pin: engine.pin,
      relativeBin: engine.cli.relativeBin,
      requiredInputs: engine.cli.requiredInputs,
      acceptedInputs: engine.acceptedInputs || null,
      outputs: engine.outputs.map((row) => ({ name: row.name, schema: row.schema || null })),
      refuseStream: engine.refuse.stream,
      analysisField: engine.analysisField,
      usefulStatus: engine.usefulStatus || engine.stdout.analysisStatuses,
    })),
  };
}
