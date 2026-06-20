// SANDBOX-ONLY test helper: simulate a paid order by creating + confirming a test
// PaymentIntent that carries the same metadata the on-site checkout stamps (uid + offer).
// This fires payment_intent.succeeded → the live prod webhook → fulfillment (order + paid flip).
// Run: node --env-file=.env server/scripts/test-pay.js <uid> [offer]
// Refuses to run with a live key.
import Stripe from "stripe";
import { OFFERS, CURRENCY } from "../pricing.js";

const key = process.env.STRIPE_SECRET_KEY || "";
if (!key.startsWith("sk_test")) {
  console.error("refusing: STRIPE_SECRET_KEY is not a test key");
  process.exit(1);
}
const stripe = new Stripe(key);

const uid = process.argv[2];
const slug = process.argv[3] || "resume_linkedin";
if (!uid) {
  console.error("usage: node --env-file=.env server/scripts/test-pay.js <uid> [offer]");
  process.exit(1);
}
const offer = OFFERS[slug];
if (!offer) {
  console.error(`unknown offer '${slug}'. one of: ${Object.keys(OFFERS).join(", ")}`);
  process.exit(1);
}

const pi = await stripe.paymentIntents.create({
  amount: offer.amount,
  currency: CURRENCY,
  confirm: true,
  payment_method: "pm_card_visa",
  automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  description: `TEST ${offer.label}`,
  metadata: { uid, offer: slug, amount: String(offer.amount), label: offer.label },
});

console.log(`PaymentIntent ${pi.id} → ${pi.status}  ($${(pi.amount / 100).toFixed(2)} ${pi.currency})`);
console.log(`metadata: uid=${uid} offer=${slug}`);
console.log(`expected order id: order_${uid}_${slug}`);
