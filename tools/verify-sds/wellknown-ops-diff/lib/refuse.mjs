import {
  FORBIDDEN_HEADERS,
  PAYMENT_STOP_PATHS,
  SEEDED,
} from "./catalog.mjs";
import { envelope, failError, FEATURE } from "./envelope.mjs";

export function refuseLive({ flag = "--live" } = {}) {
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "usage",
    error: failError(
      "LIVE_REFUSE",
      `refusing ${flag}: wellknown-ops-diff is offline (committed well-known catalog vs bazaar-tracker). Never fetch CDP, agents.samedaydesk.com, or Stripe.`,
      {
        flag,
        never: ["--live", "CDP discovery", "PAYMENT-SIGNATURE", "X-PAYMENT"],
      },
    ),
    result: {
      seed: "live",
      refused: true,
      liveFetch: false,
      cdpCalled: false,
      paymentSent: false,
    },
  });
}

export function refusePaymentSignature({
  header = "PAYMENT-SIGNATURE",
  value = "seeded-fake-sig",
} = {}) {
  const matched = FORBIDDEN_HEADERS.some((name) => name.toLowerCase() === String(header).toLowerCase());
  if (!matched) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("PAYMENT_HEADER_REFUSE", `header not recognized as payment stop: ${header}`, {
        header,
        forbidden: [...FORBIDDEN_HEADERS],
      }),
      result: { seed: "payment-signature", header, refused: false, valuePresent: Boolean(value) },
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
      { header, seed: "payment-signature", forbidden: [...FORBIDDEN_HEADERS] },
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

export function refuseStripePath({ path = "/api/checkout" } = {}) {
  const matched = PAYMENT_STOP_PATHS.some(
    (stop) => path === stop || path.startsWith(stop) || (stop.endsWith("=") && path.includes(stop)),
  );
  const looksPaid = /stripe|checkout|buy\.stripe\.com|cs_test_|cs_live_/i.test(path) || path.includes("cs=");
  if (!matched && !looksPaid) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      error: failError("STRIPE_PATH_REFUSE", `path not recognized as payment stop: ${path}`, {
        path,
        stops: [...PAYMENT_STOP_PATHS],
      }),
      result: { seed: "stripe-path", path, refused: false },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError("STRIPE_PATH_REFUSE", `refusing Stripe/checkout path in unpaid harness: ${path}`, {
      path,
      stops: [...PAYMENT_STOP_PATHS],
    }),
    result: {
      seed: "stripe-path",
      path,
      refused: true,
      paymentSent: false,
      neverOpenedCheckout: true,
    },
  });
}

export function claimMatchEnvelope(diff) {
  if (diff.aligned) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "fail",
      error: failError(
        "SEED_GAP_VANISHED",
        "claim-match seed requires the committed well-known vs tracker gap; catalogs are aligned",
        { seed: "claim-match", aligned: true },
      ),
      result: {
        seed: "claim-match",
        refused: true,
        claim: "aligned",
        aligned: true,
        catalogAbsenceIsDemand: false,
      },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "CLAIM_ALIGNED",
      "seeded claim that well-known ops and tracker match is rejected: committed catalog has a gap",
      {
        seed: "claim-match",
        wellKnownCount: diff.wellKnownCount,
        trackerCount: diff.trackerCount,
        wellKnownOnlyPathCount: diff.wellKnownOnlyPathCount,
        trackerOnlyCount: diff.trackerOnlyCount,
        aligned: diff.aligned,
      },
    ),
    result: {
      seed: "claim-match",
      refused: true,
      claim: "aligned",
      aligned: false,
      catalogAbsenceIsDemand: false,
      wellKnownOnlyPaths: diff.wellKnownOnlyPaths,
    },
  });
}

export function absenceAsDemandEnvelope(diff) {
  const sample = diff.wellKnownOnly?.[0] ?? null;
  if (!sample) {
    return envelope({
      ok: false,
      command: "seeded",
      feature: FEATURE,
      status: "fail",
      error: failError(
        "SEED_GAP_VANISHED",
        "absence-as-demand seed requires a well-known-only route; none remain",
        { seed: "absence-as-demand", wellKnownOnlyPathCount: 0 },
      ),
      result: {
        seed: "absence-as-demand",
        refused: true,
        treatAbsenceAsDemand: false,
        catalogAbsenceIsDemand: false,
        wellKnownOnlyPaths: [],
      },
    });
  }
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "ABSENCE_IS_NOT_DEMAND",
      `seeded claim that well-known-only ${opLabel(sample)} are buyer demand is rejected`,
      {
        seed: "absence-as-demand",
        sample,
        wellKnownOnlyPathCount: diff.wellKnownOnlyPathCount,
      },
    ),
    result: {
      seed: "absence-as-demand",
      refused: true,
      treatAbsenceAsDemand: false,
      catalogAbsenceIsDemand: false,
      wellKnownOnlyPaths: diff.wellKnownOnlyPaths,
    },
  });
}

export function ghostTrackerEnvelope(diff) {
  const ghosts = diff.trackerOnly ?? [];
  return envelope({
    ok: false,
    command: "seeded",
    feature: FEATURE,
    status: "fail",
    error: failError(
      "GHOST_TRACKER_ROUTE",
      "seeded tracker route not present in well-known catalog is rejected",
      {
        seed: "ghost-tracker",
        trackerOnly: ghosts,
      },
    ),
    result: {
      seed: "ghost-tracker",
      refused: true,
      trackerOnly: ghosts,
      inWellKnown: false,
    },
  });
}

function opLabel(row) {
  return `${row.method} ${row.path}`;
}

export function runSeeded(seedId, opts = {}) {
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
  if (seedId === "live") return refuseLive(opts);
  if (seedId === "payment-signature") return refusePaymentSignature(opts);
  if (seedId === "stripe-path") return refuseStripePath({ path: opts.path || "/api/checkout" });
  return envelope({
    ok: false,
    command: "seeded",
    status: "usage",
    error: failError("USAGE", `seed ${seedId} requires the CLI diff path`),
  });
}
