// Fix Pack license entitlement for the MCP paid tool.
//
// Authority model (bearer license, not authenticated-customer binding):
// The $39 Fix Pack is sold on Stripe Payment Links. After pay, Stripe redirects
// to /mcp?cs=<checkout_session_id> and that session id is the redeemable license.
// Anyone who presents a paid, Fix-Pack-bound session id may call
// generate_complete_fix_pack for any url they supply. The live sale does not
// stamp a customer account or a site-resource scope, so this module must not
// invent either. Entitlement is exact merchant offer binding: trusted Payment
// Link (or stamped Fix Pack offer metadata), exact $39 USD, and paid status.
import { stripe, isStripeConfigured } from "./stripe.js";

export const FIXPACK_AMOUNT_CENTS = 3900;
export const FIXPACK_CURRENCY = "usd";
export const FIXPACK_OFFER_SLUG = "ai_fix_pack";
export const FIXPACK_PAYMENT_LINK_IDS_ENV = "FIXPACK_STRIPE_PAYMENT_LINK_IDS";
export const FIXPACK_PRODUCT_IDS_ENV = "FIXPACK_STRIPE_PRODUCT_IDS";

// Public buy.stripe.com URLs for the merchant-owned $39 Fix Pack.
// MCP redeem path + the long-running human marketing CTA (legacy buyers).
export const FIXPACK_MCP_BUY_URL = "https://buy.stripe.com/8x24gA0xA9DF9dd13YeZ20h";
export const FIXPACK_HUMAN_BUY_URL = "https://buy.stripe.com/28E5kE9465np2OPh2WeZ20e";
export const TRUSTED_FIXPACK_BUY_URLS = Object.freeze([
  FIXPACK_MCP_BUY_URL,
  FIXPACK_HUMAN_BUY_URL,
]);

const STRIPE_PAYMENT_LINK_ID_RE = /^plink_[A-Za-z0-9]+$/;
const STRIPE_PRODUCT_ID_RE = /^prod_[A-Za-z0-9]+$/;
const CHECKOUT_SESSION_ID_RE = /^cs_[A-Za-z0-9_]+$/;

const paymentLinkUrlCache = new Map();

/** Mutable seam for route tests; production reads the live Stripe client. */
export const fixPackLicenseDeps = {
  getStripe: () => stripe,
  isConfigured: isStripeConfigured,
};

