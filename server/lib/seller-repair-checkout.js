// Unauthenticated hosted Checkout for the fixed seller-contract-repair offer.
// Finding IDs are bounded to the public brief catalog; amount and label are server-owned.
import { stripe } from "./stripe.js";
import { getOffer, CURRENCY } from "../pricing.js";
import { sellerRepairFindingIds } from "./pulse.js";

export const SELLER_CONTRACT_REPAIR_SLUG = "seller_contract_repair";
export const SELLER_REPAIR_INTEGRATION_ID = "seller-contract-repair-sdrprwx";
export const FINDING_ID_RE = /^[a-z0-9-]{1,96}$/;
const PAID_CHECKOUT_SESSION_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

const ALLOWED_FINDING_IDS = new Set(sellerRepairFindingIds);

export function isValidSellerRepairFindingId(findingId) {
  return typeof findingId === "string"
    && FINDING_ID_RE.test(findingId)
    && ALLOWED_FINDING_IDS.has(findingId);
}

export function publicBaseUrl() {
  const raw = process.env.PUBLIC_URL || "https://samedaydesk.com";
  return raw.replace(/\/$/, "");
}

export function buildSellerRepairCheckoutSessionParams(findingId, offer, baseUrl) {
  const briefPath = `/x402/seller-conformance?finding=${encodeURIComponent(findingId)}`;
  const stamped = {
    offer: SELLER_CONTRACT_REPAIR_SLUG,
    amount: String(offer.amount),
    label: offer.label,
    finding_id: findingId,
  };

  return {
    mode: "payment",
    client_reference_id: findingId,
    integration_identifier: SELLER_REPAIR_INTEGRATION_ID,
    line_items: [
      {
        price_data: {
          currency: CURRENCY,
          unit_amount: offer.amount,
          product_data: { name: `SameDayDesk · ${offer.label}` },
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}${briefPath}&checkout=returned`,
    cancel_url: `${baseUrl}${briefPath}`,
    metadata: stamped,
    payment_intent_data: { metadata: stamped },
  };
}

export function sellerRepairCheckoutNotificationContext(session, intent = {}) {
  const sessionMeta = session.metadata || {};
  const intentMeta = intent.metadata || {};
  return {
    findingId: sessionMeta.finding_id || intentMeta.finding_id || "—",
    offerLabel: sessionMeta.label || intentMeta.label || "—",
    amountDisplay: session.amount_total
      ? `$${(session.amount_total / 100).toFixed(2)}`
      : "—",
  };
}

export function isPaidCheckoutSessionEvent(event) {
  return PAID_CHECKOUT_SESSION_EVENTS.has(event?.type)
    && event?.data?.object?.payment_status === "paid";
}

export async function createSellerRepairCheckoutSession(findingId) {
  if (!isValidSellerRepairFindingId(findingId)) {
    return { ok: false, status: 400, error: "Invalid finding ID" };
  }

  const offer = getOffer(SELLER_CONTRACT_REPAIR_SLUG);
  if (!offer) {
    return { ok: false, status: 500, error: "Offer not configured" };
  }

  const params = buildSellerRepairCheckoutSessionParams(findingId, offer, publicBaseUrl());
  const session = await stripe.checkout.sessions.create(params);
  if (!session?.url) {
    return { ok: false, status: 502, error: "Could not start checkout" };
  }

  return { ok: true, url: session.url };
}
