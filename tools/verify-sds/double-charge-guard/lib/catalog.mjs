/** SDS double-charge guard — unpaid verifier catalog. */

export const FEATURE = "double-charge-guard";

export const OFFER_SLUG = "agent_mcp_server";

export const ENGINE_CITES = Object.freeze([
  {
    path: "server/lib/payment-attempt.js",
    patterns: [
      "sdd-pi-v2:",
      "idempotencyKey",
      "retrieveFailed",
      "23 * 60 * 60 * 1000",
    ],
    note: "Attempt identity binds Stripe create; uncertain retrieve never mints a second PI.",
  },
  {
    path: "server/lib/payment-attempt-store.js",
    patterns: ["23505", "one-open-purchase-per-user/offer"],
    note: "Insert collision returns the admitted open row; never a second Stripe key.",
  },
  {
    path: "server/lib/fulfill.js",
    patterns: [
      "orderIdForPaymentIntent",
      'onConflict: "stripe_payment_intent"',
      "ignoreDuplicates: true",
    ],
    note: "Duplicate webhook/verify for the same PI is one order.",
  },
  {
    path: "supabase/migrations/0004_repeat_purchase_attempts.sql",
    patterns: [
      "payment_attempts_one_open_uidx",
      "orders_stripe_payment_intent_uidx",
    ],
    note: "Durable unique indexes: one open attempt per user/offer; one order per PI.",
  },
  {
    path: "server/routes/checkout.js",
    patterns: [
      "createOfferPaymentIntent",
      "fulfillFromIntent",
      "payment_attempt_id",
    ],
    note: "Cite-only. This verifier does not POST /api/checkout or mutate checkout.js.",
  },
]);

export const FORBIDDEN_FLAGS = Object.freeze([
  "--pay",
  "--payment",
  "--checkout",
  "--publish",
  "--live",
  "--stripe-key",
  "--secret-key",
  "--sk",
  "--neo",
]);

export const FLAG_ERROR_CODES = Object.freeze({
  "--neo": "NEO_VENDOR_REFUSE",
  "--publish": "PUBLISH_REFUSE",
});

export const FORBIDDEN_HEADERS = Object.freeze([
  "PAYMENT-SIGNATURE",
  "X-PAYMENT",
  "stripe-signature",
]);

export const PAYMENT_STOP_PATHS = Object.freeze([
  "/api/checkout",
  "/api/checkout/create-payment-intent",
  "/api/stripe/webhook",
  "/checkout",
  "https://api.stripe.com",
  "https://buy.stripe.com",
]);

export const SEEDED = Object.freeze({
  "second-charge": {
    id: "second-charge",
    why: "A claim that retrying the same attempt mints a second PaymentIntent is refused; published createOfferPaymentIntent reuses one PI.",
    errorCode: "DOUBLE_CHARGE_CLAIM_REFUSE",
    expectExit: 1,
  },
  "retrieve-fail-recreate": {
    id: "retrieve-fail-recreate",
    why: "Uncertain Stripe retrieve must not mint a second charge. Naive recreate is refused.",
    errorCode: "RETRIEVE_RECREATE_REFUSE",
    expectExit: 1,
  },
  "changed-facts-bypass": {
    id: "changed-facts-bypass",
    why: "Changed upload/facts cannot bypass an open attempt to create a second charge.",
    errorCode: "FACTS_BYPASS_REFUSE",
    expectExit: 1,
  },
  "live-stripe": {
    id: "live-stripe",
    why: "Unpaid harness never calls api.stripe.com or uses sk_live / sk_test against the network.",
    errorCode: "LIVE_STRIPE_REFUSE",
    expectExit: 1,
  },
  "checkout-path": {
    id: "checkout-path",
    why: "This verifier does not open /api/checkout or hosted Stripe Checkout.",
    errorCode: "CHECKOUT_PATH_REFUSE",
    expectExit: 1,
  },
  "payment-signature": {
    id: "payment-signature",
    why: "Never send PAYMENT-SIGNATURE / X-PAYMENT. Seed proves the refuse before any wire I/O.",
    errorCode: "PAYMENT_HEADER_REFUSE",
    expectExit: 1,
  },
  neo: {
    id: "neo",
    why: "neomorphic/neo-kernel-vendor is out of scope for SDS double-charge-guard.",
    errorCode: "NEO_VENDOR_REFUSE",
    expectExit: 1,
  },
});

export const COLD_CASES = Object.freeze([
  "retry-same-attempt",
  "concurrent-creates",
  "duplicate-fulfill",
  "changed-facts-blocked",
  "uncertain-retrieve",
  "quarantine-stale",
  "repeat-after-success-is-new-attempt",
]);
