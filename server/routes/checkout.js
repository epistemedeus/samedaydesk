import { Router } from "express";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth.js";
import { stripe, isStripeConfigured } from "../lib/stripe.js";
import { fulfillFromIntent } from "../lib/fulfill.js";
import { createSellerRepairCheckoutSession } from "../lib/seller-repair-checkout.js";
import { createOfferPaymentIntent, preparePaymentIntake } from "../lib/payment-attempt.js";

const router = Router();

// Server-authoritative PaymentIntent. The client sends an offer SLUG only — the amount is
// computed here and stamped into metadata, which fulfillment reads back (never the client).
// Duplicate creates for the same server-owned payment_attempt_id reuse one Stripe idempotency key.
router.post("/create-payment-intent", requireAuth, requireVerifiedEmail, async (req, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: "Payments not configured" });
  const slug = req.body?.offer;
  const uploadPath = typeof req.body?.upload_path === "string" ? req.body.upload_path : "";
  const paymentAttemptId = typeof req.body?.payment_attempt_id === "string"
    ? req.body.payment_attempt_id.trim()
    : null;

  try {
    const result = await createOfferPaymentIntent({
      stripeClient: stripe,
      uid: req.uid,
      email: req.userEmail,
      offerSlug: slug,
      uploadPath,
      paymentAttemptId: paymentAttemptId || null,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const { intent, offer, attemptId } = result;
    res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      paymentAttemptId: attemptId,
      amount: offer.amount,
      label: offer.label,
      intakeSnapshot: result.intakeSnapshot || null,
    });
  } catch (e) {
    console.error("[checkout] create-payment-intent", e?.message);
    res.status(502).json({ error: "Could not start checkout" });
  }
});

router.post("/prepare-payment", requireAuth, requireVerifiedEmail, async (req, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: "Payments not configured" });
  try {
    const result = await preparePaymentIntake({
      stripeClient: stripe, uid: req.uid,
      paymentAttemptId: req.body?.payment_attempt_id, intake: req.body?.intake,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ prepared: true, intakeSnapshot: result.intakeSnapshot });
  } catch (error) {
    console.error("[checkout] prepare-payment", error?.message);
    return res.status(502).json({ error: "Could not freeze your task. Payment has not been confirmed." });
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
    res.json({ verified: true, orderId: result.orderId, fulfillmentPending: result.fulfillmentPending,
      ...(result.fulfillmentPending ? { reason: "Payment received; task intake needs reconciliation. Contact support before delivery." } : {}),
    });
  } catch (e) {
    console.error("[checkout] verify", e?.message);
    res.status(502).json({ error: "Could not verify payment" });
  }
});

// Unauthenticated hosted Checkout for the fixed seller-contract-repair offer.
// Accepts only a bounded public brief finding ID; amount and label are server-owned.
router.post("/seller-repair-session", async (req, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: "Payments not configured" });
  const findingId = req.body?.finding_id;
  try {
    const result = await createSellerRepairCheckoutSession(findingId);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ url: result.url });
  } catch (e) {
    console.error("[checkout] seller-repair-session", e?.message);
    return res.status(502).json({ error: "Could not start checkout" });
  }
});

export default router;
