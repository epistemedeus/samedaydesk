// Server-owned PaymentIntent attempt identity for general checkout.
// Analytics (PostHog, etc.) stay client-side and independent of this key.
// Identical immutable purchase facts reuse one Stripe idempotency key so
// duplicate create-payment-intent calls do not mint a second intent.
// Changing offer, amount, currency, or upload_path yields a new attempt.
import { createHash } from "node:crypto";
import { getOffer, CURRENCY } from "../pricing.js";

export function buildPaymentAttemptIdempotencyKey({
  uid,
  offer,
  amount,
  currency = "usd",
  uploadPath = "",
} = {}) {
  if (!uid || !offer) {
    throw new Error("uid and offer are required for payment-attempt idempotency");
  }
  const payload = JSON.stringify({
    v: 1,
    uid: String(uid),
    offer: String(offer),
    amount: Number(amount),
    currency: String(currency || "usd").toLowerCase(),
    upload_path: typeof uploadPath === "string" ? uploadPath : "",
  });
  const digest = createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 40);
  return `sdd-pi-v1:${digest}`;
}

/**
 * Create a server-priced PaymentIntent for a known offer slug.
 * Exported so route tests exercise the same path checkout.js uses.
 */
export async function createOfferPaymentIntent({
  stripeClient,
  uid,
  email,
  offerSlug,
  uploadPath = "",
}) {
  const offer = getOffer(offerSlug);
  if (!offer) return { ok: false, status: 400, error: "Unknown offer" };
  if (!stripeClient) return { ok: false, status: 503, error: "Payments not configured" };

  const idempotencyKey = buildPaymentAttemptIdempotencyKey({
    uid,
    offer: offerSlug,
    amount: offer.amount,
    currency: CURRENCY,
    uploadPath,
  });

  const intent = await stripeClient.paymentIntents.create(
    {
      amount: offer.amount,
      currency: CURRENCY,
      receipt_email: email,
      description: `SameDayDesk · ${offer.label}`,
      metadata: {
        uid,
        offer: offerSlug,
        amount: String(offer.amount),
        label: offer.label,
        upload_path: uploadPath,
      },
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey },
  );

  return { ok: true, intent, offer, idempotencyKey };
}
