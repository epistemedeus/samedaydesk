import Stripe from "stripe";
import {
  CARE_OFFERS, CareError, NONCARD_DAYS_DUE, NONCARD_METHODS, NONCARD_PRICE_KEY, careLink, careOrigin, carePaidPeriod,
  checkoutArgs, checkedSession, invoiceSubscriptionArgs, isOrderId, newIntegrationId, providerId, readCareIntake, subscriptionOfInvoice, subscriptionWillNotRenew, verifyCareToken,
} from "./care-contract.js";
import { openCareStore } from "./care-store.js";
import { createTaskQuoteService } from "./task-quotes.js";
import { releaseRunOf } from "./release-run.js";
import { recordJourney } from "./journey-events.js";
import { recordCommerceJourney } from "./commerce-journey.js";
import { getOffer } from "../pricing.js";

const HOUR = 3600_000;
const email = (value) => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
const allowedStripeUrl = (url, host) => {
  try {
    const parsed = new URL(url);
    if (parsed.origin === `https://${host}` && !parsed.username && !parsed.password) return parsed.href;
  } catch { /* provider response is not trusted as a redirect */ }
  throw new CareError(502, "We could not open the payment page.");
};

export function configuredCareService(env = process.env) {
  if (env.SDS_CARE_CHECKOUT !== "1") return null;
  const key = env.STRIPE_SECRET_KEY || "";
  if (!/^(sk|rk)_(test|live)_/.test(key) || (env.SDS_PRIVATE_PREVIEW === "1" && !/^(sk|rk)_test_/.test(key)) ||
      (env.SDS_PRIVATE_PREVIEW !== "1" && !/^(sk|rk)_live_/.test(key))) throw new Error("Invalid Stripe mode for care checkout");
  if (!env.STRIPE_WEBHOOK_SECRET || !env.SDS_CARE_ACCESS_SECRET || Buffer.byteLength(env.SDS_CARE_ACCESS_SECRET) < 32) {
    throw new Error("Care checkout requires a signing secret and an independent access secret");
  }
  if (env.SDS_PRIVATE_PREVIEW !== "1" && !providerId(env.SDS_CARE_PORTAL_CONFIGURATION, "bpc")) {
    throw new Error("The care subscription requires a configured cancellation portal");
  }
  const store = openCareStore(env);
  if (!store) throw new Error("Care checkout requires its PostgreSQL store");
  const stripe = new Stripe(key, { apiVersion: "2026-11-18.endive", timeout: 8000, maxNetworkRetries: 1 });
  return createCareService({ store, stripe, secret: env.SDS_CARE_ACCESS_SECRET, origin: careOrigin(env),
    live: /^(sk|rk)_live_/.test(key), portalConfiguration: env.SDS_CARE_PORTAL_CONFIGURATION, noncard: env.SDS_CARE_NONCARD === "1",
    orderPayments: env.SDS_ORDER_USDC === "1" && (env.ORDER_PAYMENTS_SDS_TOKEN?.length ?? 0) >= 32,
    stablecoin: env.SDS_CARE_STABLECOIN === "1",
    releaseRun: env.SDS_PRIVATE_PREVIEW === "1" ? releaseRunOf(env) : null });
}

