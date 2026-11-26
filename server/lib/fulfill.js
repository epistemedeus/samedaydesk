// Idempotent fulfillment. Safe to run twice (webhook + verify-on-return + Stripe retries
// all call it). New orders key off the PaymentIntent id so a second settled purchase
// gets its own delivery row; two webhooks for the SAME payment still produce one order.
// Legacy rows keyed as order_{uid}_{offer} remain readable and are not rewritten.
import { supabaseAdmin } from "./supabase-admin.js";
import { AGENT_FIRST_USE_REPORT, CURRENCY, getOffer, trustPricingFromMetadata } from "../pricing.js";
import { firstUseIntentMatches, storedFirstUseIntake } from "./first-use-intake.js";
import { sendReceipt } from "./notify.js";
import { markPaymentAttemptSucceeded } from "./payment-attempt.js";
import { paymentAttemptStoreDeps } from "./payment-attempt-store.js";
import { recordJourney } from "./journey-events.js";

export function orderIdForPaymentIntent(intent) {
  if (!intent?.id) throw new Error("payment intent id required for order identity");
  return `order_${intent.id}`;
}

export function legacyOrderIdForUidOffer(uid, offer) {
  return `order_${uid}_${offer}`;
}

export async function fulfillFromIntent(intent, { sb, attemptStore, live = process.env.SDS_PRIVATE_PREVIEW !== "1", receipt = sendReceipt } = {}) {
  const meta = intent.metadata || {};
  const uid = meta.uid;
  if (!uid && meta.offer !== AGENT_FIRST_USE_REPORT) return { ok: false, reason: "no_uid" }; // e.g. an operator Payment Link w/o an account
  sb ??= supabaseAdmin();
  attemptStore ??= paymentAttemptStoreDeps.getStore();

  const attempt = meta.payment_attempt_id ? await attemptStore.getById(meta.payment_attempt_id) : null;
  const firstUse = meta.offer === AGENT_FIRST_USE_REPORT || attempt?.offer === AGENT_FIRST_USE_REPORT;
  let pricing;
  if (firstUse) {
    const offer = getOffer(AGENT_FIRST_USE_REPORT);
    if (!uid || !attempt || meta.offer !== AGENT_FIRST_USE_REPORT || attempt.offer !== AGENT_FIRST_USE_REPORT ||
        attempt.user_id !== uid || attempt.stripe_payment_intent !== intent.id || attempt.checkout_rail !== "stripe" ||
        attempt.amount !== offer.amount || attempt.currency !== CURRENCY || intent.amount_received !== attempt.amount ||
        intent.status !== "succeeded" || !firstUseIntentMatches(intent, attempt, live)) {
      throw new Error("First-use payment does not match the stored account attempt");
    }
    pricing = { offer: AGENT_FIRST_USE_REPORT, label: offer.label, amount: attempt.amount };
  } else {
    pricing = trustPricingFromMetadata(meta);
  }
  let orderId = orderIdForPaymentIntent(intent);

  // Pull the user's intake draft (details + uploaded file path), if any.
  let draft = null;
  let fulfillmentPending = false;
  if (meta.payment_attempt_id) {
    if (attempt && (attempt.user_id !== uid || attempt.stripe_payment_intent !== intent.id)) {
      throw new Error("Paid payment attempt identity mismatch; reconciliation required");
    }
    if (firstUse) {
      const scope = storedFirstUseIntake(attempt);
      if (scope) draft = { data: { details: scope.details, targetUrl: scope.targetUrl }, upload_path: null };
      else fulfillmentPending = true;
    } else if (attempt?.intake_snapshot) {
      draft = { data: { details: attempt.intake_snapshot.details }, upload_path: attempt.intake_snapshot.uploadPath };
    } else {
      // Never attach a newer same-offer draft to an already paid purchase.
      // Retain a visible paid order needing reconciliation instead of dropping it.
      fulfillmentPending = true;
    }
  } else if (meta.offer) {
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
        status: fulfillmentPending ? "intake_required" : "received",
        stripe_payment_intent: intent.id,
        upload_path: meta.payment_attempt_id ? (draft?.upload_path || null) : (draft?.upload_path || meta.upload_path || null),
        meta: {
          receipt_email: intent.receipt_email || null,
          intake: draft?.data || null,
          payment_attempt_id: meta.payment_attempt_id || null,
          ...(intent.livemode === false ? { test: true } : {}),
          ...(fulfillmentPending ? { fulfillment_issue: "missing_attempt_intake_snapshot" } : {}),
        },
      },
      { onConflict: "stripe_payment_intent", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  const isNew = Array.isArray(inserted) && inserted.length > 0;
  if (!isNew) {
    // A pre-migration order may have this PI under order_{uid}_{offer}.
    // Return its real identity rather than fabricating a nonexistent new ID.
    const { data: existing, error: lookupError } = await sb.from("orders")
      .select(firstUse ? "id,user_id,offer,amount,currency,status" : "id").eq("stripe_payment_intent", intent.id).single();
    if (lookupError) throw lookupError;
    if (firstUse && (!existing || existing.user_id !== uid || existing.offer !== pricing.offer ||
        existing.amount !== pricing.amount || existing.currency !== CURRENCY)) {
      throw new Error("Existing first-use order does not match the stored account attempt");
    }
    if (firstUse && existing.status === "intake_required") fulfillmentPending = true;
    orderId = existing.id;
  }

  // Flip the user to paid (server-managed field; clients can't write it).
  await sb.from("profiles").update({ payment_status: "paid" }).eq("id", uid);

  if (meta.payment_attempt_id) {
    try {
      await markPaymentAttemptSucceeded({
        attemptId: meta.payment_attempt_id,
        paymentIntentId: intent.id,
        store: attemptStore,
      });
    } catch (e) {
      console.error("[fulfill] payment_attempt update", e?.message);
    }
  }

  if (isNew) {
    recordJourney("payment_confirmed", { path: "/checkout", offer: pricing.offer, state: "paid" }, "server");
    // best-effort; never fail fulfillment on a notification error
    receipt({ to: intent.receipt_email || meta.email, label: pricing.label, amount: intent.amount ?? pricing.amount, orderId }).catch(() => {});
  }
  return { ok: true, orderId, isNew, fulfillmentPending };
}
