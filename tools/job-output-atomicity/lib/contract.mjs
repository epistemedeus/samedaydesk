import { PIN, RECEIPT_SCHEMA, IDENTITY_SCHEMA, F08_TESTED_SHA } from "./pins.mjs";
import { normalizeSha256 } from "./digest.mjs";

export { RECEIPT_SCHEMA, IDENTITY_SCHEMA, F08_TESTED_SHA };

export const VERIFY_CODES = Object.freeze({
  EMPTY_OUTPUT_OBJECT: "empty-output-object",
  UNKNOWN_JOB: "unknown-job",
  UNRECOGNIZED_RECEIPT_SCHEMA: "unrecognized-receipt-schema",
  FOREIGN_OUTPUT_NAME: "foreign-output-name",
  SPECIAL_OUTPUT_FILE: "special-output-file",
  MISSING_OUTPUT_DIGEST: "missing-output-digest",
  MISSING_OUTPUTS_DIGEST: "missing-outputs-digest",
  FOREIGN_ENGINE_ARCHIVE: "foreign-engine-archive",
  MISSING_CATALOG: "missing-catalog",
});

export const TESTED_PRODUCER = Object.freeze({
  repo: PIN.producer.repo,
  ref: PIN.producer.ref,
  sha: F08_TESTED_SHA,
  cli: PIN.producer.cli,
});

export function analysisFromReceipt(receipt) {
  const er = receipt && typeof receipt === "object" ? receipt.engineResult : null;
  if (!er || typeof er !== "object" || Array.isArray(er)) {
    return { analysisOk: null, analysisStatus: null, analysisRefused: false };
  }
  return {
    analysisOk: er.ok !== false,
    analysisStatus: typeof er.status === "string" ? er.status : null,
    analysisRefused: er.refused === true,
  };
}

export function engineArchiveFromReceipt(receipt) {
  const engine = receipt && typeof receipt === "object" ? receipt.engine : null;
  if (!engine || typeof engine !== "object" || Array.isArray(engine)) {
    return { sha256: null, bytes: null };
  }
  return {
    sha256: engine.archiveSha256 || engine.archive?.sha256 || null,
    bytes: engine.archiveBytes ?? engine.archive?.bytes ?? null,
  };
}

export function expectedEngineArchive(options = {}) {
  const sha =
    options.expectedArchiveSha256 !== undefined
      ? options.expectedArchiveSha256
      : PIN.archive.sha256;
  const bytes =
    options.expectedArchiveBytes !== undefined ? options.expectedArchiveBytes : PIN.archive.bytes;
  return { sha256: sha, bytes };
}

export function engineOriginMatches(claimed, expected) {
  const claimedSha = normalizeSha256(claimed.sha256);
  const expectedSha = normalizeSha256(expected.sha256);
  if (!claimedSha || !expectedSha || claimedSha !== expectedSha) return false;
  if (expected.bytes != null && Number(claimed.bytes) !== Number(expected.bytes)) return false;
  return true;
}
