import { Router } from "express";
import { stripe, isStripeConfigured } from "../lib/stripe.js";
import { fulfillFromIntent } from "../lib/fulfill.js";
import { notifyAdmin } from "../lib/notify.js";

// Authoritative "paid" signal. Mounted under /api/stripe → path /api/stripe/webhook.
// Raw body captured upstream (req.rawBody) BEFORE express.json().
const router = Router();

router.post("/webhook", async (req, res) => {
  if (!isStripeConfigured()) return res.status(503).json({ error: "Stripe not configured" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(process.env.NODE_ENV === "production" ? 401 : 400).json({ error: "Webhook secret not set" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], secret);
  } catch (e) {
    return res.status(400).json({ error: `Bad signature: ${e.message}` });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      await fulfillFromIntent(event.data.object);
    } else if (event.type === "checkout.session.completed") {
      // Payment Link / hosted Checkout. If it carries a known uid we fulfill to that account;
      // otherwise it's an operator instant-link sale — record + notify the admin.
      const session = event.data.object;
      const piId = session.payment_intent;
      if (piId) {
        const intent = await stripe.paymentIntents.retrieve(piId);
        const r = await fulfillFromIntent(intent);
        if (!r.ok) {
          await notifyAdmin(
            `Payment Link sale — ${session.amount_total ? "$" + (session.amount_total / 100).toFixed(2) : ""}`,
            `<p>A Payment Link checkout completed without a linked account.</p>
             <p>Session: ${session.id}<br>Email: ${session.customer_details?.email || "—"}</p>`,
          );
        }
      }
    }
  } catch (e) {
    console.error("[webhook] fulfill error", e?.message);
    // 500 → Stripe retries; fulfillment is idempotent so retries are safe.
    return res.status(500).json({ error: "fulfill failed" });
  }

  res.json({ received: true });
});

export default router;
