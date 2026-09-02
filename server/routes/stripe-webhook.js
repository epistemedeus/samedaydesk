import { Router } from "express";
import { stripe, isStripeConfigured } from "../lib/stripe.js";
import { fulfillFromIntent } from "../lib/fulfill.js";
import { notifyAdmin } from "../lib/notify.js";
import {
  configuredNeomorphicSellerConformancePaymentLinkId,
  expiredNeomorphicSellerRepairAttribution,
  isPaidCheckoutSessionEvent,
  paidNeomorphicSellerRepairAttribution,
  sellerRepairCheckoutNotificationContext,
} from "../lib/seller-repair-checkout.js";

// Stripe-signed payment authority and bounded exact-link conversion attribution.
// Mounted under /api/stripe → path /api/stripe/webhook.
// Raw body captured upstream (req.rawBody) BEFORE express.json().
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createStripeWebhookRouter({
  stripeClient = stripe,
  stripeConfigured = isStripeConfigured,
  fulfill = fulfillFromIntent,
  notify = notifyAdmin,
  neomorphicPaymentLinkId = configuredNeomorphicSellerConformancePaymentLinkId(),
} = {}) {
  const router = Router();

  router.post("/webhook", async (req, res) => {
    if (!stripeConfigured()) return res.status(503).json({ error: "Stripe not configured" });
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(process.env.NODE_ENV === "production" ? 401 : 400).json({ error: "Webhook secret not set" });
    }

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"],
        secret,
      );
    } catch (e) {
      return res.status(400).json({ error: `Bad signature: ${e.message}` });
    }

    try {
      if (event.type === "payment_intent.succeeded") {
        await fulfill(event.data.object);
      } else if (event.type === "checkout.session.expired") {
        const attribution = expiredNeomorphicSellerRepairAttribution(
          event,
          neomorphicPaymentLinkId,
        );
        if (attribution) {
          const session = event.data.object;
          const {
            amountDisplay,
            customerEmail,
            publicTargetUrl,
            sessionId,
          } = sellerRepairCheckoutNotificationContext(session);
          const customerEmailLine = customerEmail === "—"
            ? ""
            : `<br>Customer email: ${escapeHtml(customerEmail)}`;
          const publicTargetUrlLine = publicTargetUrl === "—"
            ? ""
            : `<br>Public target URL: ${escapeHtml(publicTargetUrl)}`;
          await notify(
            `Neomorphic seller repair checkout expired — ${amountDisplay}`,
            `<p>An attributed Neomorphic seller-repair Checkout Session expired unpaid. This operator-only notice is conversion diagnosis, not proof of payment or fulfillment.</p>
             <p>Finding ID: ${escapeHtml(attribution.findingId)}<br>
             Checkout Session: ${escapeHtml(sessionId)}${customerEmailLine}${publicTargetUrlLine}<br>
             Amount: ${escapeHtml(amountDisplay)}</p>`,
          );
        }
      } else if (isPaidCheckoutSessionEvent(event)) {
        // Payment Link / hosted Checkout. If it carries a known uid we fulfill to that account;
        // otherwise it's an operator instant-link sale — record + notify the admin.
        const session = event.data.object;
        const attribution = paidNeomorphicSellerRepairAttribution(
          event,
          neomorphicPaymentLinkId,
        );
        const piId = session.payment_intent;
        let intent = {};
        let fulfillment = null;
        if (piId) {
          intent = await stripeClient.paymentIntents.retrieve(piId);
          fulfillment = await fulfill(intent);
        }

        if (!fulfillment?.ok) {
          if (attribution) {
            const {
              amountDisplay,
              customerEmail,
              paymentIntentId,
              publicTargetUrl,
              sessionId,
            } = sellerRepairCheckoutNotificationContext(session, intent);
            await notify(
              `Neomorphic seller repair paid — ${amountDisplay}`,
              `<p>A paid Neomorphic fixed-scope seller-repair engagement completed without a linked account.</p>
               <p>Finding ID: ${escapeHtml(attribution.findingId)}<br>
               Checkout Session: ${escapeHtml(sessionId)}<br>
               PaymentIntent: ${escapeHtml(paymentIntentId)}<br>
               Customer email: ${escapeHtml(customerEmail)}<br>
               Public target URL: ${escapeHtml(publicTargetUrl)}<br>
               Amount: ${escapeHtml(amountDisplay)}</p>
               <p>Attribution is admitted only from the configured Payment Link, a canonical SameDayDesk finding, and the paid USD 490.00 session total.</p>`,
            );
          } else if (piId) {
            const { findingId, offerLabel, amountDisplay } =
              sellerRepairCheckoutNotificationContext(session, intent);
            await notify(
              `Checkout completed — ${amountDisplay}`,
              `<p>A hosted Checkout completed without a linked account.</p>
               <p>Session: ${session.id}<br>
               Email: ${session.customer_details?.email || "—"}<br>
               Finding ID: ${findingId}<br>
               Offer label: ${offerLabel}<br>
               Amount: ${amountDisplay}</p>
               <p>Finding ID and offer label are for operator context only. Stripe session totals are price authority.</p>`,
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

  return router;
}

export default createStripeWebhookRouter();
