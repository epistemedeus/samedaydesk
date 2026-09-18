/**
 * Cold proofs against published createOfferPaymentIntent + fulfillFromIntent.
 * Stripe is an in-memory fixture. paymentSent is always false.
 */
import { OFFER_SLUG } from "./catalog.mjs";
import { createFixtureStripe, createMemoryFulfillDb } from "./fixture-stripe.mjs";

function offerArgs(engine, extras = {}) {
  return {
    uid: extras.uid || "user_dcg_1",
    email: extras.email || "buyer@example.test",
    offerSlug: extras.offerSlug || OFFER_SLUG,
    uploadPath: extras.uploadPath || "",
    ...extras.rest,
  };
}

export async function caseRetrySameAttempt(engine) {
  const store = engine.createMemoryPaymentAttemptStore();
  const stripeClient = createFixtureStripe();
  const args = {
    stripeClient,
    store,
    newAttemptId: () => "attempt_stable_1",
    ...offerArgs(engine),
  };
  const first = await engine.createOfferPaymentIntent(args);
  const second = await engine.createOfferPaymentIntent({
    ...args,
    paymentAttemptId: first.attemptId,
  });
  const expectedKey = engine.buildPaymentAttemptIdempotencyKey({
    attemptId: first.attemptId,
  });
  const ok =
    first.ok === true
    && second.ok === true
    && first.intent.id === second.intent.id
    && first.attemptId === second.attemptId
    && first.idempotencyKey === expectedKey
    && second.idempotencyKey === expectedKey
    && stripeClient.creates.length === 1
    && stripeClient.networkCalls === 0;

  return {
    id: "retry-same-attempt",
    ok,
    stripeCreates: stripeClient.creates.length,
    intentIds: [first.intent?.id, second.intent?.id],
    attemptIds: [first.attemptId, second.attemptId],
    idempotencyKey: first.idempotencyKey,
    resumed: second.resumed === true,
    paymentSent: false,
  };
}

export async function caseConcurrentCreates(engine) {
  const store = engine.createMemoryPaymentAttemptStore();
  const stripeClient = createFixtureStripe();
  const args = { stripeClient, store, ...offerArgs(engine, { uid: "race" }) };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => engine.createOfferPaymentIntent(args)),
  );
  const attemptIds = new Set(results.map((r) => r.attemptId));
  const intentIds = new Set(results.map((r) => r.intent?.id));
  const keys = new Set(stripeClient.creates.map((c) => c.options.idempotencyKey));
  const ok =
    results.every((r) => r.ok)
    && attemptIds.size === 1
    && intentIds.size === 1
    && keys.size === 1;

  return {
    id: "concurrent-creates",
    ok,
    stripeCreates: stripeClient.creates.length,
    uniqueAttempts: attemptIds.size,
    uniqueIntents: intentIds.size,
    uniqueIdempotencyKeys: keys.size,
    paymentSent: false,
  };
}

export async function caseDuplicateFulfill(engine) {
  const store = engine.createMemoryPaymentAttemptStore();
  const sb = createMemoryFulfillDb();
  const intent = {
    id: "pi_paid_a",
    amount: engine.getOffer(OFFER_SLUG).amount,
    currency: "usd",
    receipt_email: "buyer@example.test",
    metadata: {
      uid: "user_f",
      offer: OFFER_SLUG,
      amount: String(engine.getOffer(OFFER_SLUG).amount),
      payment_attempt_id: "attempt_a",
    },
  };
  const first = await engine.fulfillFromIntent(intent, { sb, attemptStore: store });
  const retry = await engine.fulfillFromIntent(intent, { sb, attemptStore: store });
  const expectedOrder = engine.orderIdForPaymentIntent(intent);

  const intentB = {
    ...intent,
    id: "pi_paid_b",
    metadata: { ...intent.metadata, payment_attempt_id: "attempt_b" },
  };
  const secondPurchase = await engine.fulfillFromIntent(intentB, { sb, attemptStore: store });

  const ok =
    first.ok === true
    && first.isNew === true
    && first.orderId === expectedOrder
    && retry.isNew === false
    && retry.orderId === first.orderId
    && sb.orders.size === 2
    && secondPurchase.isNew === true
    && secondPurchase.orderId !== first.orderId;

  return {
    id: "duplicate-fulfill",
    ok,
    firstOrderId: first.orderId,
    retryIsNew: retry.isNew,
    orderCount: sb.orders.size,
    secondPurchaseIsNew: secondPurchase.isNew,
    paymentSent: false,
  };
}

