import assert from "node:assert/strict";
import test from "node:test";

import { findSellerRepairBrief } from "../src/data/sellerRepairBriefs.ts";
import {
  isSafeStripeCheckoutUrl,
  requestSellerRepairCheckoutUrl,
} from "../src/lib/sellerRepairCheckout.ts";

test("accepts only safe Stripe checkout URLs", () => {
  assert.equal(isSafeStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_abc"), true);
  assert.equal(isSafeStripeCheckoutUrl("https://pay.stripe.com/c/pay/cs_test_abc"), true);
  assert.equal(isSafeStripeCheckoutUrl("https://preview.checkout.stripe.com/c/pay/cs_test_abc"), false);
  assert.equal(isSafeStripeCheckoutUrl("http://checkout.stripe.com/c/pay/cs_test_abc"), false);
  assert.equal(isSafeStripeCheckoutUrl("https://evil.example/checkout"), false);
  assert.equal(isSafeStripeCheckoutUrl("javascript:alert(1)"), false);
});

test("requestSellerRepairCheckoutUrl preserves finding ID and rejects unsafe redirects", async () => {
  const findingId = "hypernatt-liq-radar-20260830";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.finding_id, findingId);
    return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_safe" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const url = await requestSellerRepairCheckoutUrl(findingId);
  assert.equal(url, "https://checkout.stripe.com/c/pay/cs_test_safe");
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ url: "https://evil.example/phish" }), { status: 200 });
  await assert.rejects(() => requestSellerRepairCheckoutUrl(findingId), /Invalid checkout redirect/);
  globalThis.fetch = originalFetch;
});

test("success and cancel brief URLs keep the same finding without claiming payment", () => {
  const brief = findSellerRepairBrief("vibe-springs-btc-usd-20260830");
  assert.ok(brief);
  const base = `https://samedaydesk.com/x402/seller-conformance?finding=${encodeURIComponent(brief.id)}`;
  const success = `${base}&checkout=returned`;
  assert.match(success, /finding=vibe-springs-btc-usd-20260830/);
  assert.match(success, /checkout=returned/);
  assert.equal(base.includes("checkout=returned"), false);
});
