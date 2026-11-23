import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const immutable = (value) => Object.freeze(value);
export const CHECKOUT_BRANDING = immutable({ display_name: "SameDayDesk" });
export const CARE_OFFERS = immutable({
  agent_front_door: immutable({ title: "One line for your customers' AI", cents: 24900, mode: "payment" }),
  machine_payment_route: immutable({ title: "Get paid by AI agents", cents: 49900, mode: "payment" }),
  agent_storefront: immutable({ title: "A shop AI agents can buy from", cents: 99900, mode: "payment" }),
  keep_it_working: immutable({ title: "Keep it working", cents: 10000, mode: "subscription" }),
});
// Watch is sold through its existing catalog link and requires repository intake.
export const watchOffer=immutable({id:"legacy_skill_watch",title:"SkillGuard Watch",cents:1200,interval:"month",mode:"subscription"});
export const careServiceOffer = key => key === watchOffer.id
  ? watchOffer : Object.hasOwn(CARE_OFFERS,key) ? CARE_OFFERS[key] : null;
// Receipt projection only. Catalog and stored payment obligations are unchanged.
export function careReceiptAmount(order) {
  if (order.checkout_rail !== "usdc") return { amountCents: order.amount_cents, currency: "USD" };
  let amountCents = order.rail_qa_cents ?? order.amount_cents;
  const amount = order.rail_observation?.state === "paid" ? order.rail_observation.evidence?.amount : null;
  if (amount != null) {
    if (typeof amount !== "string" || !/^[1-9][0-9]*$/.test(amount)) throw new Error("Invalid Care receipt amount");
    const atomic = BigInt(amount);
    if (atomic % 10000n || atomic / 10000n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid Care receipt amount");
    amountCents = Number(atomic / 10000n);
  }
  return { amountCents, currency: "USDC" };
}
export const isOrderId = (value) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const providerId = (value, prefix) => typeof (value?.id ?? value) === "string" &&
  new RegExp(`^${prefix}_[A-Za-z0-9_]{2,150}$`).test(value?.id ?? value) ? value?.id ?? value : null;

export class CareError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function newIntegrationId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return "sameday-care-" + [...randomBytes(8)].map((byte) => alphabet[byte % alphabet.length]).join("");
}

export function careOrigin(env) {
  const value = new URL(env.SDS_CARE_ORIGIN || "https://samedaydesk.com");
  if (value.href !== value.origin + "/" || (value.origin !== "https://samedaydesk.com" &&
      !(env.SDS_PRIVATE_PREVIEW === "1" && value.protocol === "http:" && value.hostname === "127.0.0.1"))) {
    throw new Error("Invalid SameDayDesk care origin");
  }
  return value.origin;
}

export function careToken(secret, id, purpose) {
  return createHmac("sha256", secret).update(`sameday-care/v1/${purpose}/${id}`).digest("base64url");
}

export function verifyCareToken(secret, id, purpose, supplied) {
  if (!isOrderId(id) || typeof supplied !== "string" || !/^[\w-]{43}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(careToken(secret, id, purpose)), Buffer.from(supplied));
}

export function careLink(order, secret, purpose = "intake") {
  const path = purpose === "cancel" ? "/care/subscription" : "/care/intake";
  return `${order.checkout_origin}${path}#${new URLSearchParams({ order: order.id, key: careToken(secret, order.id, purpose) })}`;
}

