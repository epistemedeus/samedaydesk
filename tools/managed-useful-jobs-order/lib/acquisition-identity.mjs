import { createHash } from "node:crypto";
import {
  ACQUISITION_SCHEMA,
  FROZEN_REQUEST_HASH_VERSION,
  HA1_JOB_IDS,
  MANAGED_ORDER_TERMS_SCHEMA,
  MAX_FILE_BYTES,
  MAX_METADATA_BYTES,
  MAX_OUTPUT_FILES,
  MAX_TOTAL_BYTES,
  PROMISED_OUTPUTS,
  REQUEST_HASH_ALGORITHM,
} from "./acquisition-constants.mjs";
import { acquisitionRefuse } from "./acquisition-errors.mjs";
import { assertJobId, assertSha256, promisedNames } from "./acquisition-binding.mjs";

export function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(String(text), "utf8"));
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

/**
 * Versioned frozen request + input byte identities. Distinct from managed-order
 * termsHash (orderId + engine pin) and from the HTTP frozen-request hash unless
 * an explicit hashesReconciled flag records that canonicalization was reconciled.
 */
export function hashFrozenRequestV1({ jobId, inputs }) {
  assertJobId(jobId);
  const rows = (inputs || [])
    .filter((inp) => inp && inp.kind !== "directory")
    .map((inp) => ({
      flag: inp.flag,
      sha256: assertSha256(inp.sha256, `${inp.flag} sha256`),
      bytes: inp.bytes,
    }))
    .sort((a, b) => a.flag.localeCompare(b.flag));
  return sha256Text(
    stableStringify({
      schema: FROZEN_REQUEST_HASH_VERSION,
      algorithm: REQUEST_HASH_ALGORITHM,
      jobId,
      inputs: rows,
    }),
  );
}

