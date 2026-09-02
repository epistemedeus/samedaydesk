import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { findSellerRepairBrief } from "../src/data/sellerRepairBriefs.ts";
import {
  isSafeStripeCheckoutUrl,
  requestSellerRepairCheckoutUrl,
} from "../src/lib/sellerRepairCheckout.ts";
import { sellerRepairFixedScopeUrl } from "../src/lib/sellerRepairHandoff.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("seller-conformance UI delegates the fixed scope to Neomorphic without starting SameDayDesk checkout", () => {
  const source = readFileSync(join(here, "../src/pages/SellerConformance.tsx"), "utf8");
  assert.match(source, /sellerRepairFixedScopeUrl\(selectedBrief\.id\)/);
  assert.doesNotMatch(source, /requestSellerRepairCheckoutUrl|seller_repair_checkout_started|seller-repair-session/);
  assert.match(source, /LIVE_AUDIT_URL/);
});

test("known seller finding is preserved in the canonical Neomorphic fixed-scope URL", () => {
  assert.equal(
    sellerRepairFixedScopeUrl("hypernatt-liq-radar-20260830"),
    "https://neomorphic.io/services/seller-conformance/fixed-scope/?finding=hypernatt-liq-radar-20260830",
  );
});

test("Argonaut finding reuses the canonical Neomorphic fixed-scope handoff", () => {
  assert.equal(
    sellerRepairFixedScopeUrl("argonaut-ecb-fx-reference-20260902"),
    "https://neomorphic.io/services/seller-conformance/fixed-scope/?finding=argonaut-ecb-fx-reference-20260902",
  );
});

test("absent or unrecognized seller findings retain the generic canonical URL", () => {
  const generic = "https://neomorphic.io/services/seller-conformance/fixed-scope/";
  assert.equal(sellerRepairFixedScopeUrl(null), generic);
  assert.equal(sellerRepairFixedScopeUrl("not-a-known-finding"), generic);
  assert.equal(sellerRepairFixedScopeUrl("bad/value?client_reference_id=spoofed"), generic);
});

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
