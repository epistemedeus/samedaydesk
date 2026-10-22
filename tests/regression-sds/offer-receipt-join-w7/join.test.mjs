import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EXTRACT_AMOUNT,
  EXTRACT_DIGEST,
  EXTRACT_ROUTE,
  PAY_TO,
  SCAN_AMOUNT,
} from "./lib/pin.mjs";
import { loadCatalogOffer, loadExtractDigest, originPathname } from "./lib/catalog.mjs";
import { joinOfferReceipt } from "./lib/join.mjs";
import { seededMismatchOutcome } from "./lib/seeded.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function loadCase(id) {
  return JSON.parse(readFileSync(join(here, "fixtures/cases", `${id}.json`), "utf8"));
}

test("origin+pathname strips query so encoded catalog URL joins unencoded receipt URL", () => {
  assert.equal(originPathname(EXTRACT_ROUTE), EXTRACT_ROUTE);
  assert.equal(
    originPathname("https://agents.samedaydesk.com/extract?url=https://example.com"),
    EXTRACT_ROUTE,
  );
  assert.equal(
    originPathname("https://agents.samedaydesk.com/extract?url=https%3A%2F%2Fexample.com"),
    EXTRACT_ROUTE,
  );
});

test("committed catalog /extract pin is 5000 atomic USDC to SDS payTo", () => {
  const offer = loadCatalogOffer("/extract");
  assert.ok(offer);
  assert.equal(offer.amount, EXTRACT_AMOUNT);
  assert.equal(offer.payTo, PAY_TO);
  assert.equal(offer.originPathname, EXTRACT_ROUTE);
  assert.equal(loadExtractDigest(), EXTRACT_DIGEST);
});

test("cold extract join succeeds on exact keys and is not settlement", () => {
  const v = joinOfferReceipt(loadCase("cold-extract-join"));
  assert.equal(v.joined, true, JSON.stringify(v.reasons));
  assert.equal(v.independentlySettled, false);
  assert.equal(v.paid, false);
  assert.equal(v.live, false);
  assert.equal(v.exact.amount.match, true);
  assert.equal(v.exact.origin_pathname.match, true);
  assert.equal(v.offer.amount, "5000");
});

test("cold scan join uses 200000 so amount is not hardcoded to 5000", () => {
  const v = joinOfferReceipt(loadCase("cold-scan-join"));
  assert.equal(v.joined, true, JSON.stringify(v.reasons));
  assert.equal(v.offer.amount, SCAN_AMOUNT);
});

test("seeded payload amount 1 vs catalog 5000 rejects without unit conversion", () => {
  const v = joinOfferReceipt(loadCase("amount-mismatch"));
  assert.equal(v.joined, false);
  assert.equal(v.mismatch, true);
  assert.ok(
    v.reasons.some((r) => r === "amount_mismatch:offer=5000,receipt=1"),
    JSON.stringify(v.reasons),
  );
  assert.equal(v.exact.amount.match, false);
});

test("naive unpaid status would accept the seeded mismatch", () => {
  const raw = loadCase("amount-mismatch");
  assert.equal(raw.receipt.statusClass, "unpaid");
  assert.equal(raw.httpStatus, 402);
  assert.equal(raw.naive.verdict, "accept");
  const v = joinOfferReceipt(raw);
  assert.equal(v.joined, false);
});

test("route /extract vs /read rejects even at the same 5000 amount", () => {
  const v = joinOfferReceipt(loadCase("route-mismatch"));
  assert.equal(v.joined, false);
  assert.ok(v.reasons.some((r) => String(r).startsWith("join_key_mismatch")), JSON.stringify(v.reasons));
});

test("payTo swap, network swap, and unit conversion reject", () => {
  const payTo = joinOfferReceipt(loadCase("payto-mismatch"));
  assert.equal(payTo.joined, false);
  assert.ok(payTo.reasons.includes("payto_mismatch"));

  const network = joinOfferReceipt(loadCase("network-mismatch"));
  assert.equal(network.joined, false);
  assert.ok(network.reasons.some((r) => String(r).startsWith("network_mismatch")));

  const units = joinOfferReceipt(loadCase("unit-conversion-as-match"));
  assert.equal(units.joined, false);
  assert.ok(units.reasons.includes("unit_conversion"), JSON.stringify(units.reasons));
});

test("invented fields, settlement object, missing keys, and pay mode reject", () => {
  const invented = joinOfferReceipt(loadCase("invented-receipt-field"));
  assert.equal(invented.joined, false);
  assert.ok(invented.reasons.some((r) => String(r).startsWith("invented_receipt_field")));

  const settled = joinOfferReceipt(loadCase("offer-as-settlement"));
  assert.equal(settled.joined, false);
  assert.ok(settled.reasons.includes("offer_as_settlement"));

  const nokey = joinOfferReceipt(loadCase("join-without-exact-key"));
  assert.equal(nokey.joined, false);
  assert.ok(nokey.reasons.includes("join_without_exact_key"));

  const pay = joinOfferReceipt(loadCase("money-movement"));
  assert.equal(pay.joined, false);
  assert.ok(pay.reasons.includes("money_movement_refused"));
});

test("omitting payload.amount or payTo is not an exact-key join", () => {
  const missingAmount = joinOfferReceipt(loadCase("missing-amount"));
  assert.equal(missingAmount.joined, false);
  assert.equal(missingAmount.mismatch, true);
  assert.ok(missingAmount.reasons.includes("join_key_missing:amount"), JSON.stringify(missingAmount.reasons));

  const omitPayTo = structuredClone(loadCase("cold-extract-join"));
  delete omitPayTo.receipt.offerReceipt.offers[0].payload.payTo;
  const v = joinOfferReceipt(omitPayTo);
  assert.equal(v.joined, false);
  assert.ok(v.reasons.includes("join_key_missing:payTo"), JSON.stringify(v.reasons));
});

test("decimal scan amount is unit conversion, not extract-5000-only", () => {
  const scan = loadCase("cold-scan-join");
  scan.receipt.offerReceipt.offers[0].payload.amount = "0.2";
  scan.claims = {};
  const v = joinOfferReceipt(scan);
  assert.equal(v.joined, false);
  assert.ok(v.reasons.includes("unit_conversion"), JSON.stringify(v.reasons));
  assert.ok(
    v.reasons.some((r) => r === "amount_mismatch:offer=200000,receipt=0.2"),
    JSON.stringify(v.reasons),
  );
});

test("seededMismatchOutcome is SEED_REJECT only when the child actually refused", () => {
  const rejected = seededMismatchOutcome({
    status: 1,
    body: {
      ok: false,
      result: { joined: false, mismatch: true, reasons: ["amount_mismatch:offer=5000,receipt=1"] },
    },
  });
  assert.equal(rejected.code, "SEED_REJECT");
  assert.equal(rejected.reject, true);

  const falseAccept = seededMismatchOutcome({
    status: 0,
    body: {
      ok: true,
      result: { joined: true, mismatch: false, reasons: ["exact_key_join"] },
    },
  });
  assert.equal(falseAccept.code, "FALSE_ACCEPT");
  assert.equal(falseAccept.reject, false);
});
