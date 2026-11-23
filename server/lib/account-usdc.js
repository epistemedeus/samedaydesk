import { createHash, randomUUID } from "node:crypto";
import { getOffer } from "../pricing.js";
import { CareError } from "./care-contract.js";
import { preparePaymentIntake } from "./payment-attempt.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { sendReceipt } from "./notify.js";
import { recordCommerceJourney } from "./commerce-journey.js";
import { projectRailChange } from "./order-rail-state.js";

const root = "https://agents.samedaydesk.com/order-payments/sds/";
const conflict = () => new CareError(409, "Your current payment must be confirmed before opening another method.");

export function accountRailQuote(row) {
  const offer = getOffer(row.offer);
  if (!offer || !row.intake_hash || row.currency !== "usd" || row.checkout_rail !== "usdc") throw conflict();
  const created = Date.parse(row.created_at);
  const version = createHash("sha256").update(JSON.stringify([row.id, row.user_id, row.facts_hash, row.intake_hash,
    row.rail_id, row.offer, row.amount, row.currency])).digest("hex");
  return { id: row.rail_id, resource: root + row.rail_id, cents: row.amount, version, created, expires: created + 2 * 3600000,
    state: "waiting", ...row.rail_state };
}

export function accountUsdc({ getAdmin = supabaseAdmin, stripe, enabled, live = true, prepareIntake = preparePaymentIntake, receipt = sendReceipt, journey = recordCommerceJourney }) {
  const get = async (query) => {
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  };
  const table = () => getAdmin().from("payment_attempts");
  const byId = id => get(table().select("*").eq("id", id));
  async function delivery(row) {
    async function mark(key, ack) {
      const {data,error} = await getAdmin().rpc("account_usdc_delivery",{p_id:row.rail_id,p_key:key,p_ack:ack});
      if (error) throw error;
      return data;
    }
    const keys = ["checkout_started"];
    if (row.status === "succeeded") keys.push("payment_verified","receipt");
    if (row.rail_state?.state === "refunded") keys.push("payment_refunded");
    for (const key of keys) {
      if (row.rail_delivery?.[key]?.acknowledged || !await mark(key,false)) continue;
      const received = key === "receipt" ? await receipt({ to: row.stripe_create_params.receipt_email,
        amount: row.amount, label: getOffer(row.offer).label, orderId: "order_" + row.id }) :
        await journey(key, { key: "usdc/" + row.rail_id, orderId: row.id, sessionId: row.rail_id, live,
          utm: { payment_method: "base_usdc" } });
      if (received) await mark(key,true);
    }
  }
  async function start({ uid, paymentAttemptId, intake }) {
    if (!enabled || typeof paymentAttemptId !== "string") throw conflict();
    let row = await byId(paymentAttemptId);
    if (!row || row.user_id !== uid || row.amount !== getOffer(row.offer)?.amount) throw conflict();
    if (row.checkout_rail === "stripe" && row.status === "open") {
      const prepared = await prepareIntake({ stripeClient: stripe, uid, paymentAttemptId, intake });
      if (!prepared.ok) throw new CareError(prepared.status, prepared.error);
      const selected = await get(table().update({ rail_id: randomUUID(), checkout_rail: "switching" })
        .eq("id", row.id).eq("user_id", uid).eq("status","open").eq("checkout_rail","stripe")
        .eq("stripe_payment_intent", row.stripe_payment_intent).select("*"));
      row = selected ?? await byId(row.id);
    }
    if (row.checkout_rail === "switching") {
      const previous = await stripe.paymentIntents.retrieve(row.stripe_payment_intent);
      if (previous.metadata?.payment_attempt_id !== row.id || previous.metadata?.uid !== uid || previous.amount !== row.amount ||
          previous.currency !== row.currency || previous.livemode !== live) throw conflict();
      let confirmed = previous;
      if (["requires_payment_method","requires_confirmation","requires_action"].includes(previous.status)) {
        // Stripe serializes confirm vs cancel. A lost cancel reply is recovered by retrieve on the same PI.
        confirmed = await stripe.paymentIntents.cancel(previous.id, {}, { idempotencyKey: "sds-method-switch/" + row.id });
      }
      if (confirmed.id !== previous.id || confirmed.status !== "canceled") throw conflict();
      row = await get(table().update({ checkout_rail: "usdc" }).eq("id",row.id).eq("status","open")
        .eq("checkout_rail","switching").eq("rail_id",row.rail_id).select("*")) ?? await byId(row.id);
    }
    const quote = accountRailQuote(row);
    await delivery(row);
    return { paymentUrl: quote.resource, order: row.id };
  }
  async function change(id, action, body) {
    for (let index = 0; index < 5; index++) {
      const row = await get(table().select("*").eq("rail_id",id).eq("checkout_rail","usdc"));
      if (!row) throw new CareError(404, "Order not found.");
      const quote = accountRailQuote(row);
      const plan = projectRailChange(quote, action, body);
      if (!plan.patch) {
        if (action === "load") await delivery(row);
        return plan.value;
      }
      const state = { ...row.rail_state, ...plan.patch };
      const { data, error } = await getAdmin().rpc("account_usdc_transition", {
        p_id: id, p_revision: row.rail_revision, p_next: state, p_state: state.state ?? "waiting",
      });
      if (error) throw error;
      if (!data) continue;
      if (["paid","refunded"].includes(plan.patch.state)) await delivery(await byId(row.id));
      return plan.value ?? { ...quote, ...state };
    }
    throw conflict();
  }
  return { start, change, byId };
}
