// Account Payment Element and first-use orders reuse care's charge-before-receipt
// facts: a refund, dispute, or early fraud warning holds delivery.
import { providerId } from "./care-contract.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { stripe } from "./stripe.js";

const HOLD_EVENTS = new Set(["charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created"]);

export function isAccountChargeHoldEvent(type) {
  return HOLD_EVENTS.has(type);
}

export function accountChargeHold(charge, eventType) {
  if (!charge) return null;
  const refunded = charge.refunded === true;
  const disputed = charge.disputed === true || eventType === "charge.dispute.created";
  const earlyFraud = eventType === "radar.early_fraud_warning.created";
  const amountRefunded = Number.isInteger(charge.amount_refunded) ? charge.amount_refunded : 0;
  if (!refunded && !disputed && amountRefunded <= 0 && !earlyFraud) return null;
  return {
    status: refunded ? "refunded" : "review",
    amountRefunded,
    total: refunded,
    disputed,
    earlyFraud,
  };
}

export async function readAccountChargeHold(intent, { stripeClient = stripe, live } = {}) {
  const chargeId = providerId(intent?.latest_charge, "ch");
  if (!chargeId) return null;
  if (!stripeClient?.charges?.retrieve) throw new Error("The current charge could not be read");
  const charge = await stripeClient.charges.retrieve(chargeId);
  if (charge.livemode !== live || providerId(charge.payment_intent, "pi") !== intent.id) {
    throw new Error("The account charge does not match the payment");
  }
  return accountChargeHold(charge);
}

export async function applyAccountOrderHold(sb, { paymentIntentId, hold }) {
  if (!hold || !providerId(paymentIntentId, "pi")) return { found: false };
  const { data: existing, error } = await sb.from("orders")
    .select("id,status,meta,stripe_payment_intent")
    .eq("stripe_payment_intent", paymentIntentId)
    .maybeSingle();
  if (error) throw error;
  if (!existing) return { found: false };
  const meta = {
    ...(existing.meta && typeof existing.meta === "object" ? existing.meta : {}),
    charge_hold: {
      status: hold.status,
      amountRefunded: hold.amountRefunded,
      total: hold.total,
      disputed: hold.disputed === true,
      earlyFraud: hold.earlyFraud === true,
    },
  };
  const status = existing.status === "delivered" || existing.status === "refunded"
    ? existing.status
    : hold.status;
  const { error: updateError } = await sb.from("orders")
    .update({ status, meta })
    .eq("id", existing.id)
    .eq("stripe_payment_intent", paymentIntentId);
  if (updateError) throw updateError;
  return { found: true, orderId: existing.id, status, alreadyDelivered: existing.status === "delivered" };
}

export async function holdAccountOrderFromCharge(event, {
  stripeClient = stripe,
  sb,
  live,
} = {}) {
  if (!isAccountChargeHoldEvent(event?.type)) return { found: false };
  const object = event.data?.object;
  const chargeId = event.type === "charge.refunded" ? providerId(object, "ch") : providerId(object?.charge, "ch");
  if (!chargeId) return { found: false };
  const charge = event.type === "charge.refunded" ? object : await stripeClient.charges.retrieve(chargeId);
  if (charge.livemode !== live) return { found: false };
  const paymentIntentId = providerId(charge.payment_intent, "pi");
  if (!paymentIntentId) return { found: false };
  const hold = accountChargeHold(charge, event.type);
  if (!hold) return { found: false };
  return applyAccountOrderHold(sb ?? supabaseAdmin(), { paymentIntentId, hold });
}
