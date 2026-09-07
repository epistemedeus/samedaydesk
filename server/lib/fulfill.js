// Idempotent fulfillment. Safe to run twice (webhook + verify-on-return + Stripe retries
// all call it). New orders key off the PaymentIntent id so a second settled purchase
// gets its own delivery row; two webhooks for the SAME payment still produce one order.
// Legacy rows keyed as order_{uid}_{offer} remain readable and are not rewritten.
import { supabaseAdmin } from "./supabase-admin.js";
import { trustPricingFromMetadata } from "../pricing.js";
import { sendReceipt } from "./notify.js";
import { markPaymentAttemptSucceeded } from "./payment-attempt.js";

export function orderIdForPaymentIntent(intent) {
  if (!intent?.id) throw new Error("payment intent id required for order identity");
  return `order_${intent.id}`;
}

export function legacyOrderIdForUidOffer(uid, offer) {
  return `order_${uid}_${offer}`;
}

export async function fulfillFromIntent(intent, { sb = supabaseAdmin() } = {}) {
  const meta = intent.metadata || {};
  const uid = meta.uid;
  if (!uid) return { ok: false, reason: "no_uid" }; // e.g. an operator Payment Link w/o an account

  const pricing = trustPricingFromMetadata(meta);
  const orderId = orderIdForPaymentIntent(intent);

  // Pull the user's intake draft (details + uploaded file path), if any.
  let draft = null;
  if (meta.offer) {
    const { data } = await sb.from("drafts").select("data, upload_path").eq("user_id", uid).eq("offer", meta.offer).maybeSingle();
    draft = data;
  }

  // Atomic insert-if-absent (PI-based id + ON CONFLICT DO NOTHING).
  // Unique index on stripe_payment_intent also collapses duplicate inserts.
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
        meta: {
          receipt_email: intent.receipt_email || null,
          intake: draft?.data || null,
          payment_attempt_id: meta.payment_attempt_id || null,
        },
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;

  // Flip the user to paid (server-managed field; clients can't write it).
  await sb.from("profiles").update({ payment_status: "paid" }).eq("id", uid);

  if (meta.payment_attempt_id) {
    try {
      await markPaymentAttemptSucceeded({
        attemptId: meta.payment_attempt_id,
        paymentIntentId: intent.id,
      });
    } catch (e) {
      console.error("[fulfill] payment_attempt update", e?.message);
    }
  }

  const isNew = Array.isArray(inserted) && inserted.length > 0;
  if (isNew) {
    // best-effort; never fail fulfillment on a notification error
    sendReceipt({ to: intent.receipt_email || meta.email, label: pricing.label, amount: intent.amount ?? pricing.amount, orderId }).catch(() => {});
  }
  return { ok: true, orderId, isNew };
}
