/**
 * Seeded refuses. Each path runs (or cites) the published engine and exits
 * nonzero with a clear code. Never pays, never opens checkout, never hits Stripe.
 */
import { FEATURE, FORBIDDEN_HEADERS, PAYMENT_STOP_PATHS, SEEDED } from "./catalog.mjs";
import { envelope, failError } from "./envelope.mjs";
import {
  caseChangedFactsBlocked,
  caseRetrySameAttempt,
  caseUncertainRetrieve,
} from "./guard.mjs";

export function refuseLiveStripe({ host = "https://api.stripe.com" } = {}) {
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "LIVE_STRIPE_REFUSE",
      `refusing live/network Stripe in unpaid double-charge-guard: ${host}`,
      { host, stops: [...PAYMENT_STOP_PATHS] },
    ),
    result: {
      seed: "live-stripe",
      host,
      refused: true,
      paymentSent: false,
      liveStripe: false,
      neverOpenedCheckout: true,
    },
  });
}

export function refuseCheckoutPath({ path = "/api/checkout" } = {}) {
  const matched = PAYMENT_STOP_PATHS.some(
    (p) => path === p || path.startsWith(p) || path.includes(p),
  );
  const looksPaid = /stripe|checkout|buy\.stripe\.com|sk_live|sk_test/i.test(path);
  if (!matched && !looksPaid) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("CHECKOUT_PATH_REFUSE", `path not recognized as payment stop: ${path}`, {
        path,
        stops: [...PAYMENT_STOP_PATHS],
      }),
      result: { seed: "checkout-path", path, refused: false },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "CHECKOUT_PATH_REFUSE",
      `refusing Stripe/checkout path in unpaid harness: ${path}`,
      { path, stops: [...PAYMENT_STOP_PATHS] },
    ),
    result: {
      seed: "checkout-path",
      path,
      refused: true,
      paymentSent: false,
      neverOpenedCheckout: true,
    },
  });
}

export function refuseNeo({ vendor = "neomorphic/neo-kernel-vendor" } = {}) {
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "NEO_VENDOR_REFUSE",
      `${vendor} is out of scope for SDS double-charge-guard`,
      { vendor, seed: "neo" },
    ),
    result: {
      seed: "neo",
      vendor,
      refused: true,
      paymentSent: false,
      neoPublished: false,
      published: false,
    },
  });
}

export function refusePublish() {
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "PUBLISH_REFUSE",
      "refusing registry/publish in unpaid SDS double-charge-guard",
      { seed: "publish" },
    ),
    result: {
      seed: "publish",
      refused: true,
      paymentSent: false,
      published: false,
      neoPublished: false,
    },
  });
}

export function refusePaymentHeader({ header = "PAYMENT-SIGNATURE" } = {}) {
  const forbidden = FORBIDDEN_HEADERS.some(
    (h) => h.toLowerCase() === String(header).toLowerCase(),
  );
  if (!forbidden) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("PAYMENT_HEADER_REFUSE", `header not forbidden: ${header}`, {
        header,
        forbidden: [...FORBIDDEN_HEADERS],
      }),
      result: { seed: "payment-signature", header, refused: false },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "PAYMENT_HEADER_REFUSE",
      `refusing to send forbidden payment header: ${header}`,
      { header, forbidden: [...FORBIDDEN_HEADERS] },
    ),
    result: {
      seed: "payment-signature",
      header,
      refused: true,
      paymentSent: false,
      headerNeverSent: true,
    },
  });
}

