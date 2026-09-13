import { readFileSync } from "node:fs";
import { F08_FUNDING_STATES, F08_RECEIPT_SCHEMA, engineArchiveIdentity } from "./pins.mjs";
import { refuse } from "./errors.mjs";
import { sha256Bytes } from "./sha256.mjs";

const INVENTED_PAID = new Set([
  "paid",
  "settled",
  "sold",
  "sale",
  "charged",
  "live-sale",
  "owed",
]);

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

export function fileEntry(name, filePath) {
  const buf = readFileSync(filePath);
  return {
    name,
    kind: "file",
    bytes: buf.length,
    sha256: sha256Bytes(buf),
  };
}

/**
 * Receipt.v1 named-bytes digest (SDS52). File rows bind name/kind/bytes/sha256.
 * Directory path is included only when kind is directory. Not a kernel copy.
 */
export function digestNamedBytes(entries) {
  const rows = [...entries]
    .map((e) => ({
      name: e.name,
      kind: e.kind || "file",
      bytes: e.bytes ?? null,
      sha256: e.sha256 ?? null,
      path: e.kind === "directory" ? e.path : undefined,
    }))
    .sort((a, b) => String(a.name).localeCompare(b.name));
  return sha256Bytes(Buffer.from(JSON.stringify(rows), "utf8"));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hex64(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function outputRefs(receipt) {
  return receipt.outputs.map((o) => ({
    name: o.name,
    kind: o.kind || "file",
    bytes: o.bytes,
    sha256: o.sha256,
    path: o.kind === "directory" ? o.path : undefined,
  }));
}

export function verifyOutputsDigest(receipt) {
  const computed = digestNamedBytes(outputRefs(receipt));
  if (receipt.outputsDigest !== computed) {
    refuse("outputs-digest-mismatch", "Asserted outputsDigest does not match listed output bytes", {
      asserted: receipt.outputsDigest,
      computed,
    });
  }
  return computed;
}

/**
 * Accept SDS52 / F08-shaped receipts. Refuse invented paid statuses, missing
 * engine archive identity, and asserted output digests that do not match
 * listed outputs.
 */
export function assertF08Receipt(receipt) {
  if (!isPlainObject(receipt)) {
    refuse("receipt-invalid", "Receipt must be a JSON object");
  }
  if (receipt.schema !== F08_RECEIPT_SCHEMA) {
    refuse("receipt-schema", `Receipt schema must be ${F08_RECEIPT_SCHEMA}`, {
      schema: receipt.schema || null,
    });
  }
  if (typeof receipt.jobId !== "string" || !receipt.jobId.trim()) {
    refuse("receipt-jobId", "Receipt jobId is required");
  }
  if (receipt.sold === true) {
    refuse("invented-paid-status", "Receipt sold=true is not a F08 non-settling status");
  }
  if (receipt.purchaseAuthority === true) {
    refuse("invented-paid-status", "Receipt purchaseAuthority=true is out of scope");
  }
  if (receipt.liveSettleAttempted === true || receipt.payment?.liveSettleAttempted === true) {
    refuse("invented-paid-status", "Live settle attempts are out of scope for this outbox");
  }
  if (receipt.payment?.liveSettleAllowed === true) {
    refuse("invented-paid-status", "liveSettleAllowed is not a F08 outbox status");
  }
  if (typeof receipt.fundingState !== "string") {
    refuse("receipt-fundingState", "Receipt fundingState is required");
  }
  if (INVENTED_PAID.has(receipt.fundingState) || !F08_FUNDING_STATES.includes(receipt.fundingState)) {
    refuse("invented-paid-status", "Unknown or invented fundingState; F08 allows unfunded|reserved-fixture|rejected", {
      fundingState: receipt.fundingState,
    });
  }
  if (receipt.fundingState === "rejected") {
    refuse("receipt-not-completed", "Rejected receipts are not completed job results");
  }
  if (!hex64(receipt.outputsDigest)) {
    refuse("receipt-outputsDigest", "Receipt outputsDigest must be 64 lowercase hex");
  }
  if (!Array.isArray(receipt.outputs) || receipt.outputs.length === 0) {
    refuse("receipt-outputs", "Completed receipt must list output references");
  }
  for (const out of receipt.outputs) {
    if (!isPlainObject(out) || typeof out.name !== "string") {
      refuse("receipt-outputs", "Each output needs a name");
    }
    if (!Number.isInteger(out.bytes) || out.bytes < 0) {
      refuse("receipt-outputs", `Output ${out.name} needs bytes`);
    }
    if (!hex64(out.sha256)) {
      refuse("receipt-outputs", `Output ${out.name} needs sha256`);
    }
    if (!out.name || out.name.includes('/') || out.name.includes('\\') || ['.', '..'].includes(out.name) || (out.kind && out.kind !== 'file')) {
      refuse('receipt-outputs', 'Output identity requires regular-file basenames');
    }
  }
  if (new Set(receipt.outputs.map(o => o.name)).size !== receipt.outputs.length) refuse('receipt-outputs', 'Duplicate output identity');
  if (receipt.contract === 'samedaydesk.paid-useful-jobs.execution.v1') {
    if (receipt.transport !== 'ok' || receipt.delivery?.complete !== true) refuse('receipt-not-completed', 'Execution delivery is incomplete');
  } else if (receipt.engineResult && receipt.engineResult.ok === false) {
    refuse("receipt-not-completed", "Engine result is not a completed output");
  }
  engineArchiveIdentity(receipt.engine || {});
  verifyOutputsDigest(receipt);
  return receipt;
}
