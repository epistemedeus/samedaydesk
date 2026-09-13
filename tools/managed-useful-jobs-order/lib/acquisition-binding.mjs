import {
  ARTIFACT_BASENAME_RE,
  EXECUTION_ID_RE,
  HA1_JOB_IDS,
  PRINCIPAL_ID_RE,
  PROMISED_OUTPUTS,
  SHA256_RE,
} from "./acquisition-constants.mjs";
import { acquisitionRefuse } from "./acquisition-errors.mjs";

const UNTRUSTED_PRINCIPAL_KEYS = [
  "principalId",
  "principal",
  "bearerToken",
  "authorization",
  "accessToken",
  "token",
];

export function assertSha256(value, label = "sha256") {
  const hex = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (!SHA256_RE.test(hex)) {
    throw acquisitionRefuse("invalid-binding", `${label} must be 64 lowercase hex characters`, {
      detail: { label },
    });
  }
  return hex;
}

export function assertExecutionId(value) {
  if (typeof value !== "string" || !EXECUTION_ID_RE.test(value) || value === "." || value === "..") {
    throw acquisitionRefuse(
      "invalid-binding",
      "executionId must be 1-128 characters matching execution.v1 grammar",
    );
  }
  return value;
}

export function assertPrincipalId(value) {
  if (typeof value !== "string" || !PRINCIPAL_ID_RE.test(value)) {
    throw acquisitionRefuse(
      "untrusted-principal",
      "principalId must be a stable application identity, not a token string",
    );
  }
  if (/bearer/i.test(value) || value.includes(" ") || value.includes("=")) {
    throw acquisitionRefuse(
      "untrusted-principal",
      "principalId looks like a bearer token or header; raw Authorization is not an identity provider",
    );
  }
  return value;
}

export function assertJobId(value) {
  if (!HA1_JOB_IDS.includes(value)) {
    throw acquisitionRefuse("invalid-binding", "jobId must be lockfile-pin-delta or vendor-budget-impact", {
      detail: { jobId: value },
    });
  }
  return value;
}

export function promisedNames(jobId) {
  return PROMISED_OUTPUTS[assertJobId(jobId)];
}

export function assertRetrievalBinding(binding) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    throw acquisitionRefuse("invalid-binding", "retrieval binding must be an object");
  }
  return {
    principalId: assertPrincipalId(binding.principalId),
    executionId: assertExecutionId(binding.executionId),
    requestHash: assertSha256(binding.requestHash, "requestHash"),
  };
}

export function assertTrustedAuth(auth) {
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) {
    throw acquisitionRefuse(
      "untrusted-principal",
      "hosted acquisition requires trusted application authentication context",
    );
  }
  if (auth.source !== "trusted-application-context") {
    throw acquisitionRefuse(
      "untrusted-principal",
      "principal must come from trusted application authentication context, not a request header or body",
    );
  }
  return assertPrincipalId(auth.principalId);
}

export function refuseUntrustedRequestFields(raw) {
  if (!raw || typeof raw !== "object") return;
  for (const key of UNTRUSTED_PRINCIPAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] != null && raw[key] !== "") {
      throw acquisitionRefuse(
        "untrusted-principal",
        "token string or request-body principal is not trusted",
        { detail: { key } },
      );
    }
  }
  for (const key of ["serverNow", "clock", "now", "expiresAt", "createdAt"]) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] != null && raw[key] !== "") {
      throw acquisitionRefuse(
        "untrusted-clock",
        "request-supplied clock cannot authorize access or persist expiry",
        { detail: { key } },
      );
    }
  }
}

/**
 * Parse the caller-supplied artifact name before any URL normalization.
 * Only exact catalog-promised basenames are accepted.
 */
export function assertArtifactName(rawName, jobId) {
  if (typeof rawName !== "string") {
    throw acquisitionRefuse("invalid-name", "artifact name must be a string");
  }
  if (rawName.length === 0 || rawName.length > 128) {
    throw acquisitionRefuse("invalid-name", "artifact name is empty or too long");
  }
  if (rawName.includes("\0") || /[\u0000-\u001f]/.test(rawName)) {
    throw acquisitionRefuse("invalid-name", "artifact name contains NUL or control characters");
  }
  if (rawName.includes("/") || rawName.includes("\\") || rawName.includes("\u2215")) {
    throw acquisitionRefuse("invalid-name", "artifact name must not contain path separators");
  }
  if (rawName.includes("?") || rawName.includes("#") || rawName.includes("&") || rawName.includes("=")) {
    throw acquisitionRefuse("invalid-name", "artifact name must not contain query or fragment aliases");
  }
  if (rawName.includes("%")) {
    throw acquisitionRefuse("invalid-name", "artifact name must not use percent-encoding aliases");
  }
  if (rawName.includes("..") || rawName === "." || rawName.startsWith("./") || rawName.startsWith(".\\")) {
    throw acquisitionRefuse("invalid-name", "artifact name must not contain traversal segments");
  }
  if (rawName.startsWith("/") || rawName.startsWith("\\") || /^[A-Za-z]:/.test(rawName) || rawName.startsWith("//") || rawName.startsWith("\\\\")) {
    throw acquisitionRefuse("invalid-name", "artifact name must not be absolute, drive, or UNC");
  }
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    throw acquisitionRefuse("invalid-name", "artifact name is malformed encoding");
  }
  if (decoded !== rawName) {
    throw acquisitionRefuse("invalid-name", "artifact name must be a single canonical encoding");
  }
  if (!ARTIFACT_BASENAME_RE.test(rawName)) {
    throw acquisitionRefuse("invalid-name", "artifact name is not a canonical basename");
  }
  const allowed = promisedNames(jobId);
  if (!allowed.includes(rawName)) {
    throw acquisitionRefuse("invalid-name", "artifact name is not a promised output for this job", {
      detail: { name: rawName, allowed: [...allowed] },
    });
  }
  return rawName;
}
