// Idempotent fulfillment. Safe to run twice (webhook + verify-on-return + Stripe retries
// all call it). The order id is deterministic and ON CONFLICT DO NOTHING makes the insert
// atomic. The server re-validates pricing from Stripe metadata and never trusts the client.
import { supabaseAdmin } from "./supabase-admin.js";
import { trustPricingFromMetadata, getOffer } from "../pricing.js";
import { sendReceipt, sendTemplate } from "./notify.js";
import { recordOrder } from "./orders.js";
import { paymentConfirmation } from "../emails/index.js";

// The current offers: hosted Checkout Session, no account, intake afterwards. Returns
// false when the session is not one of ours so the caller can fall back to the legacy path.
export async function fulfillFromSession(session) {
  const meta = session.metadata || {};
  const offer = getOffer(meta.offer);
  if (!offer) return { ok: false, handled: false };

  const result = await recordOrder({
    sessionId: session.id,
    slug: meta.offer,
    label: offer.label,
    amount: Number(meta.amount) || session.amount_total,
    currency: session.currency,
    deliveryEmail: meta.delivery_email || session.customer_details?.email,
    siteUrl: meta.site_url,
    brandName: meta.brand_name,
  });

  // Send the intake link once. When storage is down we still send it, because the buyer
  // needs the link more than we need the bookkeeping.
  if (result.isNew !== false) {
    const to = meta.delivery_email || session.customer_details?.email;
    sendTemplate(to, paymentConfirmation({ slug: meta.offer, sessionId: session.id })).catch(() => {});
  }
  return { ok: true, handled: true, orderId: result.id };
}

export async function fulfillFromIntent(intent) {
  const meta = intent.metadata || {};
  const uid = meta.uid;
  if (!uid) return { ok: false, reason: "no_uid" }; // e.g. an operator Payment Link w/o an account

  const pricing = trustPricingFromMetadata(meta);
  const orderId = `order_${uid}_${meta.offer || intent.id}`;
  const sb = supabaseAdmin();

  // Pull the user's intake draft (details + uploaded file path), if any.
  let draft = null;
  if (meta.offer) {
    const { data } = await sb.from("drafts").select("data, upload_path").eq("user_id", uid).eq("offer", meta.offer).maybeSingle();
    draft = data;
  }

  // Atomic insert-if-absent (deterministic id + ON CONFLICT DO NOTHING).
  const { data: inserted, error } = await sb
    .from("orders")
    .upsert(
      {
        id: orderId,
        user_id: uid,
        offer: pricing.offer,
        label: pricing.label,
        amount: intent.amount ?? pricing.amount,
        currency: intent.currency || "usd",
        status: "received",
        stripe_payment_intent: intent.id,
        upload_path: draft?.upload_path || meta.upload_path || null,
        meta: { receipt_email: intent.receipt_email || null, intake: draft?.data || null },
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;

  // Flip the user to paid (server-managed field; clients can't write it).
  await sb.from("profiles").update({ payment_status: "paid" }).eq("id", uid);

  const isNew = Array.isArray(inserted) && inserted.length > 0;
  if (isNew) {
    // best-effort; never fail fulfillment on a notification error
    sendReceipt({ to: intent.receipt_email || meta.email, label: pricing.label, amount: intent.amount ?? pricing.amount, orderId }).catch(() => {});
  }
  return { ok: true, orderId, isNew };
}
