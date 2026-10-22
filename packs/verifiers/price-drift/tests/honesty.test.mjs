import assert from "node:assert/strict";
import test from "node:test";
import { honestyEnvelope } from "../src/honesty.mjs";
import { statusPayload } from "../src/cli.mjs";

test("honesty envelope never authorizes purchase, rewrite, publish, or checkout", () => {
  const honesty = honestyEnvelope();
  assert.equal(honesty.purchaseAuthority, false);
  assert.equal(honesty.purchaseAuthorized, false);
  assert.equal(honesty.rewriteAuthorized, false);
  assert.equal(honesty.readyForRelease, false);
  assert.equal(honesty.paymentSent, false);
  assert.equal(honesty.checkoutAttempted, false);
  assert.equal(honesty.publishAttempted, false);
  assert.equal(honesty.charged, false);
  assert.equal(honesty.liveSdsPricesUnchanged, true);
  assert.equal(honesty.neoTouched, false);
  const extract = honesty.liveSdsRoutePrices.find((r) => r.id === "extract");
  const sia = honesty.liveSdsRoutePrices.find((r) => r.id === "seller-integrity-audit");
  assert.equal(extract.amount, "0.005");
  assert.equal(extract.amountAtomic, "5000");
  assert.equal(sia.amount, "0.01");
  assert.equal(sia.amountAtomic, "10000");
});

test("status records live prices without rewrite authority", () => {
  const status = statusPayload();
  assert.equal(status.ok, true);
  assert.equal(status.cold, true);
  assert.equal(status.honesty.rewriteAuthorized, false);
  assert.equal(status.extract.amountAtomic, "5000");
});