export async function caseChangedFactsBlocked(engine) {
  const store = engine.createMemoryPaymentAttemptStore();
  const stripeClient = createFixtureStripe();
  const args = { stripeClient, store, ...offerArgs(engine, { uid: "facts" }) };
  const first = await engine.createOfferPaymentIntent(args);
  const changed = await engine.createOfferPaymentIntent({
    ...args,
    uploadPath: "different-input.pdf",
  });
  const ok =
    first.ok === true
    && changed.ok === false
    && changed.status === 409
    && stripeClient.creates.length === 1;

  return {
    id: "changed-facts-blocked",
    ok,
    firstOk: first.ok,
    changedStatus: changed.status,
    stripeCreates: stripeClient.creates.length,
    paymentSent: false,
  };
}

export async function caseUncertainRetrieve(engine) {
  const store = engine.createMemoryPaymentAttemptStore();
  const stripeClient = createFixtureStripe();
  const args = {
    stripeClient,
    store,
    newAttemptId: () => "attempt_uncertain",
    ...offerArgs(engine, { uid: "user_u" }),
  };
  const first = await engine.createOfferPaymentIntent(args);
  await store.update(first.attemptId, { stripe_payment_intent: first.intent.id });
  stripeClient.setRetrieveFails(true);
  const createsBefore = stripeClient.creates.length;
  const second = await engine.createOfferPaymentIntent({
    ...args,
    paymentAttemptId: first.attemptId,
  });
  const saved = await store.getById(first.attemptId);
  const ok =
    first.ok === true
    && second.ok === false
    && second.status === 503
    && saved.stripe_payment_intent === first.intent.id
    && stripeClient.creates.length === createsBefore;

  return {
    id: "uncertain-retrieve",
    ok,
    secondStatus: second.status,
    stripeCreates: stripeClient.creates.length,
    preservedPi: saved.stripe_payment_intent,
    paymentSent: false,
  };
}

export async function caseQuarantineStale(engine) {
  const store = engine.createMemoryPaymentAttemptStore();
  const stripeClient = createFixtureStripe();
  const args = { stripeClient, store, ...offerArgs(engine, { uid: "lost" }) };
  const first = await engine.createOfferPaymentIntent(args);
  await store.update(first.attemptId, {
    stripe_payment_intent: null,
    created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  });
  const createsBefore = stripeClient.creates.length;
  const quarantined = await engine.createOfferPaymentIntent(args);
  const ok =
    first.ok === true
    && quarantined.ok === false
    && quarantined.status === 409
    && stripeClient.creates.length === createsBefore;

  return {
    id: "quarantine-stale",
    ok,
    quarantinedStatus: quarantined.status,
    stripeCreates: stripeClient.creates.length,
    paymentSent: false,
  };
}

export async function caseRepeatAfterSuccess(engine) {
  const store = engine.createMemoryPaymentAttemptStore();
  const stripeClient = createFixtureStripe();
  const args = {
    stripeClient,
    store,
    ...offerArgs(engine, { uid: "user_repeat" }),
  };
  const first = await engine.createOfferPaymentIntent({
    ...args,
    newAttemptId: () => "attempt_first",
  });
  stripeClient.intents.get(first.intent.id).status = "succeeded";
  await engine.markPaymentAttemptSucceeded({
    store,
    attemptId: first.attemptId,
    paymentIntentId: first.intent.id,
  });
  const second = await engine.createOfferPaymentIntent({
    ...args,
    newAttemptId: () => "attempt_second",
  });
  const ok =
    first.ok === true
    && second.ok === true
    && second.attemptId !== first.attemptId
    && second.intent.id !== first.intent.id
    && stripeClient.creates.length === 2;

  return {
    id: "repeat-after-success-is-new-attempt",
    ok,
    firstAttemptId: first.attemptId,
    secondAttemptId: second.attemptId,
    firstIntentId: first.intent?.id,
    secondIntentId: second.intent?.id,
    note: "A later checkout after success is a new attempt, not a double charge of the first PI.",
    paymentSent: false,
  };
}

export async function runColdCases(engine) {
  const cases = [
    await caseRetrySameAttempt(engine),
    await caseConcurrentCreates(engine),
    await caseDuplicateFulfill(engine),
    await caseChangedFactsBlocked(engine),
    await caseUncertainRetrieve(engine),
    await caseQuarantineStale(engine),
    await caseRepeatAfterSuccess(engine),
  ];
  return {
    ok: cases.every((c) => c.ok),
    caseCount: cases.length,
    failed: cases.filter((c) => !c.ok).map((c) => c.id),
    cases,
  };
}
