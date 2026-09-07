// Server-owned PaymentIntent attempt identity for general checkout.
// Analytics (PostHog, etc.) stay client-side and independent of this key.
//
// Each purchase has an explicit attempt row. Retries of the SAME attempt
// (remount, network uncertainty, double submit) reuse one Stripe idempotency
// key and PaymentIntent. After success or cancellation, a later checkout opens
// a new attempt. Immutable offer facts are bound to the attempt; changing them
// also opens a new attempt.
import { createHash } from "node:crypto";
import { getOffer, CURRENCY } from "../pricing.js";
import {
  PAYMENT_ATTEMPT_STATUS,
  paymentAttemptStoreDeps,
} from "./payment-attempt-store.js";

const TERMINAL_PI_STATUSES = new Set(["succeeded", "canceled"]);
const REUSABLE_PI_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
  "processing",
]);

export function hashPaymentAttemptFacts({
  uid,
  offer,
  amount,
  currency = "usd",
  uploadPath = "",
} = {}) {
  if (!uid || !offer) {
    throw new Error("uid and offer are required for payment-attempt facts");
  }
  const payload = JSON.stringify({
    v: 2,
    uid: String(uid),
    offer: String(offer),
    amount: Number(amount),
    currency: String(currency || "usd").toLowerCase(),
    upload_path: typeof uploadPath === "string" ? uploadPath : "",
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** Stripe idempotency key is bound to the persisted attempt id, not raw facts alone. */
export function buildPaymentAttemptIdempotencyKey({ attemptId } = {}) {
  if (!attemptId) throw new Error("attemptId is required for payment-attempt idempotency");
  return `sdd-pi-v2:${attemptId}`;
}

function normalizeUploadPath(uploadPath) {
  return typeof uploadPath === "string" ? uploadPath : "";
}

async function markAttempt(store, attemptId, patch) {
  if (!attemptId) return null;
  return store.update(attemptId, patch);
}

export async function markPaymentAttemptSucceeded({
  store = paymentAttemptStoreDeps.getStore(),
  attemptId,
  paymentIntentId,
} = {}) {
  if (!attemptId) return null;
  return markAttempt(store, attemptId, {
    status: PAYMENT_ATTEMPT_STATUS.SUCCEEDED,
    ...(paymentIntentId ? { stripe_payment_intent: paymentIntentId } : {}),
  });
}

export async function markPaymentAttemptCanceled({
  store = paymentAttemptStoreDeps.getStore(),
  attemptId,
} = {}) {
  if (!attemptId) return null;
  return markAttempt(store, attemptId, { status: PAYMENT_ATTEMPT_STATUS.CANCELED });
}

async function loadOwnedOpenAttempt(store, { uid, offerSlug, factsHash, paymentAttemptId }) {
  if (paymentAttemptId) {
    const byId = await store.getById(paymentAttemptId);
    if (
      byId
      && byId.user_id === uid
      && byId.offer === offerSlug
      && byId.facts_hash === factsHash
      && byId.status === PAYMENT_ATTEMPT_STATUS.OPEN
    ) {
      return byId;
    }
  }
  return store.findOpenByFacts({ userId: uid, offer: offerSlug, factsHash });
}

async function resolveReusableIntent(stripeClient, attempt) {
  if (!attempt?.stripe_payment_intent) return { reusable: false, intent: null };
  try {
    const intent = await stripeClient.paymentIntents.retrieve(attempt.stripe_payment_intent);
    if (TERMINAL_PI_STATUSES.has(intent.status)) {
      return { reusable: false, intent, terminal: intent.status };
    }
    if (REUSABLE_PI_STATUSES.has(intent.status)) {
      return { reusable: true, intent };
    }
    // Unknown/non-terminal: keep the same attempt identity (do not mint a fresh charge).
    return { reusable: true, intent };
  } catch {
    // Retrieve failed: keep attempt identity and allow idempotent recreate with same key.
    return { reusable: false, intent: null, retrieveFailed: true };
  }
}

/**
 * Create or resume a server-priced PaymentIntent for a known offer slug.
 * Exported so route tests exercise the same path checkout.js uses.
 */
export async function createOfferPaymentIntent({
  stripeClient,
  uid,
  email,
  offerSlug,
  uploadPath = "",
  paymentAttemptId = null,
  store = paymentAttemptStoreDeps.getStore(),
  newAttemptId = paymentAttemptStoreDeps.newAttemptId,
} = {}) {
  const offer = getOffer(offerSlug);
  if (!offer) return { ok: false, status: 400, error: "Unknown offer" };
  if (!stripeClient) return { ok: false, status: 503, error: "Payments not configured" };

  const normalizedUpload = normalizeUploadPath(uploadPath);
  const factsHash = hashPaymentAttemptFacts({
    uid,
    offer: offerSlug,
    amount: offer.amount,
    currency: CURRENCY,
    uploadPath: normalizedUpload,
  });

  let attempt = await loadOwnedOpenAttempt(store, {
    uid,
    offerSlug,
    factsHash,
    paymentAttemptId,
  });

  if (attempt) {
    const resolved = await resolveReusableIntent(stripeClient, attempt);
    if (resolved.reusable && resolved.intent) {
      return {
        ok: true,
        intent: resolved.intent,
        offer,
        attemptId: attempt.id,
        idempotencyKey: buildPaymentAttemptIdempotencyKey({ attemptId: attempt.id }),
        resumed: true,
      };
    }
    if (resolved.terminal === "succeeded") {
      await markPaymentAttemptSucceeded({
        store,
        attemptId: attempt.id,
        paymentIntentId: resolved.intent?.id,
      });
      attempt = null;
    } else if (resolved.terminal === "canceled") {
      await markPaymentAttemptCanceled({ store, attemptId: attempt.id });
      attempt = null;
    } else if (resolved.retrieveFailed && attempt.stripe_payment_intent) {
      // Keep the row; fall through to idempotent create with the same attempt id.
    } else if (!attempt.stripe_payment_intent) {
      // Open row never got a PI — reuse the attempt id below.
    } else {
      attempt = null;
    }
  }

  if (!attempt) {
    attempt = await store.insert({
      id: newAttemptId(),
      user_id: uid,
      offer: offerSlug,
      amount: offer.amount,
      currency: CURRENCY,
      upload_path: normalizedUpload,
      status: PAYMENT_ATTEMPT_STATUS.OPEN,
      stripe_payment_intent: null,
      facts_hash: factsHash,
    });
  }

  const idempotencyKey = buildPaymentAttemptIdempotencyKey({ attemptId: attempt.id });
  const intent = await stripeClient.paymentIntents.create(
    {
      amount: offer.amount,
      currency: CURRENCY,
      receipt_email: email,
      description: `SameDayDesk · ${offer.label}`,
      metadata: {
        uid,
        offer: offerSlug,
        amount: String(offer.amount),
        label: offer.label,
        upload_path: normalizedUpload,
        payment_attempt_id: attempt.id,
      },
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey },
  );

  await store.update(attempt.id, { stripe_payment_intent: intent.id });

  return {
    ok: true,
    intent,
    offer,
    attemptId: attempt.id,
    idempotencyKey,
    resumed: false,
  };
}