export async function refuseSecondChargeClaim(engine) {
  const proof = await caseRetrySameAttempt(engine);
  const claim = {
    retryCreatesSecondPaymentIntent: true,
    createCount: 2,
  };
  const observedCreateCount = proof.stripeCreates;
  const uniqueIntents = new Set(proof.intentIds.filter(Boolean)).size;
  const engineHeld = proof.ok && observedCreateCount === 1 && uniqueIntents === 1;
  if (!engineHeld) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "error",
      error: failError(
        "RUNTIME",
        "published engine did not hold the one-PI retry invariant; cannot refuse the claim",
        { proof },
      ),
      result: { seed: "second-charge", refused: false, proof },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "DOUBLE_CHARGE_CLAIM_REFUSE",
      "retry of the same payment attempt reused one PaymentIntent; seeded second-charge claim is refused",
      {
        claimedCreateCount: claim.createCount,
        observedCreateCount,
        claimedSecondPi: true,
        observedIntentIds: proof.intentIds,
        idempotencyKey: proof.idempotencyKey,
      },
    ),
    result: {
      seed: "second-charge",
      refused: true,
      paymentSent: false,
      claim,
      observedCreateCount,
      observedIntentIds: proof.intentIds,
      idempotencyKey: proof.idempotencyKey,
      engine: "server/lib/payment-attempt.js#createOfferPaymentIntent",
    },
  });
}

export async function refuseRetrieveRecreate(engine) {
  const proof = await caseUncertainRetrieve(engine);
  const claim = { retrieveFailureMintsNewPaymentIntent: true };
  const engineHeld = proof.ok && proof.stripeCreates === 1 && proof.secondStatus === 503;
  if (!engineHeld) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "error",
      error: failError("RUNTIME", "published engine did not quarantine uncertain retrieve", {
        proof,
      }),
      result: { seed: "retrieve-fail-recreate", refused: false, proof },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "RETRIEVE_RECREATE_REFUSE",
      "uncertain retrieve kept the original PI and did not create; naive recreate claim is refused",
      {
        observedStatus: proof.secondStatus,
        observedCreates: proof.stripeCreates,
        preservedPi: proof.preservedPi,
      },
    ),
    result: {
      seed: "retrieve-fail-recreate",
      refused: true,
      paymentSent: false,
      claim,
      observedStatus: proof.secondStatus,
      observedCreates: proof.stripeCreates,
      preservedPi: proof.preservedPi,
    },
  });
}

export async function refuseFactsBypass(engine) {
  const proof = await caseChangedFactsBlocked(engine);
  const claim = { changedFactsMintSecondCharge: true };
  const engineHeld = proof.ok && proof.changedStatus === 409 && proof.stripeCreates === 1;
  if (!engineHeld) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "error",
      error: failError("RUNTIME", "published engine did not block changed facts", { proof }),
      result: { seed: "changed-facts-bypass", refused: false, proof },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "FACTS_BYPASS_REFUSE",
      "changed purchase facts stayed on the open attempt (409); seeded second-charge bypass is refused",
      { observedStatus: proof.changedStatus, observedCreates: proof.stripeCreates },
    ),
    result: {
      seed: "changed-facts-bypass",
      refused: true,
      paymentSent: false,
      claim,
      observedStatus: proof.changedStatus,
      observedCreates: proof.stripeCreates,
    },
  });
}

export async function runSeeded(seedId, engine, opts = {}) {
  const seed = SEEDED[seedId];
  if (!seed) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "usage",
      error: failError("USAGE", `unknown seeded failure: ${seedId}`, {
        known: Object.keys(SEEDED),
      }),
    });
  }
  if (seedId === "second-charge") return refuseSecondChargeClaim(engine);
  if (seedId === "retrieve-fail-recreate") return refuseRetrieveRecreate(engine);
  if (seedId === "changed-facts-bypass") return refuseFactsBypass(engine);
  if (seedId === "live-stripe") {
    return refuseLiveStripe({ host: opts.host || "https://api.stripe.com" });
  }
  if (seedId === "checkout-path") {
    return refuseCheckoutPath({ path: opts.path || "/api/checkout" });
  }
  if (seedId === "payment-signature") {
    return refusePaymentHeader({ header: opts.header || "PAYMENT-SIGNATURE" });
  }
  if (seedId === "neo") {
    return refuseNeo();
  }
  return envelope({
    ok: false,
    command: "seeded",
    status: "usage",
    error: failError("USAGE", `unhandled seed: ${seedId}`),
  });
}
