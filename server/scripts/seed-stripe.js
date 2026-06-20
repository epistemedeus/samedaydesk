// Idempotent seeder for Stripe Products / Prices / Payment Links (one per offer).
// Run: node --env-file=.env server/scripts/seed-stripe.js
// Re-running reuses existing objects (matched by metadata.sdd_offer) — no duplicates.
import Stripe from "stripe";
import { OFFERS, CURRENCY } from "../pricing.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function listAll(resource, params = {}) {
  const out = [];
  for await (const item of stripe[resource].list({ limit: 100, ...params })) out.push(item);
  return out;
}

async function ensureOffer(slug, offer) {
  const products = await listAll("products", { active: true });
  let product = products.find((p) => p.metadata?.sdd_offer === slug);
  if (!product) {
    product = await stripe.products.create({
      name: `SameDayDesk — ${offer.label}`,
      metadata: { sdd_offer: slug },
    });
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find((p) => p.unit_amount === offer.amount && p.currency === CURRENCY);
  if (!price) {
    price = await stripe.prices.create({ product: product.id, unit_amount: offer.amount, currency: CURRENCY });
  }

  const links = await listAll("paymentLinks", { active: true });
  let link = links.find((l) => l.metadata?.sdd_offer === slug);
  if (!link) {
    link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { sdd_offer: slug },
      payment_intent_data: { metadata: { offer: slug, amount: String(offer.amount), label: offer.label } },
      allow_promotion_codes: true,
    });
  }

  return { slug, label: offer.label, amount: offer.amount, product: product.id, price: price.id, link: link.url };
}

// Create a one-off "instant" Payment Link for a custom amount (operator → client).
export async function createInstantLink({ amountCents, description }) {
  const product = await stripe.products.create({ name: `SameDayDesk — ${description}`, metadata: { sdd_offer: "custom_quote" } });
  const price = await stripe.prices.create({ product: product.id, unit_amount: amountCents, currency: CURRENCY });
  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { sdd_offer: "custom_quote" },
    payment_intent_data: { metadata: { offer: "custom_quote", amount: String(amountCents), label: description } },
  });
  return link.url;
}

async function main() {
  const results = [];
  for (const [slug, offer] of Object.entries(OFFERS)) results.push(await ensureOffer(slug, offer));
  console.log(JSON.stringify(results, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
