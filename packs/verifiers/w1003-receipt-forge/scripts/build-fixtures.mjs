#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_SCHEMA_VERSION,
  KNOWN_SETTLEMENT,
  PACK_ID,
  PRODUCT,
  REQUIRED_JOIN_KEYS,
  REQUIRED_PROHIBITED_INFERENCES,
  ROUTE_AMOUNTS,
  SCHEMA_VERSION,
  SDS_PIN,
  SEEDED_CODE,
  SEEDED_FAILURE,
  SPENT_RECEIPT_ID,
} from "../src/constants.mjs";
import { stampIntegrity } from "../src/digest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packRoot = join(here, "..");
const fixtures = join(packRoot, "fixtures");
const validDir = join(fixtures, "valid");
const rejectDir = join(fixtures, "reject");

mkdirSync(validDir, { recursive: true });
mkdirSync(rejectDir, { recursive: true });

const EXTRACT_ACCEPT = {
  scheme: SDS_PIN.scheme,
  network: SDS_PIN.network,
  amount: ROUTE_AMOUNTS["/extract"],
  asset: SDS_PIN.asset,
  payTo: SDS_PIN.payTo,
  maxTimeoutSeconds: 300,
  extra: { name: "USD Coin", version: "2" },
};

const SELLER_ACCEPT = {
  ...EXTRACT_ACCEPT,
  amount: ROUTE_AMOUNTS["/commerce/seller-integrity-audit"],
};

