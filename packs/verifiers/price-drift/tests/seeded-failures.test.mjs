import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ERROR_CODES } from "../src/constants.mjs";
import { verifyDocuments } from "../src/verify.mjs";

const pack = join(dirname(fileURLToPath(import.meta.url)), "..");

function load(rel) {
  return JSON.parse(readFileSync(join(pack, rel), "utf8"));
}

function rejectFile(name) {
  return verifyDocuments({
    pin: load("fixtures/pin.json"),
    observation: load(`fixtures/reject/${name}`),
    paths: { observation: `fixtures/reject/${name}` },
  });
}

const cases = [
  ["extract-amount-drift.json", ERROR_CODES.AMOUNT_DRIFT],
  ["edit-live-prices.json", ERROR_CODES.EDIT_LIVE_PRICES],
  ["float-money.json", ERROR_CODES.FLOAT_MONEY],
  ["atomic-decimal-mismatch.json", ERROR_CODES.ATOMIC_DECIMAL_MISMATCH],
  ["missing-route.json", ERROR_CODES.MISSING_REQUIRED_ROUTE],
  ["extra-sku.json", ERROR_CODES.EXTRA_SKU],
  ["network-drift.json", ERROR_CODES.NETWORK_DRIFT],
  ["purchase-authority.json", ERROR_CODES.PURCHASE_AUTHORITY],
  ["checkout.json", ERROR_CODES.CHECKOUT_ATTEMPTED],
  ["publish.json", ERROR_CODES.PUBLISH_ATTEMPTED],
  ["live-http.json", ERROR_CODES.LIVE_HTTP_REFUSED],
  ["sample-as-live.json", ERROR_CODES.SAMPLE_AS_LIVE],
];

for (const [name, code] of cases) {
  test(`seeded reject ${name} → ${code}`, () => {
    const result = rejectFile(name);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.equal(result.code, code);
    assert.equal(result.purchaseAuthority, false);
    assert.equal(result.liveSdsPricesUnchanged, true);
    assert.equal(result.honesty.paymentSent, false);
  });
}
