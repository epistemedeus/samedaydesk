// Idempotent fulfillment. Safe to run twice (webhook + verify-on-return + Stripe retries
// all call it). The order id is deterministic and ON CONFLICT DO NOTHING makes the insert
// atomic. The server re-validates pricing from Stripe metadata — never trusts the client.
import { supabaseAdmin } from "./supabase-admin.js";
import { trustPricingFromMetadata } from "../pricing.js";
import { sendReceipt } from "./notify.js";

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
