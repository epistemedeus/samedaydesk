import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { ALL_OFFERS, PAYMENT_LINKS } from "../src/lib/services.ts";
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
