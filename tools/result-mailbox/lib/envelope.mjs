import { ENVELOPE_SCHEMA, REQUEST_ID_RE, SCHEMA_VERSION, SHA256_HEX_RE } from "./pins.mjs";
import { artifactsDigest } from "./digest.mjs";
import { isPlainObject, refuse } from "./errors.mjs";
import { parseClock } from "./expiry.mjs";
import { MAILBOX_TERMS_VERSION, assertTermsVersion } from "./terms.mjs";
import { sampleBlocksBuyerDelivery } from "./sample.mjs";

export function assertRequestId(requestId) {
  if (typeof requestId !== "string" || !REQUEST_ID_RE.test(requestId)) {
    throw refuse(
      "invalid-request-id",
      "requestId must be 1-128 chars of A-Za-z0-9._- (no path separators)",
    );
  }
  return requestId;
}

export function buildEnvelope({
  requestId,
  jobId,
  completedAt,
  expiresAt,
  sample = false,
  sampleReasons = [],
  deliveredToBuyer = false,
  artifacts,
  engine = null,
  engineResult = null,
  payment = null,
}) {
  const id = assertRequestId(requestId);
  if (typeof jobId !== "string" || !jobId) {
    throw refuse("invalid-job-id", "jobId is required");
  }
  parseClock(completedAt, "completedAt");
  parseClock(expiresAt, "expiresAt");
  if (!Array.isArray(artifacts) || artifacts.length < 1) {
    throw refuse("missing-artifacts", "envelope requires at least one artifact");
  }
  const listed = artifacts.map((a) => {
    if (!isPlainObject(a) || typeof a.name !== "string" || !a.name) {
      throw refuse("invalid-artifact", "artifact name is required");
    }
    if (a.name.includes("/") || a.name.includes("\\") || a.name === ".." || a.name === ".") {
      throw refuse("invalid-artifact", `artifact name is not a basename: ${a.name}`);
    }
    if (!Number.isSafeInteger(a.bytes) || a.bytes < 0) {
      throw refuse("invalid-artifact", `artifact ${a.name} bytes must be a non-negative integer`);
    }
    if (typeof a.sha256 !== "string" || !SHA256_HEX_RE.test(a.sha256)) {
      throw refuse("invalid-artifact", `artifact ${a.name} sha256 must be 64 lowercase hex`);
    }
    return { name: a.name, bytes: a.bytes, sha256: a.sha256 };
  });

  const isSample = Boolean(sample);
  if (sampleBlocksBuyerDelivery(isSample, deliveredToBuyer)) {
    throw refuse(
      "sample-not-delivered",
      "SAMPLE envelopes cannot be labelled delivered-to-buyer",
      { status: "sample-not-delivered" },
    );
  }

  return {
    schema: ENVELOPE_SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    termsVersion: MAILBOX_TERMS_VERSION,
    termsRevision: 0,
    requestId: id,
    jobId,
    completedAt,
    expiresAt,
    sample: isSample,
    sampleReasons: [...sampleReasons],
    deliveredToBuyer: false,
    purchaseAuthority: false,
    sold: false,
    liveSettlement: "out-of-scope",
    payment: {
      class: "nonsettling-prototype",
      fixture: payment?.fixture !== false,
      purchaseAuthority: false,
      liveSettleAttempted: false,
      liveSettleAllowed: false,
    },
    engine: engine
      ? {
          package: engine.package,
          version: engine.version,
          cli: engine.cli,
          archiveSha256: engine.archiveSha256,
          archiveBytes: engine.archiveBytes,
          purchaseAuthority: false,
        }
      : null,
    engineResult: engineResult
      ? {
          ok: engineResult.ok !== false,
          status: engineResult.status || null,
          digest: engineResult.digest || null,
        }
      : null,
    artifacts: listed,
    artifactsDigest: artifactsDigest(listed),
  };
}

export function parseEnvelope(value) {
  if (!isPlainObject(value)) {
    throw refuse("invalid-envelope", "envelope must be a JSON object");
  }
  if (value.schema !== ENVELOPE_SCHEMA) {
    throw refuse("invalid-envelope", `envelope schema must be ${ENVELOPE_SCHEMA}`);
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw refuse("invalid-envelope", `schemaVersion must be integer ${SCHEMA_VERSION}`);
  }
  if (typeof value.schemaVersion !== "number" || !Number.isInteger(value.schemaVersion)) {
    throw refuse("invalid-envelope", "schemaVersion must be an integer shape version");
  }
  assertTermsVersion(value.termsVersion);
  if (
    value.termsRevision != null &&
    (typeof value.termsRevision !== "number" ||
      !Number.isInteger(value.termsRevision) ||
      value.termsRevision < 0)
  ) {
    throw refuse("invalid-envelope", "termsRevision must be a non-negative integer correction counter");
  }
  assertRequestId(value.requestId);
  if (typeof value.jobId !== "string" || !value.jobId) {
    throw refuse("invalid-envelope", "jobId is required");
  }
  parseClock(value.completedAt, "completedAt");
  parseClock(value.expiresAt, "expiresAt");
  if (!Array.isArray(value.artifacts) || value.artifacts.length < 1) {
    throw refuse("missing-artifacts", "envelope requires at least one artifact");
  }
  const sample = value.sample === true;
  if (sampleBlocksBuyerDelivery(sample, value.deliveredToBuyer === true)) {
    throw refuse(
      "sample-not-delivered",
      "SAMPLE envelopes cannot be labelled delivered-to-buyer",
      { status: "sample-not-delivered" },
    );
  }
  if (value.purchaseAuthority === true || value.sold === true) {
    throw refuse("sale-not-available", "mailbox envelopes cannot claim a sale or purchase authority");
  }
  for (const a of value.artifacts) {
    if (!isPlainObject(a) || typeof a.name !== "string" || a.name.includes("/") || a.name.includes("\\")) {
      throw refuse("invalid-artifact", "artifact name must be a basename");
    }
    if (!Number.isSafeInteger(a.bytes) || a.bytes < 0) {
      throw refuse("invalid-artifact", `artifact ${a.name} bytes invalid`);
    }
    if (typeof a.sha256 !== "string" || !SHA256_HEX_RE.test(a.sha256)) {
      throw refuse("invalid-artifact", `artifact ${a.name} sha256 must be 64 lowercase hex`);
    }
  }
  const expectedDigest = artifactsDigest(value.artifacts);
  if (value.artifactsDigest && value.artifactsDigest !== expectedDigest) {
    throw refuse("invalid-artifact", "envelope artifactsDigest does not match listed artifacts");
  }
  return value;
}
