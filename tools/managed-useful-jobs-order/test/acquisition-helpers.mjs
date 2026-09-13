import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileStore } from "../lib/store-file.mjs";
import { createAcquisitionService, createForbiddenSeamSpies } from "../lib/acquisition.mjs";
import {
  digestNamedOutputs,
  hashFrozenRequestV1,
  hashReceiptProjection,
} from "../lib/acquisition-identity.mjs";
import { MANAGED_ORDER_TERMS_SCHEMA } from "../lib/acquisition-constants.mjs";

export const SERVER_NOW = "2026-09-13T12:00:00Z";
export const SERVER_LATER = "2026-09-13T18:00:00Z";
export const SERVER_EXPIRED = "2026-09-14T12:00:01Z";
export const PRINCIPAL_A = "principal-a";
export const PRINCIPAL_B = "principal-b";

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function tmpDir(prefix = "ha1-") {
  return mkdtempSync(join(process.env.TMPDIR || tmpdir(), prefix));
}

export function pairFor(jobId = "lockfile-pin-delta", tag = "ok") {
  const names =
    jobId === "vendor-budget-impact"
      ? ["budget-impact.json", "budget-impact.md"]
      : ["pin-delta.json", "pin-delta.md"];
  const bodies = [
    Buffer.from(`{"job":${JSON.stringify(jobId)},"tag":${JSON.stringify(tag)}}\n`),
    Buffer.from(`# ${jobId} ${tag}\n`),
  ];
  const outputs = names.map((name, i) => ({
    name,
    kind: "file",
    bytes: bodies[i].length,
    sha256: sha256(bodies[i]),
  }));
  const files = outputs.map((metadata, i) => ({ metadata, bytes: new Uint8Array(bodies[i]) }));
  return { jobId, names, bodies, outputs, files, outputsDigest: digestNamedOutputs(outputs) };
}

export function frozenHash(jobId = "lockfile-pin-delta", tag = "in") {
  return hashFrozenRequestV1({
    jobId,
    inputs: [
      { flag: "--before", sha256: sha256(Buffer.from(`before:${tag}`)), bytes: 8 + tag.length },
      { flag: "--after", sha256: sha256(Buffer.from(`after:${tag}`)), bytes: 7 + tag.length },
    ],
  });
}

export function termsHash(tag = "terms") {
  return sha256(Buffer.from(`terms:${tag}`));
}

export function availableResult({
  principalId = PRINCIPAL_A,
  executionId,
  requestHash,
  jobId = "lockfile-pin-delta",
  pair,
  sample = false,
  expiresAt = "2026-09-14T12:00:00Z",
} = {}) {
  const receipt = {
    schema: "samedaydesk.paid-useful-jobs.receipt.v1",
    jobId,
    executionId,
    sample,
    outputs: pair.outputs,
    outputsDigest: pair.outputsDigest,
  };
  return {
    state: "available",
    principalId,
    executionId,
    requestHash,
    jobId,
    receiptSha256: hashReceiptProjection(receipt, { executionId, jobId }),
    outputsDigest: pair.outputsDigest,
    outputs: pair.outputs,
    termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
    sample,
    expiresAt,
    purchaseAuthority: false,
    sold: false,
  };
}

export async function fileService(options = {}) {
  const dir = options.dir || tmpDir("ha1-file-");
  const store = createFileStore(dir, { maxAdmissions: options.maxAdmissions });
  const seams = options.seams || createForbiddenSeamSpies();
  const service = createAcquisitionService({
    store,
    artifactRoot: store.artifactRoot,
    maxAdmissions: options.maxAdmissions,
    maxConcurrentReads: options.maxConcurrentReads || 4,
    openTimeoutMs: options.openTimeoutMs || 30_000,
    clock: options.clock || null,
    forbiddenSeams: seams.spies,
  });
  return { dir, store, service, reader: service.reader, writer: service.writer, seams };
}

export async function admitAndPublish(service, overrides = {}) {
  const jobId = overrides.jobId || "lockfile-pin-delta";
  const executionId = overrides.executionId || `exec-${randomUUID()}`;
  const requestHash = overrides.requestHash || frozenHash(jobId, executionId);
  const pair = overrides.pair || pairFor(jobId, executionId.slice(0, 8));
  const principalId = overrides.principalId || PRINCIPAL_A;
  const createdAt = overrides.createdAt || SERVER_NOW;
  await service.admit({
    principalId,
    executionId,
    requestHash,
    managedOrderTermsHash: overrides.managedOrderTermsHash || termsHash(executionId),
    jobId,
    termsVersion: MANAGED_ORDER_TERMS_SCHEMA,
    sample: Boolean(overrides.sample),
    createdAt,
    serverNow: createdAt,
    orderId: overrides.orderId || `ord-${executionId}`,
  });
  const result = availableResult({
    principalId,
    executionId,
    requestHash,
    jobId,
    pair,
    sample: Boolean(overrides.sample),
    expiresAt: overrides.expiresAt,
  });
  const outcome = await service.publishCompleted(result, pair.files);
  return { executionId, requestHash, pair, result, outcome, principalId, jobId };
}

export function writeTempInputs() {
  const dir = tmpDir("ha1-in-");
  const before = Buffer.from('{"lockfileVersion":3,"packages":{"":{}}}\n');
  const after = Buffer.from('{"lockfileVersion":3,"packages":{"":{},"a":{"version":"1.0.0"}}}\n');
  const beforePath = join(dir, "before.json");
  const afterPath = join(dir, "after.json");
  writeFileSync(beforePath, before);
  writeFileSync(afterPath, after);
  return {
    dir,
    beforePath,
    afterPath,
    before,
    after,
    request: {
      engineId: "lockfile-pin-delta",
      orderId: `ord-ha1-${randomUUID().slice(0, 8)}`,
      archiveSha256: "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51",
      archiveBytes: 2522418,
      enginePin: {
        sha256: "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51",
        bytes: 2522418,
        version: "1.0.0",
      },
      example: false,
      sold: false,
      purchaseAuthority: false,
      fundingState: "unfunded",
      inputs: [
        { flag: "--before", path: beforePath, sha256: sha256(before), bytes: before.length },
        { flag: "--after", path: afterPath, sha256: sha256(after), bytes: after.length },
      ],
    },
  };
}

export function snapshotSeamCalls(seams) {
  return { ...seams.calls };
}

export function unchanged(before, after) {
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) return false;
  }
  return true;
}

export { createForbiddenSeamSpies };
