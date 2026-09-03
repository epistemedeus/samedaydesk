import { randomBytes } from "node:crypto";
import { CANONICAL_SURFACE, isReceiptSurface } from "./distribution-surfaces.js";
import { getCanonicalResource } from "./canonical-resources.js";

export const SETTLEMENT_RECEIPT_SCHEMA = "samedaydesk.settlement-receipt.v1";

const receipts = new Map();

function receiptId() {
  return `rec_${randomBytes(16).toString("hex")}`;
}

export function createSettlementReceiptRecord(input = {}) {
  const surface = input.surface;
  if (!isReceiptSurface(surface)) {
    throw new Error("settlement receipt requires a known surface field");
  }

  const resource = getCanonicalResource(input.resourceId);
  if (!resource) {
    throw new Error(`unknown canonical resource: ${String(input.resourceId)}`);
  }

  const listingPath = input.listingPath;
  if (typeof listingPath !== "string" || !listingPath.startsWith("/")) {
    throw new Error("settlement receipt requires an absolute listingPath");
  }

  return Object.freeze({
    id: typeof input.id === "string" && input.id.startsWith("rec_") ? input.id : receiptId(),
    schemaVersion: SETTLEMENT_RECEIPT_SCHEMA,
    surface,
    resourceId: resource.id,
    canonicalPath: resource.path,
    listingPath,
    settledAt: input.settledAt || new Date().toISOString(),
    amountAtomic: input.amountAtomic == null ? null : String(input.amountAtomic),
    payer: input.payer || null,
    transactionHash: input.transactionHash || null,
  });
}

export function recordSettlementReceipt(input) {
  const receipt = createSettlementReceiptRecord(input);
  receipts.set(receipt.id, receipt);
  return receipt;
}

export function settlementReceiptFromListing(listing, extras = {}) {
  if (!listing || typeof listing !== "object") {
    throw new Error("listing context is required to record a settlement receipt");
  }
  return recordSettlementReceipt({
    ...extras,
    surface: listing.surface,
    resourceId: listing.resource.id,
    listingPath: listing.listingPath,
  });
}

export function getSettlementReceipt(id) {
  return receipts.get(id) || null;
}

export function listSettlementReceipts() {
  return [...receipts.values()];
}

export function resetSettlementReceipts() {
  receipts.clear();
}

export function canonicalListingContext(resource) {
  return {
    surface: CANONICAL_SURFACE,
    resource,
    listingPath: resource.path,
    canonicalPath: resource.path,
  };
}
