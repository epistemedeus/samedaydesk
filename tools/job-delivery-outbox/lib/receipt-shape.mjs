import { readFileSync } from "node:fs";
import { F08_FUNDING_STATES, F08_RECEIPT_SCHEMA } from "./pins.mjs";
import { refuse } from "./errors.mjs";
import { sha256Bytes } from "./hash-terms.mjs";

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
    bytes: buf.length,
    sha256: sha256Bytes(buf),
  };
}

export function digestNamedBytes(entries) {
  const rows = [...entries]
    .map((e) => ({
      name: e.name,
      bytes: e.bytes,
      sha256: e.sha256,
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

/**
 * Accept F08 pin receipts and later-compatible extras (archive identity,
 * identityVerified, inputRoot). Refuse invented paid statuses.
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
  }
  if (receipt.engineResult && receipt.engineResult.ok === false) {
    refuse("receipt-not-completed", "Engine result is not a completed output");
  }
  return receipt;
}

export function outputRefs(receipt) {
  return receipt.outputs.map((o) => ({
    name: o.name,
    bytes: o.bytes,
    sha256: o.sha256,
  }));
}
