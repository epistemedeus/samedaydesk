// Server-owned PaymentIntent attempt identity for general checkout.
// Analytics (PostHog, etc.) stay client-side and independent of this key.
//
// Each purchase has an explicit attempt row. Retries of the SAME attempt
// (remount, network uncertainty, double submit) reuse one Stripe idempotency
// key and PaymentIntent. After success or cancellation, a later checkout opens
// a new attempt. Immutable offer facts are bound to the attempt; changing them
// require resolving the existing purchase before a new attempt is admitted.
import { createHash } from "node:crypto";
import { getOffer, CURRENCY, AGENT_FIRST_USE_REPORT, firstUseCheckoutEnabled } from "../pricing.js";
import { firstUseIntake, firstUseIntentMatches, intakeDigest, storedFirstUseIntake } from "./first-use-intake.js";
import { releaseRunOf } from "./release-run.js";
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
  if (store.cancelIfCard) return store.cancelIfCard(attemptId);
  return markAttempt(store, attemptId, { status: PAYMENT_ATTEMPT_STATUS.CANCELED });
}

async function loadOwnedOpenAttempt(store, { uid, offerSlug, paymentAttemptId }) {
  if (paymentAttemptId) {
    const byId = await store.getById(paymentAttemptId);
    if (
      byId
      && byId.user_id === uid
      && byId.offer === offerSlug
      && (byId.status === PAYMENT_ATTEMPT_STATUS.OPEN || byId.checkout_rail === "usdc")
    ) {
      return byId;
    }
  }
  return store.findOpenByOffer({ userId: uid, offer: offerSlug });
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
    // A known PI must only be retrieved. Stripe's create idempotency retention
    // is bounded, so even the same key could create a second PI on a later day.
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
  intake,
  paymentAttemptId = null,
  store,
  newAttemptId = paymentAttemptStoreDeps.newAttemptId,
} = {}) {
  const offer = getOffer(offerSlug);
  if (!offer) return { ok: false, status: 400, error: "Unknown offer" };
  const firstUse = offerSlug === AGENT_FIRST_USE_REPORT;
  const live = process.env.SDS_PRIVATE_PREVIEW !== "1";
  if (firstUse && !firstUseCheckoutEnabled()) return { ok: false, status: 404, error: "Offer is unavailable" };
  const firstUseSnapshot = firstUse ? firstUseIntake(intake) : null;
  if (firstUse && (!firstUseSnapshot || uploadPath)) return { ok: false, status: 400, error: "Provide a public HTTPS tool URL and a task." };
  if (!stripeClient) return { ok: false, status: 503, error: "Payments not configured" };
  store ??= paymentAttemptStoreDeps.getStore();
  const firstUseDigest = firstUseSnapshot && intakeDigest(firstUseSnapshot);
  const sameFirstUse = row => !firstUse || (storedFirstUseIntake(row) && row.intake_hash === firstUseDigest && !row.upload_path &&
    (!row.checkout_rail || row.checkout_rail === "stripe"));
  if (firstUse && paymentAttemptId) {
    const requested = await store.getById(paymentAttemptId);
    if (!requested || requested.user_id !== uid || requested.offer !== offerSlug) {
      return { ok: false, status: 404, error: "Payment attempt not found" };
    }
    if (requested.status === PAYMENT_ATTEMPT_STATUS.SUCCEEDED) {
      return { ok: false, status: 409, error: "This payment is already complete. Open your orders." };
    }
  }

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

  const selectedRail = row => row?.checkout_rail === "switching" || row?.checkout_rail === "usdc";
  const changedTask = () => ({ ok: false, status: 409, error: "The saved task differs. Resolve that payment before continuing." });
  const unreceived = () => ({ ok: false, status: 503, error: "Payment status was not received. Resume the same payment later." });
  if (attempt && !sameFirstUse(attempt)) return changedTask();
  if (selectedRail(attempt)) return { ok: true, rail: attempt.checkout_rail, railId: attempt.rail_id, attemptId: attempt.id,
    intakeSnapshot: attempt.intake_snapshot, offer };
  if (attempt) {
    const resolved = await resolveReusableIntent(stripeClient, attempt);
    if (firstUse && resolved.intent && (resolved.intent.id !== attempt.stripe_payment_intent ||
        !firstUseIntentMatches(resolved.intent, attempt, live))) return unreceived();
    if (resolved.reusable && resolved.intent) {
      if (attempt.facts_hash !== factsHash) {
        return { ok: false, status: 409, error: "An existing payment has different purchase facts. Resolve or cancel it before starting a changed purchase." };
      }
      return {
        ok: true,
        intent: resolved.intent,
        offer,
        attemptId: attempt.id,
        idempotencyKey: buildPaymentAttemptIdempotencyKey({ attemptId: attempt.id }),
        resumed: true,
        intakeSnapshot: attempt.intake_snapshot || null,
      };
    }
    if (resolved.terminal === "succeeded") {
      if (firstUse) return { ok: false, status: 409, error: "This payment is already complete. Check your orders before starting again." };
      await markPaymentAttemptSucceeded({
        store,
        attemptId: attempt.id,
        paymentIntentId: resolved.intent?.id,
      });
      attempt = null;
    } else if (resolved.terminal === "canceled") {
      const current = await store.getById(attempt.id);
      if (selectedRail(current)) return { ok: true, rail: current.checkout_rail, railId: current.rail_id,
        attemptId: current.id, intakeSnapshot: current.intake_snapshot, offer };
      const closed = await markPaymentAttemptCanceled({ store, attemptId: attempt.id });
      if (selectedRail(closed)) return { ok: true, rail: closed.checkout_rail, railId: closed.rail_id, attemptId: closed.id,
        intakeSnapshot: closed.intake_snapshot, offer };
      attempt = null;
    } else if (resolved.retrieveFailed && attempt.stripe_payment_intent) {
      return { ok: false, status: 503, error: "Payment status is temporarily unavailable. Retry this purchase later; no new payment was created." };
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
      ...(firstUseSnapshot && { intake_snapshot: firstUseSnapshot, intake_hash: firstUseDigest, checkout_rail: "stripe" }),
      stripe_create_params: {
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
          ...(releaseRunOf() ? { release_run: releaseRunOf() } : {}),
        },
        automatic_payment_methods: { enabled: true },
      },
    });
  }

  if (!sameFirstUse(attempt)) return changedTask();
  if (selectedRail(attempt)) return { ok: true, rail: attempt.checkout_rail, railId: attempt.rail_id, attemptId: attempt.id,
    intakeSnapshot: attempt.intake_snapshot, offer };
  if (attempt.facts_hash !== factsHash) {
    return { ok: false, status: 409, error: "An unresolved payment has different purchase facts. Resolve it before starting a changed purchase." };
  }
  // A create may have succeeded upstream while its response/save was lost.
  // After a conservative retry window, quarantine instead of reusing an expired
  // Stripe key. Keep the row open so later requests cannot silently bypass it.
  const ageMs = Date.now() - Date.parse(attempt.created_at);
  if (!attempt.stripe_create_params || !Number.isFinite(ageMs) || ageMs >= 23 * 60 * 60 * 1000) {
    return { ok: false, status: 409, error: "This unresolved payment needs reconciliation before checkout can continue. No new payment was created." };
  }
  const idempotencyKey = buildPaymentAttemptIdempotencyKey({ attemptId: attempt.id });
  const intent = await stripeClient.paymentIntents.create(
    {
      ...attempt.stripe_create_params,
      metadata: {
        ...attempt.stripe_create_params.metadata,
        payment_attempt_id: attempt.id,
      },
    },
    { idempotencyKey },
  );

  if (firstUse && (!intent?.id || !firstUseIntentMatches(intent, attempt, live))) return unreceived();
  const bound = await store.update(attempt.id, { stripe_payment_intent: intent.id });
  if (firstUse && (bound?.stripe_payment_intent !== intent.id || bound.user_id !== uid ||
      bound.offer !== offerSlug || !sameFirstUse(bound))) return unreceived();

  return {
    ok: true,
    intent,
    offer,
    attemptId: attempt.id,
    idempotencyKey,
    resumed: false,
    intakeSnapshot: attempt.intake_snapshot || null,
  };
}

