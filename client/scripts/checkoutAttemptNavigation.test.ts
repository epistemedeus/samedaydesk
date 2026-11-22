import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { ALL_OFFERS, PAYMENT_LINKS, accountCheckoutEntry } from "../src/lib/services.ts";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checkout = readFileSync(join(here, "../src/pages/Checkout.tsx"), "utf8");

test("checkout remembers server attempt id across remount and clears it after paid navigation", () => {
  assert.match(checkout, /sdd:payment-attempt:\$\{slug\}/);
  assert.match(checkout, /sessionStorage\.getItem\(storageKey\)/);
  assert.match(checkout, /payment_attempt_id/);
  assert.match(checkout, /paymentAttemptId/);
  assert.match(checkout, /sessionStorage\.setItem\(storageKey, d\.paymentAttemptId\)/);
  assert.match(checkout, /sessionStorage\.removeItem\(`sdd:payment-attempt:\$\{offerSlug\}`\)/);
  assert.match(checkout, /navigate\("\/dashboard\?paid=1", \{ replace: true \}\)/);
  // Client still sends offer-only by default when no remembered attempt exists.
  assert.match(checkout, /const body: Record<string, string> = \{ offer: slug \}/);
});


test("all six displayed offers use their qualified purchase entry and price", () => {
  const manifest = JSON.parse(readFileSync(join(here, "../../release/offers.json"), "utf8"));
  assert.equal(ALL_OFFERS.length, 6);
  for (const offer of ALL_OFFERS) {
    const qualified = manifest.offers.find((item: { offer?: string }) => item.offer === offer.slug);
    assert.ok(qualified, `missing release qualification for ${offer.slug}`);
    assert.equal(PAYMENT_LINKS[offer.slug], qualified.entry, offer.slug);
    assert.equal(offer.price * 100, qualified.cents, offer.slug);
    assert.equal(qualified.currency, "usd", offer.slug);
  }
});


test("sign-in can resume only a known qualified account offer", () => {
  assert.equal(accountCheckoutEntry("agent_workflow"), "/checkout?offer=agent_workflow");
  assert.equal(accountCheckoutEntry("agent_mcp_server"), "/checkout?offer=agent_mcp_server");
  for (const slug of [null, undefined, "", "keep_it_working", "agent_front_door", "agent_storefront", "machine_payment_route", "__proto__", "toString", "https://outside.example/", "/checkout?offer=agent_workflow", "agent_workflow&next=https://outside.example/"]) {
    assert.equal(accountCheckoutEntry(slug), null, String(slug));
  }
});