export function normalizeBuyUrl(url) {
  try {
    const u = new URL(String(url || "").trim());
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

const TRUSTED_BUY_URL_SET = new Set(TRUSTED_FIXPACK_BUY_URLS.map(normalizeBuyUrl));

export function configuredFixPackPaymentLinkIds(env = process.env) {
  const raw = env?.[FIXPACK_PAYMENT_LINK_IDS_ENV];
  if (typeof raw !== "string" || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter((id) => STRIPE_PAYMENT_LINK_ID_RE.test(id)),
  );
}

export function configuredFixPackProductIds(env = process.env) {
  const raw = env?.[FIXPACK_PRODUCT_IDS_ENV];
  if (typeof raw !== "string" || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter((id) => STRIPE_PRODUCT_ID_RE.test(id)),
  );
}

export function paymentLinkIdFromSession(session) {
  const pl = session?.payment_link;
  if (typeof pl === "string" && STRIPE_PAYMENT_LINK_ID_RE.test(pl)) return pl;
  if (pl && typeof pl.id === "string" && STRIPE_PAYMENT_LINK_ID_RE.test(pl.id)) return pl.id;
  return null;
}

function stampedFixPackOffer(session) {
  const meta = session?.metadata || {};
  const offer = meta.offer || meta.sdd_offer;
  return offer === FIXPACK_OFFER_SLUG;
}

function lineItemProductIds(session) {
  const data = session?.line_items?.data;
  if (!Array.isArray(data)) return [];
  const ids = [];
  for (const item of data) {
    const product = item?.price?.product;
    if (typeof product === "string" && STRIPE_PRODUCT_ID_RE.test(product)) ids.push(product);
    else if (product && typeof product.id === "string" && STRIPE_PRODUCT_ID_RE.test(product.id)) {
      ids.push(product.id);
    }
  }
  return ids;
}

export function sessionHasExactFixPackPaidState(session) {
  if (!session || typeof session !== "object") return false;
  if (session.payment_status !== "paid") return false;
  if (String(session.currency || "").toLowerCase() !== FIXPACK_CURRENCY) return false;
  if (Number(session.amount_total) !== FIXPACK_AMOUNT_CENTS) return false;
  return true;
}

/**
 * Synchronous offer binding when Payment Link / product ids are already known.
 * Does not perform Stripe network I/O.
 */
export function sessionMatchesTrustedFixPackIds(
  session,
  {
    trustedPaymentLinkIds = configuredFixPackPaymentLinkIds(),
    trustedProductIds = configuredFixPackProductIds(),
  } = {},
) {
  if (!sessionHasExactFixPackPaidState(session)) return false;
  if (stampedFixPackOffer(session)) return true;

  const paymentLinkId = paymentLinkIdFromSession(session);
  if (paymentLinkId && trustedPaymentLinkIds instanceof Set && trustedPaymentLinkIds.has(paymentLinkId)) {
    return true;
  }

  if (trustedProductIds instanceof Set && trustedProductIds.size > 0) {
    for (const productId of lineItemProductIds(session)) {
      if (trustedProductIds.has(productId)) return true;
    }
  }
  return false;
}

export async function resolvePaymentLinkBuyUrl(paymentLinkId, stripeClient = fixPackLicenseDeps.getStripe()) {
  if (!paymentLinkId || !stripeClient) return null;
  if (paymentLinkUrlCache.has(paymentLinkId)) return paymentLinkUrlCache.get(paymentLinkId);
  try {
    const link = await stripeClient.paymentLinks.retrieve(paymentLinkId);
    const url = normalizeBuyUrl(link?.url);
    paymentLinkUrlCache.set(paymentLinkId, url || null);
    return url || null;
  } catch {
    paymentLinkUrlCache.set(paymentLinkId, null);
    return null;
  }
}

/**
 * True when the Checkout Session is a paid $39 USD Fix Pack from a trusted
 * merchant Payment Link / product / stamped offer. Amount alone never qualifies.
 */
export async function sessionEntitlesFixPack(
  session,
  {
    trustedPaymentLinkIds = configuredFixPackPaymentLinkIds(),
    trustedProductIds = configuredFixPackProductIds(),
    resolveBuyUrl = resolvePaymentLinkBuyUrl,
  } = {},
) {
  if (!sessionHasExactFixPackPaidState(session)) return false;
  if (sessionMatchesTrustedFixPackIds(session, { trustedPaymentLinkIds, trustedProductIds })) {
    return true;
  }

  const paymentLinkId = paymentLinkIdFromSession(session);
  if (!paymentLinkId || typeof resolveBuyUrl !== "function") return false;
  const buyUrl = await resolveBuyUrl(paymentLinkId);
  return Boolean(buyUrl && TRUSTED_BUY_URL_SET.has(buyUrl));
}

export async function validateFixPackLicense(
  license,
  {
    stripeClient = fixPackLicenseDeps.getStripe(),
    configured = fixPackLicenseDeps.isConfigured,
    trustedPaymentLinkIds = configuredFixPackPaymentLinkIds(),
    trustedProductIds = configuredFixPackProductIds(),
    resolveBuyUrl,
  } = {},
) {
  const id = String(license || "").trim();
  if (!configured() || !CHECKOUT_SESSION_ID_RE.test(id) || !stripeClient) return false;
  try {
    const session = await stripeClient.checkout.sessions.retrieve(id, {
      expand: ["line_items.data.price.product", "payment_link"],
    });
    const resolve =
      resolveBuyUrl
      || ((paymentLinkId) => resolvePaymentLinkBuyUrl(paymentLinkId, stripeClient));
    return sessionEntitlesFixPack(session, {
      trustedPaymentLinkIds,
      trustedProductIds,
      resolveBuyUrl: resolve,
    });
  } catch {
    return false;
  }
}
