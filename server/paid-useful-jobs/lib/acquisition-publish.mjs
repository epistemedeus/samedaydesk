/**
 * Private HTTP POST → HA1 admit/publish adapter. Same store as HA2 reads.
 * No payment rail and no parallel acquisition store.
 */
import { readFileSync } from "node:fs";
import {
  FROZEN_REQUEST_HASH_VERSION,
  HA1_JOB_IDS,
  MANAGED_ORDER_TERMS_SCHEMA,
} from "../../../tools/managed-useful-jobs-order/lib/acquisition-constants.mjs";
import {
  digestNamedOutputs,
  hashFrozenRequestV1,
  hashHttpRequestAcquisitionV1,
  hashPublicationIdentityV1,
  hashReceiptProjection,
  namedOutputsProjection,
  publicationIdentityV1,
} from "../../../tools/managed-useful-jobs-order/lib/acquisition-identity.mjs";

export function canPublishJob(jobId) {
  return HA1_JOB_IDS.includes(jobId);
}

export function httpRequestHash(frozen) {
  return hashHttpRequestAcquisitionV1(frozen.jobId, frozen.inputs);
}

export async function admitHttpAcquisition({ writer, frozen, principalId, clock }) {
  if (!writer || typeof writer.admit !== "function") {
    throw new Error("HA1 writer.admit is required to admit an HTTP execution");
  }
  const requestHash = httpRequestHash(frozen);
  const serverNow = typeof clock === "function" ? clock() : clock;
  const admitted = await writer.admit({
    principalId,
    executionId: frozen.executionId,
    requestHash,
    managedOrderTermsHash: null,
    jobId: frozen.jobId,
    termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
    createdAt: serverNow,
    serverNow,
  });
  return { admitted, requestHash, serverNow };
}

export async function publishHttpAcquisition({
  writer,
  frozen,
  principalId,
  result,
  requestHash,
  expiresAt,
}) {
  if (!writer || typeof writer.publishCompleted !== "function") {
    throw new Error("HA1 writer.publishCompleted is required to publish an HTTP execution");
  }
  const outputs = namedOutputsProjection(
    (result.outputs || []).map((row) => ({
      name: row.name,
      kind: row.kind || "file",
      bytes: row.bytes,
      sha256: row.sha256,
    })),
  );
  const files = outputs.map((meta) => {
    const row = (result.outputs || []).find((item) => item && item.name === meta.name);
    if (!row?.path) {
      throw new Error(`completed output ${meta.name} is missing a readable path`);
    }
    const buf = readFileSync(row.path);
    if (buf.length !== meta.bytes) {
      throw new Error(`completed output ${meta.name} byte count does not match the receipt tuple`);
    }
    return { metadata: { ...meta, kind: "file" }, bytes: buf };
  });
  const receiptSha256 = hashReceiptProjection(result.receipt || result, {
    executionId: frozen.executionId,
    jobId: frozen.jobId,
  });
  const outputsDigest = digestNamedOutputs(outputs);
  await writer.publishCompleted(
    {
      state: "available",
      principalId,
      executionId: frozen.executionId,
      requestHash,
      jobId: frozen.jobId,
      receiptSha256,
      outputsDigest,
      outputs,
      termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
      sample: Boolean(result.sample),
      expiresAt,
      purchaseAuthority: false,
      sold: false,
    },
    files,
  );
  const publication = publicationIdentityV1({
    executionId: frozen.executionId,
    jobId: frozen.jobId,
    requestHash,
    requestHashVersion: FROZEN_REQUEST_HASH_VERSION,
    receiptSha256,
    outputsDigest,
    outputs,
  });
  return {
    requestHash,
    requestHashVersion: FROZEN_REQUEST_HASH_VERSION,
    receiptSha256,
    outputsDigest,
    publicationIdentitySha256: hashPublicationIdentityV1(publication),
    publication,
  };
}

export { hashFrozenRequestV1, hashHttpRequestAcquisitionV1, hashPublicationIdentityV1 };
