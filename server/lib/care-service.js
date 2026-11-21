import Stripe from "stripe";
import {
  CARE_OFFERS, CareError, careLink, careOrigin, carePaidPeriod, checkoutArgs, checkedSession,
  isOrderId, newIntegrationId, providerId, readCareIntake, subscriptionOfInvoice, subscriptionWillNotRenew, verifyCareToken,
} from "./care-contract.js";
import { openCareStore } from "./care-store.js";
import { createTaskQuoteService } from "./task-quotes.js";
import { releaseRunOf } from "./release-run.js";
import { recordJourney } from "./journey-events.js";
import { recordCommerceJourney } from "./commerce-journey.js";

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
    live: /^(sk|rk)_live_/.test(key), portalConfiguration: env.SDS_CARE_PORTAL_CONFIGURATION,
    releaseRun: env.SDS_PRIVATE_PREVIEW === "1" ? releaseRunOf(env) : null });
}

export function createCareService({ store, stripe, secret, origin, live, portalConfiguration, releaseRun = null, now = () => new Date() }) {
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

  async function read(id, key) {
    let order = await byCapability(id, key, "intake");
    if (order.state === "created" && order.session_id) {
      const session = await stripe.checkout.sessions.retrieve(order.session_id);
      if (checkedSession(order, session).status === "expired") {
        await store.expire(id, session.id);
        order = await store.order(id);
      } else order = await paidSession(order, session);
    }
    return {
      offer: order.offer, title: CARE_OFFERS[order.offer].title, amountCents: order.amount_cents,
      state: order.state, receivedIntake: Boolean(order.intake),
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
        const period = carePaidPeriod(object, order);
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

  return { start, read, submit, portal, eventIsCare, taskRequests: store.taskRequests,
    issueQuote: quotes.issue, close: () => store.close() };
}