// releaseRun tags a private preview's test session for the release harness (metadata.release_run).
export function checkoutArgs(order, secret, releaseRun = null) {
  const offer = CARE_OFFERS[order.offer];
  if (!offer || offer.cents !== order.amount_cents) throw new Error("Stored care offer changed");
  const metadata = { sds_care_order: order.id, journey_session: order.journey_session || order.id,
    ...(releaseRun ? { release_run: releaseRun } : {}) };
  return {
    mode: offer.mode,
    branding_settings: CHECKOUT_BRANDING,
    integration_identifier: order.integration_id,
    client_reference_id: order.id,
    expires_at: Math.floor(new Date(order.checkout_expires_at).getTime() / 1000),
    metadata,
    line_items: [{
      quantity: 1, price_data: {
        currency: "usd", unit_amount: offer.cents, product_data: { name: offer.title },
        ...(offer.mode === "subscription" ? { recurring: { interval: "month" } } : {}),
      },
    }],
    adaptive_pricing: { enabled: false },
    ...(offer.mode === "subscription" ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
    success_url: careLink(order, secret),
    cancel_url: `${order.checkout_origin}/care/buy?offer=${order.offer}&left=1`,
  };
}

// Non-card payment for the monthly offer (behind SDS_CARE_NONCARD). Checkout takes neither bank transfers
// nor stablecoins in subscription mode, so Stripe's own route is a subscription that sends an invoice:
// the buyer pays on Stripe's hosted invoice page, and invoice.paid confirms the order like a card renewal.
// A US bank transfer also takes international wires, so EU buyers pay the same USD price.
export const NONCARD_METHODS = immutable({
  bank_transfer: immutable({ payment_method_types: ["customer_balance"],
    payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "us_bank_transfer" } } } }),
  stablecoin: immutable({ payment_method_types: ["crypto"] }),
});
export const NONCARD_PRICE_KEY = "sameday_care_keep_it_working_monthly_usd";
export const NONCARD_DAYS_DUE = 7;

export function invoiceSubscriptionArgs(order, { customer, price, method, releaseRun = null }) {
  const offer = CARE_OFFERS[order.offer];
  if (order.offer !== "keep_it_working" || offer.cents !== order.amount_cents || !Object.hasOwn(NONCARD_METHODS, method)) {
    throw new Error("Only the monthly offer is sold by invoice");
  }
  const metadata = { sds_care_order: order.id, journey_session: order.journey_session || order.id, sds_care_method: method,
    ...(releaseRun ? { release_run: releaseRun } : {}) };
  return { customer, items: [{ price }], collection_method: "send_invoice", days_until_due: NONCARD_DAYS_DUE,
    payment_settings: NONCARD_METHODS[method], metadata };
}

export function checkedSession(order, session) {
  const expected = CARE_OFFERS[order.offer];
  if (!expected || order.amount_cents !== expected.cents || session?.livemode !== order.live_mode ||
      session.client_reference_id !== order.id || session.metadata?.sds_care_order !== order.id ||
      session.mode !== expected.mode || session.amount_total !== order.amount_cents || session.currency !== "usd" ||
      !providerId(session.id, "cs") || (order.session_id && order.session_id !== session.id)) {
    throw new CareError(409, "This Checkout does not match the order.");
  }
  return session;
}

export function readCareIntake(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !["surface", "outcome", "releaseChannel"].includes(key))) {
    throw new CareError(400, "Enter the details in the form.");
  }
  const field = (name, limit) => {
    const result = typeof value[name] === "string" ? value[name].trim() : "";
    if (result.length > limit) throw new CareError(400, "Shorten the description.");
    return result;
  };
  const surface = field("surface", 400), outcome = field("outcome", 1200), releaseChannel = field("releaseChannel", 400);
  if (!surface || outcome.length < 12) throw new CareError(400, "Tell us which workflow to check and what passing means.");
  return { surface, outcome, releaseChannel };
}

export function subscriptionOfInvoice(invoice) {
  return providerId(invoice.parent?.subscription_details?.subscription ?? invoice.subscription, "sub");
}

// The hosted portal can set an exact cancel_at without setting
// cancel_at_period_end. Both mean that future renewal has been canceled.
export const subscriptionWillNotRenew = (subscription) => subscription.status === "canceled" ||
  subscription.cancel_at_period_end === true || (Number.isSafeInteger(subscription.cancel_at) && subscription.cancel_at > 0);

export function carePaidPeriod(invoice, order) {
  const item = invoice.lines?.data?.[0];
  const start = Number(item?.period?.start), end = Number(item?.period?.end);
  if (invoice.livemode !== order.live_mode || invoice.status !== "paid" || invoice.currency !== "usd" ||
      invoice.amount_paid !== order.amount_cents || !["subscription_create", "subscription_cycle"].includes(invoice.billing_reason) ||
      providerId(invoice.customer, "cus") !== order.customer_id || subscriptionOfInvoice(invoice) !== order.subscription_id ||
      !providerId(invoice.id, "in") || invoice.lines?.data?.length !== 1 || invoice.lines?.has_more ||
      item?.amount !== order.amount_cents || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      end - start < 27 * 86400 || end - start > 32 * 86400) return null;
  return { start: new Date(start * 1000), end: new Date(end * 1000) };
}