/** Freeze task content immediately before human Stripe confirmation. */
export async function preparePaymentIntake({
  stripeClient, uid, paymentAttemptId, intake,
  store = paymentAttemptStoreDeps.getStore(),
} = {}) {
  const attempt = paymentAttemptId && await store.getById(paymentAttemptId);
  if (!attempt || attempt.user_id !== uid) return { ok: false, status: 404, error: "Payment attempt not found" };
  if (attempt.offer === AGENT_FIRST_USE_REPORT) {
    if (!firstUseCheckoutEnabled()) return { ok: false, status: 404, error: "Offer is unavailable" };
    const snapshot = firstUseIntake(intake);
    if (!snapshot) return { ok: false, status: 400, error: "Provide the saved public tool URL and task." };
    if (!storedFirstUseIntake(attempt) || intakeDigest(snapshot) !== attempt.intake_hash ||
        attempt.status !== PAYMENT_ATTEMPT_STATUS.OPEN || !attempt.stripe_payment_intent) {
      return { ok: false, status: 409, error: "This payment cannot accept a different task." };
    }
    return { ok: true, intakeSnapshot: snapshot };
  }
  const details = typeof intake?.details === "string" ? intake.details : "";
  const uploadPath = typeof intake?.uploadPath === "string" ? intake.uploadPath : "";
  if (details.length > 10000 || uploadPath.length > 1024 || (uploadPath &&
    (!uploadPath.startsWith(`${uid}/`) || uploadPath.split("/").some(part => part === ".." || part === ".")))) {
    return { ok: false, status: 400, error: "Invalid task text or upload path" };
  }
  const snapshot = { details, uploadPath };
  const hash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  if (attempt.intake_snapshot && attempt.intake_hash !== hash) {
    return { ok: false, status: 409, error: "This payment is already frozen for a different task. Review the original task or resolve/cancel this payment before starting a new purchase." };
  }
  if (attempt.status !== PAYMENT_ATTEMPT_STATUS.OPEN || !attempt.stripe_payment_intent) {
    return { ok: false, status: 409, error: "This payment cannot accept task changes. Review its payment status before continuing." };
  }
  let intent;
  try { intent = await stripeClient.paymentIntents.retrieve(attempt.stripe_payment_intent); }
  catch { return { ok: false, status: 503, error: "Payment status unavailable. Your payment was not confirmed; retry later." }; }
  if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent?.status)) {
    return { ok: false, status: 409, error: "Payment is already processing or closed. Review its status before continuing." };
  }
  const saved = await store.freezeIntake(attempt.id, uid, snapshot, hash);
  if (!saved || saved.user_id !== uid || saved.intake_hash !== hash) {
    return { ok: false, status: 409, error: "Task or payment changed concurrently. Reload and review before paying." };
  }
  return { ok: true, intakeSnapshot: saved.intake_snapshot };
}