export function createCareService({ store, stripe, secret, origin, live, portalConfiguration, noncard = false, stablecoin = false, orderPayments = false, releaseRun = null, now = () => new Date() }) {
  const quotes = createTaskQuoteService({ store: store.quotes, stripe, live, now });
  const notFound = () => new CareError(404, "This receipt link is not available.");
  const matchesMode = (order) => order && order.live_mode === live;

  async function byCapability(id, key, purpose) {
    if (!verifyCareToken(secret, id, purpose, key)) throw notFound();
    const order = await store.order(id);
    if (!matchesMode(order)) throw notFound();
    return order;
  }

  async function paidSession(order, raw) {
    const session = checkedSession(order, raw);
    if (session.status !== "complete" || session.payment_status !== "paid") return order;
    const buyer = email(session.customer_details?.email);
    const subscription = providerId(session.subscription, "sub");
    const customer = providerId(session.customer, "cus");
    const payment = providerId(session.payment_intent, "pi");
    if (!buyer || (order.offer === "keep_it_working" ? !subscription || !customer : !payment)) {
      throw new CareError(409, "Payment details could not be matched.");
    }
    return store.checkoutPaid({ id: order.id, sessionId: session.id, customerId: customer,
      paymentId: payment, subscriptionId: subscription, email: buyer, at: now() });
  }

  async function start(offerKey, id, journeySession = null) {
    if (typeof offerKey !== "string" || !Object.hasOwn(CARE_OFFERS, offerKey) || !isOrderId(id)) {
      throw new CareError(400, "Choose a service and start a new checkout.");
    }
    const offer = CARE_OFFERS[offerKey];
    const order = await store.reserve({ id, offer: offerKey, cents: offer.cents, live, origin,
      expires: new Date(now().getTime() + 2 * HOUR), integrationId: newIntegrationId(),
      journeySession: isOrderId(journeySession) ? journeySession : id });
    const expired = () => new CareError(409, "This checkout expired. You can start a new one.", "checkout_expired");
    if (order.state === "expired") throw expired();
    if (order.state !== "created") throw new CareError(409, "This checkout is no longer open.");
    if (!order.session_id && new Date(order.checkout_expires_at).getTime() - now().getTime() < 35 * 60_000) {
      throw new CareError(409, "This checkout could not be confirmed. Contact SameDayDesk before trying another payment.");
    }
    const session = checkedSession(order, order.session_id
      ? await stripe.checkout.sessions.retrieve(order.session_id)
      : await stripe.checkout.sessions.create(checkoutArgs(order, secret, releaseRun), { idempotencyKey: `sameday-care/${id}` }));
    await store.bindSession({ id, sessionId: session.id });
    await recordCommerceJourney("checkout_started", { key: session.id, orderId: id,
      sessionId: order.journey_session || id, live });
    if (session.status === "expired") {
      await store.expire(id, session.id);
      throw expired();
    }
    if (session.status !== "open") {
      await paidSession(order, session);
      throw new CareError(409, "This checkout is no longer open. Use the receipt link from your order.");
    }
    return { url: allowedStripeUrl(session.url, "checkout.stripe.com") };
  }

  async function startUsdc(offerKey, id, buyerEmail, journeySession) {
    const offer = Object.hasOwn(CARE_OFFERS, offerKey) && CARE_OFFERS[offerKey];
    const buyer = email(buyerEmail)?.toLowerCase();
    if (!orderPayments || offer?.mode !== "payment" || !buyer || !isOrderId(id)) {
      throw new CareError(400, "Choose a service and enter your receipt email.");
    }
    const order = await store.reserve({ id, offer: offerKey, cents: offer.cents, live, origin, rail: "usdc", railEmail: buyer,
      expires: new Date(now().getTime() + 2 * HOUR), integrationId: newIntegrationId(), journeySession: isOrderId(journeySession) ? journeySession : id });
    return { paymentUrl: "https://agents.samedaydesk.com/order-payments/sds/" + order.rail_id, receipt: careLink(order, secret) };
  }

  const methods = (offerKey) => ["card", ...(orderPayments && Object.hasOwn(CARE_OFFERS, offerKey) &&
    CARE_OFFERS[offerKey].mode === "payment" ? ["base_usdc"] : []), ...(noncard && offerKey === "keep_it_working"
    ? ["bank_transfer", ...(stablecoin ? ["stablecoin"] : [])] : [])];

  // One monthly price for the invoice route, found by its lookup key and checked before use.
  async function invoicePrice() {
    const offer = CARE_OFFERS.keep_it_working;
    const matches = (price) => price.active && price.livemode === live && price.currency === "usd" &&
      price.unit_amount === offer.cents && price.recurring?.interval === "month" && price.recurring?.interval_count === 1;
    const [found] = (await stripe.prices.list({ lookup_keys: [NONCARD_PRICE_KEY], limit: 1 })).data;
    if (found) {
      if (!matches(found)) throw new CareError(503, "This payment method is not available right now.");
      return found.id;
    }
    const created = await stripe.prices.create({ currency: "usd", unit_amount: offer.cents, recurring: { interval: "month" },
      product_data: { name: offer.title }, lookup_key: NONCARD_PRICE_KEY }, { idempotencyKey: `sameday-care-price/${NONCARD_PRICE_KEY}` });
    if (!matches(created)) throw new CareError(503, "This payment method is not available right now.");
    return created.id;
  }

  async function startInvoice(offerKey, id, method, buyerEmail, journeySession = null) {
    if (!methods(offerKey).includes(method) || method === "card" || !isOrderId(id)) {
      throw new CareError(400, "Choose a service and a payment method.");
    }
    const buyer = email(buyerEmail);
    if (!buyer) throw new CareError(400, "Enter the email address for your invoice.");
    const offer = CARE_OFFERS[offerKey];
    const order = await store.reserve({ id, offer: offerKey, cents: offer.cents, live, origin,
      expires: new Date(now().getTime() + (NONCARD_DAYS_DUE + 1) * 24 * HOUR), integrationId: newIntegrationId(),
      journeySession: isOrderId(journeySession) ? journeySession : id });
    if (order.state !== "created" || order.session_id) throw new CareError(409, "This order is no longer open.");
    const metadata = { sds_care_order: id, ...(releaseRun ? { release_run: releaseRun } : {}) };
    const customer = order.customer_id ? await stripe.customers.retrieve(order.customer_id)
      : await stripe.customers.create({ email: buyer, metadata }, { idempotencyKey: `sameday-care-customer/${id}` });
    if (customer.livemode !== live || customer.metadata?.sds_care_order !== id) throw new CareError(409, "This order is no longer open.");
    const subscription = order.subscription_id ? await stripe.subscriptions.retrieve(order.subscription_id)
      : await stripe.subscriptions.create(invoiceSubscriptionArgs(order, { customer: customer.id, price: await invoicePrice(), method, releaseRun }),
        { idempotencyKey: `sameday-care-subscription/${id}` });
    if (subscription.livemode !== live || subscription.metadata?.sds_care_order !== id || subscription.metadata?.sds_care_method !== method) {
      throw new CareError(409, "This order was started with another payment method. Start a new order.");
    }
    await store.bindInvoice({ id, customerId: customer.id, subscriptionId: subscription.id });
    let invoice = await stripe.invoices.retrieve(providerId(subscription.latest_invoice, "in"));
    if (invoice.status === "draft") invoice = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true });
    await recordCommerceJourney("checkout_started", { key: subscription.id, orderId: id, sessionId: order.journey_session || id, live });
    allowedStripeUrl(invoice.hosted_invoice_url, "invoice.stripe.com");
    // The hosted invoice does not return to us, so the buyer goes to their receipt, which links the open invoice.
    return { receipt: careLink(order, secret) };
  }

  async function read(id, key) {
    let order = await byCapability(id, key, "intake");
    if (order.state === "created" && order.session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.session_id);
      if (checkedSession(order, session).status === "expired") {
        await store.expire(id, session.id);
        order = await store.order(id);
      } else order = await paidSession(order, session);
    }
    let invoiceUrl;
    if (order.state === "created" && !order.session_id && order.subscription_id) {
      const subscription = await stripe.subscriptions.retrieve(order.subscription_id);
      const invoice = await stripe.invoices.retrieve(providerId(subscription.latest_invoice, "in"));
      if (invoice.status === "open") invoiceUrl = allowedStripeUrl(invoice.hosted_invoice_url, "invoice.stripe.com");
    }
    return {
      offer: order.offer, title: CARE_OFFERS[order.offer].title, amountCents: order.amount_cents, ...(invoiceUrl ? { invoiceUrl } : {}),
      ...(order.rail_id ? { paymentUrl: "https://agents.samedaydesk.com/order-payments/sds/" + order.rail_id,
        paymentState: order.rail_refund?.state || order.rail_observation?.state || (order.rail_attempt ? "seen" : "waiting") } : {}),
      state: order.state, receivedIntake: Boolean(order.intake), refundedCents: order.refunded_cents ?? 0,
      ...(order.offer === "keep_it_working" && order.state === "paid"
        ? { subscription: { cancelAtPeriodEnd: order.cancel_at_period_end, status: order.subscription_status || "active" } }
        : {}),
    };
  }

  async function submit(id, key, body) {
    await byCapability(id, key, "intake");
    await store.intake(id, readCareIntake(body));
    recordJourney("form_received", { path: "/care/intake", state: "intake" }, "server");
    return { received: true };
  }

  async function portal(id, key) {
    const order = await byCapability(id, key, "cancel");
    if (!order.subscription_id || !order.customer_id || order.state !== "paid") throw notFound();
    if (!portalConfiguration) throw new CareError(503, "We could not open subscription management. Reply to your receipt for help.");
    const subscription = await stripe.subscriptions.retrieve(order.subscription_id);
    if (subscription.livemode !== live || providerId(subscription.customer, "cus") !== order.customer_id) throw notFound();
    if (subscriptionWillNotRenew(subscription)) return { canceled: true };
    const returnUrl = careLink(order, secret, "cancel");
    const session = await stripe.billingPortal.sessions.create({
      customer: order.customer_id, configuration: portalConfiguration, return_url: returnUrl,
      flow_data: { type: "subscription_cancel",
        subscription_cancel: { subscription: order.subscription_id },
        after_completion: { type: "redirect", redirect: { return_url: returnUrl } } },
    });
    if (session.livemode !== live) throw notFound();
    return { url: allowedStripeUrl(session.url, "billing.stripe.com") };
  }

  async function targetSubscription(id, hint = null) {
    if (!id) return null;
    const order = await store.bySubscription(id);
    if (matchesMode(order)) return order;
    // Events can arrive out of order. Read the bound Checkout from Stripe before
    // accepting an initial invoice, with the same amount and identity checks.
    if (isOrderId(hint)) {
      const pending = await store.order(hint);
      if (matchesMode(pending) && pending.session_id) {
        const current = await paidSession(pending, await stripe.checkout.sessions.retrieve(pending.session_id));
        if (current.subscription_id === id) return current;
        throw new CareError(503, "The corresponding Checkout payment is not confirmed.");
      }
    }
    return null;
  }

  async function eventIsCare(event) {
    if (event.livemode !== live) return false;
    const object = event.data?.object;
    if (!object) return false;
    if (await quotes.event(event)) return true;
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
      "checkout.session.expired"].includes(event.type)) {
      const id = object.metadata?.sds_care_order;
      if (!isOrderId(id)) return false;
      const order = await store.order(id);
      if (!matchesMode(order)) return false;
      checkedSession(order, object);
      if (object.status === "expired" || event.type === "checkout.session.async_payment_failed") {
        await store.expire(id, object.id);
      } else {
        const paid = await paidSession(order, object);
        if (object.status === "complete" && object.payment_status === "paid") {
          const facts = { key: paid.id, orderId: paid.id, sessionId: paid.journey_session || paid.id, live };
          await recordCommerceJourney("payment_verified", facts);
          if (await store.paidBefore(paid)) await recordCommerceJourney("return", facts);
        }
      }
      return true;
    }
    if (event.type === "payment_intent.succeeded" && isOrderId(object.metadata?.sds_care_order)) return true;

    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const id = subscriptionOfInvoice(object);
      const order = await targetSubscription(id, object.parent?.subscription_details?.metadata?.sds_care_order);
      if (!order) return false;
      if (event.type === "invoice.payment_failed") {
        await store.subscriptionState(order.id, { status: "payment_due",
          cancel: order.cancel_at_period_end, at: new Date(event.created * 1000) });
      } else {
        let paid = order;
        if (order.state === "created" && !order.session_id) {
          // The invoice route: its first paid invoice is the payment, matched to the bound customer and subscription.
          paid = await store.invoicePaid({ id: order.id, customerId: providerId(object.customer, "cus"), subscriptionId: id,
            email: email(object.customer_email), at: new Date(event.created * 1000) });
          await recordCommerceJourney("payment_verified", { key: paid.id, orderId: paid.id, sessionId: paid.journey_session || paid.id, live });
        }
        const period = carePaidPeriod(object, paid);
        if (!period) throw new CareError(409, "The invoice does not match the paid service period.");
        await store.paidPeriod(order.id, object.id, period);
      }
      return true;
    }
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const order = await targetSubscription(providerId(object, "sub"), object.metadata?.sds_care_order);
      if (!order) return false;
      // Read current provider state to avoid applying an older event as current.
      const current = await stripe.subscriptions.retrieve(order.subscription_id);
      if (current.livemode !== live || order.customer_id !== providerId(current.customer, "cus")) return false;
      await store.subscriptionState(order.id, { status: current.status, cancel: subscriptionWillNotRenew(current),
        at: now() });
      return true;
    }
    if (["charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created"].includes(event.type)) {
      const chargeId = event.type === "charge.refunded" ? object.id : providerId(object.charge, "ch");
      if (!chargeId) return false;
      const charge = event.type === "charge.refunded" ? object : await stripe.charges.retrieve(chargeId);
      if (charge.livemode !== live) return false;
      const payment = providerId(charge.payment_intent, "pi");
      if (!payment) return false;
      if (await store.hostedRefund(payment, event.type === "charge.refunded" ? charge.amount_refunded : 0,
        event.type === "charge.refunded" && charge.refunded === true)) return true;
      let order = await store.byPayment(payment);
      let invoiceId = null;
      if (!order && providerId(charge.customer, "cus")) {
        const related = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: payment }, limit: 2 });
        if (related.has_more || related.data.length !== 1) return false;
        invoiceId = providerId(related.data[0].invoice, "in");
        if (!invoiceId) return false;
        const invoice = await stripe.invoices.retrieve(invoiceId);
        const sub = subscriptionOfInvoice(invoice);
        if (!sub) return false;
        order = await targetSubscription(sub, invoice.parent?.subscription_details?.metadata?.sds_care_order);
      }
      if (!matchesMode(order)) return false;
      if (providerId(charge.customer, "cus") && order.customer_id &&
          providerId(charge.customer, "cus") !== order.customer_id) return false;
      await store.refundOrRisk(order.id, { totalRefund: !invoiceId && charge.refunded === true,
        refundCents: event.type === "charge.refunded" ? charge.amount_refunded : 0, invoiceId });
      return true;
    }
    return false;
  }

  async function recordHosted(session, intent) {
    if (session?.livemode !== live || intent?.livemode !== live || session.mode !== "payment" ||
        session.status !== "complete" || session.payment_status !== "paid" || intent.status !== "succeeded" ||
        !providerId(session, "cs") || !providerId(intent, "pi") || session.payment_intent !== intent.id ||
        !Number.isInteger(session.amount_total) || session.amount_total < 1 || intent.amount !== session.amount_total ||
        session.currency !== "usd" || intent.currency !== "usd") throw new CareError(409, "The hosted payment is not confirmed.");
    const meta = { ...intent.metadata, ...session.metadata };
    const offer = typeof meta.offer === "string" && /^[a-z0-9_]{1,64}$/.test(meta.offer) ? meta.offer : "custom_quote";
    const known = getOffer(offer);
    if (known && known.amount !== session.amount_total) throw new CareError(409, "The hosted price does not match the offer.");
    const label = known?.label || (typeof meta.label === "string" && meta.label.length <= 160 ? meta.label : "Hosted work");
    const result = await store.hostedOrder({ id: `order_${intent.id}`, session: session.id, payment: intent.id,
      offer, label, amount: session.amount_total, currency: "usd", live });
    if (providerId(intent.latest_charge, "ch")) {
      const charge = await stripe.charges.retrieve(providerId(intent.latest_charge, "ch"));
      if (charge.livemode !== live || providerId(charge.payment_intent, "pi") !== intent.id) {
        throw new CareError(409, "The hosted charge does not match the payment.");
      }
      if (charge.refunded || charge.disputed || charge.amount_refunded > 0) {
        await store.hostedRefund(intent.id, charge.amount_refunded || 0, charge.refunded === true);
        result.held = true;
      }
    }
    return result;
  }

  return { start, startInvoice, startUsdc, usdc: store.usdc, methods, read, submit, portal, eventIsCare, recordHosted, taskRequests: store.taskRequests,
    issueQuote: quotes.issue, close: () => store.close() };
}