function baseUnpaid({
  claimId,
  receiptId,
  kind,
  resource,
  route,
  method,
  httpStatus,
  observedAt,
  source,
  unknownWhenAbsent,
  accept = EXTRACT_ACCEPT,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    claimId,
    receiptId,
    kind,
    statusClass: "unpaid",
    origin: SDS_PIN.origin,
    resource,
    route,
    method,
    httpStatus,
    charged: false,
    paymentSent: false,
    observedAt,
    completeness: "truncated",
    authorityClass: "seller_observed",
    request: {
      method,
      url: resource,
      headers: { Accept: "application/json" },
    },
    accepts: [structuredClone(accept)],
    joinKeys: [...REQUIRED_JOIN_KEYS],
    source,
    unknownWhenAbsent,
    prohibitedInferences: [...REQUIRED_PROHIBITED_INFERENCES],
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const extractResource = "https://agents.samedaydesk.com/extract?url=https://example.com";
const sellerResource = "https://agents.samedaydesk.com/commerce/seller-integrity-audit";

const extract = stampIntegrity(
  baseUnpaid({
    claimId: "rf_w1003_unpaid_extract_402",
    receiptId: "cr_w1003_unpaid_extract_402",
    kind: "unpaid_payment_required",
    resource: extractResource,
    route: "/extract",
    method: "GET",
    httpStatus: 402,
    observedAt: "2026-09-17T12:03:06.000Z",
    source: {
      kind: "live_unpaid_402",
      capturedAt: "2026-09-17T12:03:06.000Z",
      note: "HTTP 402 PAYMENT-REQUIRED on /extract amount 5000. No payment header. Digest binds canonical unpaid bytes.",
    },
    unknownWhenAbsent: ["paid_body", "facilitator_settlement", "payment_header"],
  }),
);

const buyerStop = stampIntegrity(
  baseUnpaid({
    claimId: "rf_w1003_unpaid_buyer_stop",
    receiptId: "cr_w1003_unpaid_buyer_stop",
    kind: "unpaid_buyer_stop",
    resource: extractResource,
    route: "/extract",
    method: "GET",
    httpStatus: null,
    observedAt: "2026-09-17T12:04:00.000Z",
    source: {
      kind: "buyer_runtime_fixture",
      note: "Buyer stopped before a paid retry. No HTTP response. No PAYMENT-SIGNATURE.",
    },
    unknownWhenAbsent: ["http_response", "paid_body", "facilitator_settlement"],
  }),
);

const sellerIntegrity = stampIntegrity(
  baseUnpaid({
    claimId: "rf_w1003_unpaid_seller_integrity",
    receiptId: "cr_w1003_unpaid_seller_integrity",
    kind: "unpaid_payment_required",
    resource: sellerResource,
    route: "/commerce/seller-integrity-audit",
    method: "GET",
    httpStatus: 402,
    observedAt: "2026-09-17T12:05:00.000Z",
    source: {
      kind: "live_unpaid_402",
      capturedAt: "2026-09-17T12:05:00.000Z",
      note: "Unpaid HTTP 402 on /commerce/seller-integrity-audit amount 10000. Does not copy the 2026-08-29 facilitator tx.",
    },
    unknownWhenAbsent: ["paid_body", "facilitator_settlement", "payment_header"],
    accept: SELLER_ACCEPT,
  }),
);

const forged = structuredClone(extract);
forged.claimId = "rf_w1003_seed_forged_digest";
forged.receiptId = "cr_w1003_seed_forged_digest";
forged.source = {
  kind: "live_unpaid_402",
  capturedAt: "2026-09-17T12:03:06.000Z",
  note: "Seeded failure: amount mutated after the claimed digest was bound.",
};
const honestDigest = stampIntegrity(forged);
forged.integrity = honestDigest.integrity;
forged.accepts[0].amount = "1";

const copied = stampIntegrity({
  ...baseUnpaid({
    claimId: "rf_w1003_copied_settlement",
    receiptId: "cr_w1003_copied_settlement",
    kind: "unpaid_payment_required",
    resource: extractResource,
    route: "/extract",
    method: "GET",
    httpStatus: 402,
    observedAt: "2026-09-17T12:03:06.000Z",
    source: {
      kind: "live_unpaid_402",
      note: "Known facilitator tx copied onto a different unpaid extract resource.",
    },
    unknownWhenAbsent: ["paid_body", "chain_finality"],
  }),
  settlement: {
    operationId: KNOWN_SETTLEMENT.operationId,
    amountUsdc: KNOWN_SETTLEMENT.amountUsdc,
    transaction: KNOWN_SETTLEMENT.transaction,
    facilitatorOrPayoutRef: KNOWN_SETTLEMENT.facilitatorOrPayoutRef,
  },
});

const fabricated = stampIntegrity({
  ...baseUnpaid({
    claimId: "rf_w1003_fabricated_tx",
    receiptId: "cr_w1003_fabricated_tx",
    kind: "unpaid_payment_required",
    resource: extractResource,
    route: "/extract",
    method: "GET",
    httpStatus: 402,
    observedAt: "2026-09-17T12:03:06.000Z",
    source: {
      kind: "live_unpaid_402",
      note: "Made-up settlement hash with a matching self-digest.",
    },
    unknownWhenAbsent: ["paid_body", "chain_finality"],
  }),
  settlement: {
    operationId: "forged-local-tx",
    amountUsdc: "0.010",
    transaction: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    facilitatorOrPayoutRef: "x402_v2_coinbase_cdp",
  },
});

const replay = stampIntegrity(
  baseUnpaid({
    claimId: "rf_w1003_receipt_replay",
    receiptId: SPENT_RECEIPT_ID,
    kind: "unpaid_payment_required",
    resource: extractResource,
    route: "/extract",
    method: "GET",
    httpStatus: 402,
    observedAt: "2026-09-17T12:10:00.000Z",
    source: {
      kind: "live_unpaid_402",
      note: "Pinned spent receiptId replayed as a new unpaid challenge.",
    },
    unknownWhenAbsent: ["paid_body", "facilitator_settlement"],
  }),
);

const paymentHeader = stampIntegrity({
  ...baseUnpaid({
    claimId: "rf_w1003_payment_header_forge",
    receiptId: "cr_w1003_payment_header_forge",
    kind: "unpaid_payment_required",
    resource: extractResource,
    route: "/extract",
    method: "GET",
    httpStatus: 402,
    observedAt: "2026-09-17T12:03:06.000Z",
    source: {
      kind: "live_unpaid_402",
      note: "PAYMENT-SIGNATURE header attached to an unpaid 402.",
    },
    unknownWhenAbsent: ["paid_body", "facilitator_settlement"],
  }),
  request: {
    method: "GET",
    url: extractResource,
    headers: {
      Accept: "application/json",
      "PAYMENT-SIGNATURE": "forged.signature.bytes",
    },
  },
});

const payToSwap = stampIntegrity({
  ...baseUnpaid({
    claimId: "rf_w1003_payto_swap",
    receiptId: "cr_w1003_payto_swap",
    kind: "unpaid_payment_required",
    resource: extractResource,
    route: "/extract",
    method: "GET",
    httpStatus: 402,
    observedAt: "2026-09-17T12:03:06.000Z",
    source: {
      kind: "live_unpaid_402",
      note: "payTo swapped to an attacker address after a self-digest.",
    },
    unknownWhenAbsent: ["paid_body", "facilitator_settlement"],
  }),
  accepts: [
    {
      ...EXTRACT_ACCEPT,
      payTo: "0x000000000000000000000000000000000000dEaD",
    },
  ],
});

const settledOffer = stampIntegrity({
  ...baseUnpaid({
    claimId: "rf_w1003_settled_offer_receipt",
    receiptId: "cr_w1003_settled_offer_receipt",
    kind: "unpaid_payment_required",
    resource: extractResource,
    route: "/extract",
    method: "GET",
    httpStatus: 402,
    observedAt: "2026-09-17T12:03:06.000Z",
    source: {
      kind: "live_unpaid_402",
      note: "offer-receipt.receipt copied onto an unpaid extract claim.",
    },
    unknownWhenAbsent: ["paid_body", "chain_finality"],
  }),
  offerReceipt: {
    receipt: {
      transaction: KNOWN_SETTLEMENT.transaction,
      operationId: KNOWN_SETTLEMENT.operationId,
    },
  },
});

writeJson(join(validDir, "unpaid-402-extract.json"), extract);
writeJson(join(validDir, "unpaid-buyer-stop.json"), buyerStop);
writeJson(join(validDir, "unpaid-402-seller-integrity.json"), sellerIntegrity);
writeJson(join(rejectDir, "forged-digest.json"), forged);
writeJson(join(rejectDir, "copied-settlement.json"), copied);
writeJson(join(rejectDir, "fabricated-tx.json"), fabricated);
writeJson(join(rejectDir, "replay-receipt.json"), replay);
writeJson(join(rejectDir, "payment-header-forge.json"), paymentHeader);
writeJson(join(rejectDir, "payto-swap.json"), payToSwap);
writeJson(join(rejectDir, "settled-offer-receipt.json"), settledOffer);

writeJson(join(rejectDir, "manifest.json"), {
  "forged-digest.json": {
    id: SEEDED_FAILURE,
    code: SEEDED_CODE,
    naiveRule: "well-formed-digest-string",
  },
  "copied-settlement.json": {
    id: "copied-settlement",
    code: "copied_settlement",
  },
  "fabricated-tx.json": {
    id: "fabricated-tx",
    code: "fabricated_settlement",
  },
  "replay-receipt.json": {
    id: "replay-receipt",
    code: "receipt_replay",
  },
  "payment-header-forge.json": {
    id: "payment-header-forge",
    code: "payment_header_forge",
  },
  "payto-swap.json": {
    id: "payto-swap",
    code: "pin_mismatch",
  },
  "settled-offer-receipt.json": {
    id: "settled-offer-receipt",
    code: "copied_settlement",
  },
});

writeJson(join(fixtures, "catalog.json"), {
  schemaVersion: CATALOG_SCHEMA_VERSION,
  recordSchemaVersion: SCHEMA_VERSION,
  product: PRODUCT,
  pack: PACK_ID,
  statusClasses: ["unpaid"],
  kinds: [
    "unpaid_payment_required",
    "unpaid_offer",
    "unpaid_probe",
    "unpaid_buyer_stop",
  ],
  designatedSeed: {
    id: SEEDED_FAILURE,
    file: "reject/forged-digest.json",
    code: SEEDED_CODE,
    naiveRule: "well-formed-digest-string",
  },
  pin: {
    ...SDS_PIN,
    routeAmounts: ROUTE_AMOUNTS,
    settlements: [KNOWN_SETTLEMENT],
    spentReceiptIds: [SPENT_RECEIPT_ID],
  },
  boundary: {
    paymentSent: false,
    checkoutMutated: false,
    registryMutated: false,
    published: false,
    live: false,
    neo: false,
    statement:
      "Offline SDS w1003 receipt-forge reject pack. Canonical SHA-256 must match. A copied or fabricated settlement, replayed receiptId, payment header, settled offer-receipt, or pin swap is rejected. HTTP 402 is not delivery.",
  },
});

process.stdout.write("stamped fixtures under packs/verifiers/w1003-receipt-forge/fixtures\n");
