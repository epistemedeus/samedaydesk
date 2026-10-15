import { canonicalize } from "../deps/canonical/canonical.mjs";
import { SCHEMA_EVIDENCE_EXPORT } from "./constants.mjs";
import { ARMS } from "./evaluate.mjs";
import { sha256Text } from "./ids.mjs";

const EXPORT_LIMIT = 16384;

function slim(row) {
  return {
    taskId: row.taskId,
    status: row.status,
    exitCode: row.exitCode,
    inputSha256: row.inputSha256,
    stableSha256: row.stableSha256,
    failures: row.failures ?? [],
    readyForRelease: false,
    accepted: false,
  };
}

export function boundedEvidenceExport(measurement, outcome) {
  const arm = outcome === "useful_positive" ? "positive" : "negative";
  const spec = ARMS[arm];
  const changed = measurement[arm];
  if (!spec || !changed?.directBaseline || !measurement.original || !measurement.later) {
    throw new Error("measurement is missing the agreed arm");
  }
  const body = {
    schema: SCHEMA_EVIDENCE_EXPORT,
    role: "supplied_contributor_measurement",
    authoritative: false,
    signatureIsWorkProof: false,
    rawFixtureIncluded: false,
    rawSecretsIncluded: false,
    archiveSha256: measurement.archiveSha256,
    documentedPathExists: measurement.documentedPathExists,
    workingExtractDirectory: measurement.workingExtractDirectory,
    entry: measurement.entry,
    outcome,
    original: slim(measurement.original),
    later: { ...slim(measurement.later), summaryMax: ARMS.later.summaryMax },
    changed: {
      ...slim(changed),
      summaryMax: spec.summaryMax,
      extraCriterionId: spec.extra?.id ?? null,
    },
    taskDelta: {
      taskId: spec.taskId,
      summaryMax: spec.summaryMax,
      extraCriterionId: spec.extra?.id ?? null,
    },
    directBaseline: {
      equallyEquipped: changed.directBaseline.equallyEquipped === true,
      stableSha256: changed.directBaseline.stableSha256,
      reuseGain: null,
      countedAsContributorSavings: false,
    },
    reuseGain: null,
    releaseAcceptance: false,
    organicCustomer: false,
    customerRevenue: false,
  };
  if (Buffer.byteLength(canonicalize(body)) > EXPORT_LIMIT) {
    throw new Error("evidence export exceeds the bound");
  }
  return body;
}

export function evidenceDigest(exportDoc) {
  return sha256Text(canonicalize(exportDoc));
}
