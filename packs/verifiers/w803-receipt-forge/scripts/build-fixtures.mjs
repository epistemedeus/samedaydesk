#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMITTED,
  EXTRACT_AMOUNT,
  KNOWN_SETTLEMENT,
  PACK,
  PRODUCT,
  REQUIRED_JOIN_KEYS,
  REQUIRED_PROHIBITED_INFERENCES,
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

const ACCEPT = {
  scheme: SDS_PIN.scheme,
  network: SDS_PIN.network,
  amount: EXTRACT_AMOUNT,
  asset: SDS_PIN.asset,
  payTo: SDS_PIN.payTo,
  maxTimeoutSeconds: 300,
  extra: { name: "USD Coin", version: "2" },
};

const EXTRACT_RESOURCE = "https://agents.samedaydesk.com/extract?url=https://example.com";

function baseUnpaid({ claimId, receiptId, kind, resource, route, method, httpStatus, observedAt, source, unknownWhenAbsent }) {
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
    accepts: [structuredClone(ACCEPT)],
    joinKeys: [...REQUIRED_JOIN_KEYS],
    source,
    unknownWhenAbsent,
    prohibitedInferences: [...REQUIRED_PROHIBITED_INFERENCES],
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const extract = stampIntegrity(
  baseUnpaid({
    claimId: "rf_w803_unpaid_extract_402",
    receiptId: "cr_w803_unpaid_extract_402",
    kind: "unpaid_payment_required",
    resource: EXTRACT_RESOURCE,
    route: "/extract",
    method: "GET",
    httpStatus: 402,
    observedAt: "2026-09-17T12:03:06.000Z",
    source: {
      kind: "catalog_x402",
      capturedAt: "2026-09-17T12:03:06.000Z",
      path: COMMITTED.extractObservation,
      note: "HTTP 402 PAYMENT-REQUIRED from committed extract observation. No payment header. Digest binds canonical unpaid bytes.",
    },
    unknownWhenAbsent: ["paid_body", "facilitator_settlement", "payment_header"],
  }),
);

const buyerStop = stampIntegrity(
  baseUnpaid({
    claimId: "rf_w803_unpaid_buyer_stop",
    receiptId: "cr_w803_unpaid_buyer_stop",
    kind: "unpaid_buyer_stop",
    resource: EXTRACT_RESOURCE,
    route: "/extract",
    method: "GET",
    httpStatus: null,
    observedAt: "2026-09-17T12:04:00.000Z",
    source: {
      kind: "buyer_runtime_fixture",
      path: COMMITTED.buyerStop,
      note: "Committed coinbase-x402 buyer stop. No wallet, no PAYMENT-SIGNATURE, no facilitator settle.",
    },
    unknownWhenAbsent: ["http_response", "paid_body", "facilitator_settlement"],
  }),
);

const forged = structuredClone(extract);
forged.claimId = "rf_w803_seed_forged_digest";
forged.receiptId = "cr_w803_seed_forged_digest";
forged.source = {
  kind: "catalog_x402",
  capturedAt: "2026-09-17T12:03:06.000Z",
  path: COMMITTED.extractObservation,
  note: "Seeded failure: amount mutated after the claimed digest was bound to committed extract 5000.",
};
const honestDigest = stampIntegrity(forged);
forged.integrity = honestDigest.integrity;
forged.accepts[0].amount = "1";

const copied = stampIntegrity({
  ...baseUnpaid({
    claimId: "rf_w803_copied_settlement",
    receiptId: "cr_w803_copied_settlement",
    kind: "unpaid_payment_required",
    resource: EXTRACT_RESOURCE,
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
    claimId: "rf_w803_fabricated_tx",
    receiptId: "cr_w803_fabricated_tx",
    kind: "unpaid_payment_required",
    resource: EXTRACT_RESOURCE,
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
    claimId: "rf_w803_receipt_replay",
    receiptId: SPENT_RECEIPT_ID,
    kind: "unpaid_payment_required",
    resource: EXTRACT_RESOURCE,
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
    claimId: "rf_w803_payment_header_forge",
    receiptId: "cr_w803_payment_header_forge",
    kind: "unpaid_payment_required",
    resource: EXTRACT_RESOURCE,
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
    url: EXTRACT_RESOURCE,
    headers: {
      Accept: "application/json",
      "PAYMENT-SIGNATURE": "forged.signature.bytes",
    },
  },
});

const payToSwap = stampIntegrity({
  ...baseUnpaid({
    claimId: "rf_w803_payto_swap",
    receiptId: "cr_w803_payto_swap",
    kind: "unpaid_payment_required",
    resource: EXTRACT_RESOURCE,
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
      ...ACCEPT,
      payTo: "0x000000000000000000000000000000000000dEaD",
    },
  ],
});

writeJson(join(validDir, "unpaid-402-extract.json"), extract);
writeJson(join(validDir, "unpaid-buyer-stop.json"), buyerStop);
writeJson(join(rejectDir, "forged-digest.json"), forged);
writeJson(join(rejectDir, "copied-settlement.json"), copied);
writeJson(join(rejectDir, "fabricated-tx.json"), fabricated);
writeJson(join(rejectDir, "replay-receipt.json"), replay);
writeJson(join(rejectDir, "payment-header-forge.json"), paymentHeader);
writeJson(join(rejectDir, "payto-swap.json"), payToSwap);

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
});

writeJson(join(fixtures, "catalog.json"), {
  schemaVersion: "samedaydesk.receipt-forge.catalog.v1",
  recordSchemaVersion: SCHEMA_VERSION,
  product: PRODUCT,
  pack: PACK,
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
  committed: COMMITTED,
  pin: {
    ...SDS_PIN,
    extractAmount: EXTRACT_AMOUNT,
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
      "Offline SDS w803 receipt-forge reject pack. Cold-pins committed extract 402 and agent402 settlement. Canonical SHA-256 must match. A copied or fabricated settlement, replayed receiptId, payment header, or pin swap is rejected. HTTP 402 is not delivery.",
  },
});

process.stdout.write("stamped fixtures under packs/verifiers/w803-receipt-forge/fixtures\n");
