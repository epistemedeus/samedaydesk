/**
 * Input and artifact validation for the work board.
 * Artifact URLs follow the correspondence service rule: https only, no credentials.
 */

import { ERROR_CODES, EVENT_KINDS, FUNDING_CLASS, JOB_STATUS } from "./constants.mjs";

const TITLE_MAX = 160;
const TEXT_MAX = 8000;
const URL_MAX = 2048;
const LABEL_MAX = 200;
const ID_MAX = 120;

export function boardError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function requireString(value, field, { max = TEXT_MAX, min = 1 } = {}) {
  if (typeof value !== "string") {
    throw boardError(ERROR_CODES.invalid_input, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw boardError(ERROR_CODES.invalid_input, `${field} length must be ${min}..${max}`);
  }
  return trimmed;
}

export function requireId(value, field = "id") {
  return requireString(value, field, { max: ID_MAX, min: 1 });
}

export function requireVersion(value, field = "expectedVersion") {
  if (!Number.isInteger(value) || value < 1) {
    throw boardError(ERROR_CODES.invalid_input, `${field} must be a positive integer`);
  }
  return value;
}

export function validateArtifact(artifact, { required = true } = {}) {
  if (artifact == null) {
    if (required) throw boardError(ERROR_CODES.missing_artifact, "completion artifact is required");
    return null;
  }
  if (typeof artifact !== "object" || Array.isArray(artifact)) {
    throw boardError(ERROR_CODES.invalid_artifact, "artifact must be an object");
  }
  const url = requireString(artifact.url, "artifact.url", { max: URL_MAX });
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw boardError(ERROR_CODES.invalid_artifact, "artifact.url must be an https URL");
  }
  if (parsed.protocol !== "https:") {
    throw boardError(ERROR_CODES.invalid_artifact, "artifact.url must be an https URL");
  }
  if (parsed.username || parsed.password) {
    throw boardError(ERROR_CODES.invalid_artifact, "artifact.url must not embed credentials");
  }
  const out = { url: parsed.href };
  if (artifact.label != null) {
    out.label = requireString(artifact.label, "artifact.label", { max: LABEL_MAX });
  }
  if (artifact.digest != null) {
    out.digest = requireString(artifact.digest, "artifact.digest", { max: 128 });
  }
  return out;
}

export function validateFundingClass(value) {
  const funding = requireString(value, "fundingClass", { max: 32 });
  if (!Object.values(FUNDING_CLASS).includes(funding)) {
    throw boardError(ERROR_CODES.unsupported_funding, `unsupported fundingClass: ${funding}`);
  }
  return funding;
}

export function validateJobRecord(job) {
  if (!job || typeof job !== "object") {
    throw boardError(ERROR_CODES.invalid_input, "job must be an object");
  }
  const id = requireId(job.id, "job.id");
  const title = requireString(job.title, "job.title", { max: TITLE_MAX });
  const brief = requireString(job.brief, "job.brief");
  const deliverableContract = requireString(job.deliverableContract, "job.deliverableContract");
  if (!Array.isArray(job.acceptanceEvidence) || job.acceptanceEvidence.length < 1) {
    throw boardError(ERROR_CODES.invalid_input, "job.acceptanceEvidence must be a non-empty array");
  }
  const acceptanceEvidence = job.acceptanceEvidence.map((item, index) =>
    requireString(item, `job.acceptanceEvidence[${index}]`, { max: 500 }),
  );
  const fundingClass = validateFundingClass(job.fundingClass);
  if (fundingClass === FUNDING_CLASS.demonstration && !/demonstrat/i.test(`${title} ${brief} ${job.label || ""}`)) {
    // Soft honesty: demos must be labelled in title, brief, or label field.
    if (!job.label || !/demonstrat|fictional|unfunded|demo/i.test(job.label)) {
      throw boardError(
        ERROR_CODES.invalid_input,
        "demonstration jobs must be labelled as demonstration/fictional/unfunded in title, brief, or label",
      );
    }
  }
  if (fundingClass === FUNDING_CLASS.external) {
    if (!job.externalLink) {
      throw boardError(ERROR_CODES.invalid_input, "external jobs require externalLink");
    }
    validateArtifact({ url: job.externalLink, label: "external opportunity" }, { required: true });
  }
  const status = job.status || JOB_STATUS.open;
  if (!Object.values(JOB_STATUS).includes(status)) {
    throw boardError(ERROR_CODES.invalid_input, `invalid job.status: ${status}`);
  }
  return {
    id,
    title,
    brief,
    deliverableContract,
    acceptanceEvidence,
    fundingClass,
    label: job.label ? requireString(job.label, "job.label", { max: LABEL_MAX }) : null,
    externalLink: job.externalLink || null,
    status,
    version: requireVersion(job.version ?? 1, "job.version"),
    correspondenceProjectHint: job.correspondenceProjectHint
      ? requireString(job.correspondenceProjectHint, "job.correspondenceProjectHint", { max: ID_MAX })
      : null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
  };
}

export function assertEventKind(kind) {
  if (!Object.values(EVENT_KINDS).includes(kind)) {
    throw boardError(ERROR_CODES.invalid_input, `unsupported event kind: ${kind}`);
  }
  return kind;
}

export function clone(value) {
  return structuredClone(value);
}