export function namedOutputsProjection(outputs) {
  return [...(outputs || [])]
    .map((row) => ({
      name: row.name,
      kind: row.kind || "file",
      bytes: row.bytes,
      sha256: assertSha256(row.sha256, `${row.name} sha256`),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Existing named-byte projection: name/kind/bytes/sha256, no absolute path. */
export function digestNamedOutputs(outputs) {
  const rows = namedOutputsProjection(outputs);
  return sha256Text(JSON.stringify(rows));
}

export function hashReceiptProjection(receipt, { executionId, jobId } = {}) {
  const outputs = namedOutputsProjection(receipt?.outputs || []);
  return sha256Text(
    stableStringify({
      schema: receipt?.schema || receipt?.contract || null,
      jobId: receipt?.jobId || jobId || null,
      executionId: receipt?.executionId ?? executionId ?? null,
      sample: Boolean(receipt?.sample),
      outputs,
      outputsDigest: receipt?.outputsDigest || digestNamedOutputs(outputs),
    }),
  );
}

export function assertNamedOutputsForJob(jobId, outputs) {
  const promised = promisedNames(jobId);
  if (!Array.isArray(outputs) || outputs.length !== promised.length || outputs.length > MAX_OUTPUT_FILES) {
    throw acquisitionRefuse("oversize", "result must include exactly the promised output files", {
      detail: { count: outputs?.length ?? null, promised: [...promised] },
    });
  }
  const names = new Set();
  let total = 0;
  const projected = [];
  for (const row of outputs) {
    if (!row || typeof row !== "object") {
      throw acquisitionRefuse("integrity-failed", "output tuple is missing");
    }
    if ((row.kind || "file") !== "file") {
      throw acquisitionRefuse("integrity-failed", "output kind must be file");
    }
    if (typeof row.name !== "string" || !promised.includes(row.name) || names.has(row.name)) {
      throw acquisitionRefuse("integrity-failed", "output name is not a unique promised basename");
    }
    names.add(row.name);
    if (!Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > MAX_FILE_BYTES) {
      throw acquisitionRefuse("oversize", "per-file byte bound exceeded", {
        detail: { name: row.name, bytes: row.bytes, max: MAX_FILE_BYTES },
      });
    }
    total += row.bytes;
    if (total > MAX_TOTAL_BYTES) {
      throw acquisitionRefuse("oversize", "total output byte bound exceeded", {
        detail: { total, max: MAX_TOTAL_BYTES },
      });
    }
    projected.push({
      name: row.name,
      kind: "file",
      bytes: row.bytes,
      sha256: assertSha256(row.sha256, `${row.name} sha256`),
    });
  }
  if (names.size !== promised.length || promised.some((name) => !names.has(name))) {
    throw acquisitionRefuse("integrity-failed", "outputs do not match the promised catalog names");
  }
  return namedOutputsProjection(projected);
}

export function assertVerifiedFiles(outputs, verifiedFiles) {
  if (!Array.isArray(verifiedFiles) || verifiedFiles.length !== outputs.length) {
    throw acquisitionRefuse("integrity-failed", "verified files must exactly match the output tuples");
  }
  const byName = new Map();
  for (const file of verifiedFiles) {
    const meta = file?.metadata;
    if (!meta || byName.has(meta.name)) {
      throw acquisitionRefuse("integrity-failed", "verified file metadata is missing or duplicated");
    }
    const bytes = file.bytes instanceof Uint8Array ? Buffer.from(file.bytes) : Buffer.from(file.bytes || []);
    if (bytes.length !== meta.bytes || sha256Bytes(bytes) !== meta.sha256) {
      throw acquisitionRefuse("integrity-failed", "verified bytes do not match the named output tuple", {
        detail: { name: meta.name },
      });
    }
    const expected = outputs.find((row) => row.name === meta.name);
    if (!expected || expected.bytes !== meta.bytes || expected.sha256 !== meta.sha256 || (meta.kind || "file") !== "file") {
      throw acquisitionRefuse("integrity-failed", "verified metadata does not match committed outputs");
    }
    byName.set(meta.name, { metadata: { ...expected, kind: "file" }, bytes });
  }
  return outputs.map((row) => byName.get(row.name));
}

export function sameAdmissionIdentity(a, b) {
  return (
    a?.principalId === b?.principalId &&
    a?.executionId === b?.executionId &&
    a?.requestHash === b?.requestHash &&
    a?.requestHashVersion === b?.requestHashVersion &&
    a?.requestHashAlgorithm === b?.requestHashAlgorithm &&
    a?.jobId === b?.jobId &&
    a?.managedOrderTermsHash === b?.managedOrderTermsHash &&
    a?.managedOrderTermsSchema === b?.managedOrderTermsSchema &&
    a?.termsVersion === b?.termsVersion &&
    Boolean(a?.sample) === Boolean(b?.sample)
  );
}

export function samePublicationIdentity(a, b) {
  return (
    sameAdmissionIdentity(a, b) &&
    a?.receiptSha256 === b?.receiptSha256 &&
    a?.outputsDigest === b?.outputsDigest &&
    stableStringify(a?.outputs || []) === stableStringify(b?.outputs || [])
  );
}

export function publicAvailableResult(record) {
  return {
    state: "available",
    principalId: record.principalId,
    executionId: record.executionId,
    requestHash: record.requestHash,
    jobId: record.jobId,
    receiptSha256: record.receiptSha256,
    outputsDigest: record.outputsDigest,
    outputs: namedOutputsProjection(record.outputs),
    termsVersion: record.termsVersion,
    sample: Boolean(record.sample),
    expiresAt: record.expiresAt,
    purchaseAuthority: false,
    sold: false,
  };
}

export function assertAvailableResult(result) {
  if (!result || result.state !== "available") {
    throw acquisitionRefuse("invalid-binding", "publishCompleted requires state available");
  }
  if (result.purchaseAuthority !== false || result.sold !== false) {
    throw acquisitionRefuse("integrity-failed", "purchaseAuthority and sold must stay false");
  }
  if (!HA1_JOB_IDS.includes(result.jobId)) {
    throw acquisitionRefuse("invalid-binding", "jobId is outside HA1 scope");
  }
  const outputs = assertNamedOutputsForJob(result.jobId, result.outputs);
  const outputsDigest = digestNamedOutputs(outputs);
  if (result.outputsDigest && result.outputsDigest !== outputsDigest) {
    throw acquisitionRefuse("integrity-failed", "outputsDigest does not match the named-byte projection");
  }
  const json = JSON.stringify(publicAvailableResult({ ...result, outputs, outputsDigest }));
  if (Buffer.byteLength(json) > MAX_METADATA_BYTES) {
    throw acquisitionRefuse("oversize", "result metadata exceeds 64 KiB");
  }
  return {
    ...result,
    outputs,
    outputsDigest,
    purchaseAuthority: false,
    sold: false,
  };
}

export function newAdmissionRecord({
  principalId,
  executionId,
  requestHash,
  requestHashVersion = FROZEN_REQUEST_HASH_VERSION,
  requestHashAlgorithm = REQUEST_HASH_ALGORITHM,
  managedOrderTermsHash,
  managedOrderTermsSchema = MANAGED_ORDER_TERMS_SCHEMA,
  hashesReconciled = false,
  jobId,
  termsVersion,
  sample = false,
  createdAt,
  expiresAt,
  orderId = null,
}) {
  if (hashesReconciled !== true && requestHashVersion === MANAGED_ORDER_TERMS_SCHEMA) {
    throw acquisitionRefuse(
      "identity-conflict",
      "HTTP-request and managed-order hashes stay distinct unless versioned canonicalization is explicitly reconciled",
    );
  }
  return {
    schema: ACQUISITION_SCHEMA,
    principalId,
    executionId,
    requestHash,
    requestHashVersion,
    requestHashAlgorithm,
    managedOrderTermsHash: managedOrderTermsHash || null,
    managedOrderTermsSchema,
    hashesReconciled: hashesReconciled === true,
    jobId: assertJobId(jobId),
    termsVersion: String(termsVersion || MANAGED_ORDER_TERMS_SCHEMA),
    sample: Boolean(sample),
    receiptSha256: null,
    outputsDigest: null,
    outputs: null,
    state: "pending",
    createdAt,
    expiresAt,
    purchaseAuthority: false,
    sold: false,
    bytesPurged: false,
    orderId,
  };
}

export { PROMISED_OUTPUTS };
