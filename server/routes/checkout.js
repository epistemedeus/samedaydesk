import { Router } from "express";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth.js";
import { stripe, isStripeConfigured } from "../lib/stripe.js";
import { getOffer, CURRENCY } from "../pricing.js";
import { fulfillFromIntent } from "../lib/fulfill.js";

const router = Router();

// Server-authoritative PaymentIntent. The client sends an offer SLUG only — the amount is
// computed here and stamped into metadata, which fulfillment reads back (never the client).
router.post("/create-payment-intent", requireAuth, requireVerifiedEmail, async (req, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: "Payments not configured" });
  const slug = req.body?.offer;
  const uploadPath = typeof req.body?.upload_path === "string" ? req.body.upload_path : "";
  const offer = getOffer(slug);
  if (!offer) return res.status(400).json({ error: "Unknown offer" });

  try {
    const intent = await stripe.paymentIntents.create({
      amount: offer.amount,
      currency: CURRENCY,
      receipt_email: req.userEmail,
      description: `SameDayDesk · ${offer.label}`,
      metadata: {
        uid: req.uid,
        offer: slug,
        amount: String(offer.amount),
        label: offer.label,
        upload_path: uploadPath,
      },
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, amount: offer.amount, label: offer.label });
  } catch (e) {
    console.error("[checkout] create-payment-intent", e?.message);
    res.status(502).json({ error: "Could not start checkout" });
  }
});

// Verify-on-return (webhook backup). Both paths run the same idempotent fulfill().
router.post("/verify", requireAuth, requireVerifiedEmail, async (req, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: "Payments not configured" });
  const id = req.body?.paymentIntentId;
  if (!id) return res.status(400).json({ error: "Missing paymentIntentId" });
  try {
    const intent = await stripe.paymentIntents.retrieve(id);
    if (intent.metadata?.uid !== req.uid) return res.status(403).json({ error: "Not your payment" });
    if (intent.status !== "succeeded") return res.json({ verified: false, status: intent.status });
    const result = await fulfillFromIntent(intent);
    res.json({ verified: true, orderId: result.orderId });
  } catch (e) {
    console.error("[checkout] verify", e?.message);
    res.status(502).json({ error: "Could not verify payment" });
  }
});

export default router;
