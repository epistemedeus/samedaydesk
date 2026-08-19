import { Router } from "express";
import { stripe, isStripeConfigured } from "../lib/stripe.js";
import { getOffer, CURRENCY, clockSentence } from "../pricing.js";
import { recordOrder, getOrderBySession } from "../lib/orders.js";
import { capture } from "../lib/events.js";

// Hosted Stripe Checkout, created server side from a slug. No account, no email
// verification, no client-supplied amount. The three fields collected before payment ride
// in session metadata and prefill the intake form afterwards.
const router = Router();

const PUBLIC_URL = process.env.PUBLIC_URL || "https://samedaydesk.com";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function normalizeSiteUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function validEmail(raw) {
  const s = String(raw || "").trim();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s) ? s : null;
}

function page(title, bodyHtml, status = 200) {
  return {
    status,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="/site.css"></head>
<body><div class="wrap narrow"><h1>${esc(title)}</h1>${bodyHtml}</div></body></html>`,
  };
}

// POST /api/checkout/session  (form encoded, no JavaScript required)
router.post("/session", async (req, res) => {
  const slug = String(req.body?.offer || "");
  const offer = getOffer(slug);
  if (!offer) {
    const p = page("That offer is retired", `<p>The offer <code>${esc(slug)}</code> is not sold any more. The current four are on the <a href="/#offers">homepage</a>.</p>`, 400);
    return res.status(p.status).type("html").send(p.html);
  }

  const siteUrl = normalizeSiteUrl(req.body?.site_url);
  const brandName = String(req.body?.brand_name || "").trim().slice(0, 120);
  const deliveryEmail = validEmail(req.body?.delivery_email);
  const missing = [];
  if (!siteUrl) missing.push("a website address we can open");
  if (!brandName) missing.push("the brand name buyers say");
  if (!deliveryEmail) missing.push("an email address for delivery");
  if (missing.length) {
    const p = page("Three fields, then payment", `<p>We still need ${esc(missing.join(", "))}.</p><p><a href="${esc(offer.path)}">Back to the card</a></p>`, 400);
    return res.status(p.status).type("html").send(p.html);
  }

  if (!isStripeConfigured()) {
    const p = page("Payments are not switched on here", `<p>This deployment has no payment keys, so no charge can be created. Nothing was taken from you.</p><p>Email <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a> with the address you entered and we will send a payment link by hand.</p>`, 503);
    return res.status(p.status).type("html").send(p.html);
  }

  capture("audit_checkout_started", { offer: slug });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: deliveryEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: offer.amount,
            product_data: { name: offer.label, description: `${offer.clockText}. ${clockSentence(slug).split(". ").pop()}` },
          },
        },
      ],
      metadata: {
        offer: slug,
        amount: String(offer.amount),
        label: offer.label,
        site_url: siteUrl,
        brand_name: brandName,
        delivery_email: deliveryEmail,
      },
      success_url: `${PUBLIC_URL}/intake?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}${offer.path}?cancelled=1`,
    });
    return res.redirect(303, session.url);
  } catch (e) {
    console.error("[checkout] session create", e?.message);
    const p = page("Could not start checkout", `<p>Stripe did not return a payment page. Nothing was charged.</p><p>Try again, or email <a href="mailto:contact@samedaydesk.com">contact@samedaydesk.com</a>.</p>`, 502);
    return res.status(p.status).type("html").send(p.html);
  }
});

// Retrieve a paid session so the intake page can prefill and so a buyer who lands back
// before the webhook fires still sees the right form.
export async function verifySession(sessionId) {
  if (!sessionId) return { ok: false, reason: "missing_session" };
  const stored = await getOrderBySession(sessionId);
  if (!isStripeConfigured()) {
    return stored
      ? { ok: true, slug: stored.offer_slug, paid: stored.status !== "unpaid", meta: { site_url: stored.site_url, brand_name: stored.brand_name, delivery_email: stored.delivery_email }, stored }
      : { ok: false, reason: "no_stripe" };
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === "paid";
    const meta = session.metadata || {};
    if (paid && !stored) {
      await recordOrder({
        sessionId,
        slug: meta.offer,
        label: meta.label,
        amount: Number(meta.amount) || session.amount_total,
        currency: session.currency,
        deliveryEmail: meta.delivery_email,
        siteUrl: meta.site_url,
        brandName: meta.brand_name,
      });
    }
    return { ok: true, paid, slug: meta.offer, meta, stored };
  } catch (e) {
    console.error("[checkout] verify", e?.message);
    return { ok: false, reason: "lookup_failed" };
  }
}

router.post("/verify", async (req, res) => {
  const result = await verifySession(req.body?.session_id);
  res.status(result.ok ? 200 : 400).json(result);
});

export default router;
