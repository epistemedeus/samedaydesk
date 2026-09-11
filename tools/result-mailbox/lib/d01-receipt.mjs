import { readFileSync } from "node:fs";
import { refuse, isPlainObject } from "./errors.mjs";
import { D01_RECEIPT_PIN, D01_RECEIPT_PR, D01_RECEIPT_SCHEMA } from "./pins.mjs";
import { seedFromOutDir } from "./seed.mjs";

export const D01_RESULT_CONTRACT = Object.freeze({
  owner: "W5-D01",
  repo: "epistemedeus/samedaydesk",
  sha: D01_RECEIPT_PIN,
  pr: D01_RECEIPT_PR,
  ref: "fable/f08-paid-wrappers",
  schema: D01_RECEIPT_SCHEMA,
  note: "Current pinned PR52 receipt. Mailbox maps receipt+outDir to an envelope and does not import wrapper.mjs. D01 may amend; do not claim a later wrapper.",
});

export function assertD01Receipt(receipt) {
  if (!isPlainObject(receipt)) {
    throw refuse("invalid-d01-receipt", "D01 receipt must be a JSON object");
  }
  if (receipt.schema !== D01_RECEIPT_SCHEMA) {
    throw refuse(
      "invalid-d01-receipt",
      `D01 receipt schema must be ${D01_RECEIPT_SCHEMA}, not mailbox envelope terms`,
    );
  }
  if (typeof receipt.jobId !== "string" || !receipt.jobId) {
    throw refuse("invalid-d01-receipt", "D01 receipt jobId is required");
  }
  if (receipt.engineResult && receipt.engineResult.ok === false) {
    throw refuse(
      "d01-result-not-retrievable",
      "refused or failed D01 result cannot be stored as useful delivery",
      {
        status: "d01-result-not-retrievable",
        detail: {
          engineOk: false,
          refused: receipt.engineResult.refused === true,
        },
      },
    );
  }
  if (receipt.engineResult && receipt.engineResult.refused === true) {
    throw refuse(
      "d01-result-not-retrievable",
      "refused D01 engineResult cannot be stored as useful delivery",
      { status: "d01-result-not-retrievable" },
    );
  }
  if (!Array.isArray(receipt.outputs) || receipt.outputs.length < 1) {
    throw refuse("missing-engine-output", "D01 receipt lists no outputs");
  }
  return receipt;
}

export function seedFromD01Receipt({
  mailbox,
  requestId,
  receipt,
  outDir,
  clock,
  expiresAt,
  ttlSeconds,
  payment = null,
  expectedJobId = null,
}) {
  const parsed = typeof receipt === "string" ? JSON.parse(readFileSync(receipt, "utf8")) : receipt;
  const checked = assertD01Receipt(parsed);
  if (expectedJobId && expectedJobId !== checked.jobId) {
    throw refuse(
      "invalid-d01-receipt",
      "seed --job-id does not match D01 receipt jobId",
      { detail: { expectedJobId, receiptJobId: checked.jobId } },
    );
  }
  const resolvedOut = outDir || checked.outDir;
  if (!resolvedOut) {
    throw refuse("missing-engine-output", "D01 receipt seed requires outDir");
  }
  return seedFromOutDir({
    mailbox,
    requestId,
    jobId: checked.jobId,
    outDir: resolvedOut,
    clock,
    expiresAt,
    ttlSeconds,
    sample: checked.sample === true,
    sampleReasons: checked.sampleReasons || [],
    engine: checked.engine || null,
    engineResult: checked.engineResult || { ok: true, digest: checked.outputsDigest || null },
    payment,
  });
}
