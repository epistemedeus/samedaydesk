import {
  EARNINGS_STATUS,
  ERROR_CODES,
  EVENT_KINDS,
  PROVIDERS,
  SUMMARY_SCHEMA,
  SUMMARY_STATUS,
} from "./constants.mjs";
import { readbackError, validateEvents } from "./validate.mjs";

function defaultClock() {
  return Date.now();
}

/**
 * Collect a privacy-bounded marketplace readback summary from observed events.
 * Grexal + Agensi only. No invented earnings. unavailable ≠ no_users.
 * Listed pricing (e.g. S149 run_completed 0.02 USD) is NOT earnings/payout.
 */
export function collectReadback(eventsDoc, options = {}) {
  const clock = options.clock || defaultClock;
  let doc;
  try {
    doc = validateEvents(eventsDoc);
  } catch (err) {
    if (err.code === ERROR_CODES.MISSING_REQUIREMENT) {
      return {
        schema: SUMMARY_SCHEMA,
        status: SUMMARY_STATUS.PARTIAL,
        generatedAt: new Date(clock()).toISOString(),
        cite: typeof eventsDoc?.cite === "string" ? eventsDoc.cite : null,
        providersAccepted: Object.values(PROVIDERS),
        countsByKind: emptyCountsByKind(),
        countsByProvider: emptyCountsByProvider(),
        lastObserved: {},
        earnings: {
          status: EARNINGS_STATUS.OMITTED,
          reason: "input missing required fields; earnings not evaluated",
          amounts: [],
        },
        pricingObserved: [],
        missingInputs: err.details?.missing || [err.message],
        privacyNotes: privacyNotes(),
        truthNotes: truthNotes(),
        mutationBoundary: mutationBoundary(),
        evidenceIndex: "evidence/INDEX.md",
        error: { code: err.code, message: err.message, details: err.details || null },
      };
    }
    throw err;
  }

  if (doc.captureStatus === "failed" || doc.captureStatus === "unavailable") {
    return {
      schema: SUMMARY_SCHEMA,
      status: SUMMARY_STATUS.UNAVAILABLE,
      code: ERROR_CODES.UNAVAILABLE,
      label: "capture_failed_or_unavailable",
      generatedAt: new Date(clock()).toISOString(),
      cite: doc.cite,
      reason: doc.reason || "marketplace event capture unavailable",
      providersAccepted: Object.values(PROVIDERS),
      countsByKind: emptyCountsByKind(),
      countsByProvider: emptyCountsByProvider(),
      lastObserved: {},
      earnings: {
        status: EARNINGS_STATUS.UNAVAILABLE,
        reason: "capture unavailable — do not claim zero revenue or no_users",
        amounts: [],
      },
      pricingObserved: [],
      missingInputs: [],
      privacyNotes: privacyNotes(),
      truthNotes: [
        "Capture failed or unavailable — do not claim zero installs/runs.",
        "unavailable ≠ no_users.",
        "Do not invent earnings amounts.",
      ],
      mutationBoundary: mutationBoundary(),
      evidenceIndex: "evidence/INDEX.md",
      // Explicitly omit installCount / runCount
    };
  }

  const missing = [];
  const countsByKind = emptyCountsByKind();
  const countsByProvider = emptyCountsByProvider();
  const lastObserved = {};
  const earningsAmounts = [];
  const pricingObserved = [];
  let sawEarningsEvent = false;
  let eventsWithGaps = 0;

  for (let i = 0; i < doc.events.length; i++) {
    const ev = doc.events[i];
    const path = `events[${i}]`;

    if (
      ev.kind !== EVENT_KINDS.EARNINGS &&
      (ev.evidenceRef === undefined || ev.evidenceRef === null || ev.evidenceRef === "")
    ) {
      missing.push(`${path}.evidenceRef`);
      eventsWithGaps += 1;
    }

    countsByKind[ev.kind] += 1;
    countsByProvider[ev.provider] += 1;

    const prev = lastObserved[ev.provider];
    if (!prev || (ev.at && (!prev.at || ev.at >= prev.at))) {
      lastObserved[ev.provider] = {
        kind: ev.kind,
        evidenceRef: ev.evidenceRef || null,
        at: ev.at || null,
        note: ev.note || null,
      };
    }

    if (ev.kind === EVENT_KINDS.EARNINGS) {
      sawEarningsEvent = true;
      if (ev.amount && typeof ev.amount.value === "number") {
        earningsAmounts.push({
          provider: ev.provider,
          value: ev.amount.value,
          currency: ev.amount.currency,
          evidenceRef: ev.evidenceRef,
          at: ev.at || null,
        });
      }
    }

    // Pricing on listed events is NOT earnings — pass through separately from S149-style receipts
    if (ev.pricing && typeof ev.pricing === "object") {
      pricingObserved.push({
        provider: ev.provider,
        kind: ev.kind,
        evidenceRef: ev.evidenceRef || null,
        run_completed_usd:
          typeof ev.pricing.run_completed_usd === "number"
            ? ev.pricing.run_completed_usd
            : null,
        estimate_reserve_usd:
          typeof ev.pricing.estimate_reserve_usd === "number"
            ? ev.pricing.estimate_reserve_usd
            : null,
        estimateReserveIsCharge: ev.pricing.estimateReserveIsCharge === true,
        note: ev.pricing.note || ev.note || null,
        at: ev.at || null,
      });
    }
  }

  const installCount = countsByKind[EVENT_KINDS.INSTALL];
  const runCount = countsByKind[EVENT_KINDS.RUN];

  let earnings;
  if (earningsAmounts.length > 0) {
    earnings = {
      status: EARNINGS_STATUS.OBSERVED,
      reason: "amounts passed through from cited evidence only (not list pricing)",
      amounts: earningsAmounts,
    };
  } else if (sawEarningsEvent) {
    earnings = {
      status: EARNINGS_STATUS.UNAVAILABLE,
      reason:
        "earnings events present without amount fields in evidence — mark unavailable, do not invent $0",
      amounts: [],
      evidenceRefs: doc.events
        .filter((e) => e.kind === EVENT_KINDS.EARNINGS)
        .map((e) => e.evidenceRef)
        .filter(Boolean),
    };
  } else {
    earnings = {
      status: EARNINGS_STATUS.UNAVAILABLE,
      reason:
        "no customer earnings/payout evidence — status unavailable (list pricing ≠ earnings; not zero revenue; not no_users)",
      amounts: [],
    };
  }

  const base = {
    schema: SUMMARY_SCHEMA,
    generatedAt: new Date(clock()).toISOString(),
    cite: doc.cite,
    providersAccepted: Object.values(PROVIDERS),
    countsByKind,
    countsByProvider,
    lastObserved,
    earnings,
    pricingObserved,
    privacyNotes: privacyNotes(),
    mutationBoundary: mutationBoundary(),
    evidenceIndex: "evidence/INDEX.md",
  };

  if (missing.length > 0) {
    return {
      ...base,
      status: SUMMARY_STATUS.PARTIAL,
      installCount,
      runCount,
      missingInputs: missing,
      eventsWithGaps,
      truthNotes: truthNotes(),
    };
  }

  if (installCount === 0 && runCount === 0) {
    return {
      ...base,
      status: SUMMARY_STATUS.NO_USERS,
      code: ERROR_CODES.NO_USERS,
      label: "capture_succeeded_zero_install_run",
      reason: doc.reason || "capture succeeded; install and run counts are zero",
      installCount: 0,
      runCount: 0,
      missingInputs: [],
      truthNotes: [
        "Capture succeeded with zero install/run events (no_users).",
        "This is distinct from unavailable (capture failed).",
        "Listed pricing is not earnings; earnings remain unavailable unless cited payout exists.",
      ],
    };
  }

  return {
    ...base,
    status: SUMMARY_STATUS.RECORDED,
    label: "capture_succeeded_events_recorded",
    installCount,
    runCount,
    missingInputs: [],
    truthNotes: truthNotes(),
  };
}

export function assertCaptureDistinct(unavailableSummary, noUsersSummary) {
  if (!unavailableSummary || unavailableSummary.status !== SUMMARY_STATUS.UNAVAILABLE) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, "expected unavailable status");
  }
  if (Object.prototype.hasOwnProperty.call(unavailableSummary, "installCount")) {
    throw readbackError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not report installCount (would collapse into no_users)",
    );
  }
  if (Object.prototype.hasOwnProperty.call(unavailableSummary, "runCount")) {
    throw readbackError(
      ERROR_CODES.INVALID_INPUT,
      "unavailable must not report runCount (would collapse into no_users)",
    );
  }
  if (!noUsersSummary || noUsersSummary.status !== SUMMARY_STATUS.NO_USERS) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, "expected no_users status");
  }
  if (unavailableSummary.status === noUsersSummary.status) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, "capture statuses collapsed");
  }
  if (unavailableSummary.code === noUsersSummary.code) {
    throw readbackError(ERROR_CODES.INVALID_INPUT, "capture codes collapsed");
  }
  return true;
}

export function assertNoSyntheticRevenue(summary) {
  if (!summary?.earnings) return true;
  if (summary.earnings.status === EARNINGS_STATUS.OBSERVED) {
    for (const amt of summary.earnings.amounts || []) {
      if (!amt.evidenceRef) {
        throw readbackError(
          ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
          "observed amount missing evidenceRef",
        );
      }
      if (amt.synthetic === true) {
        throw readbackError(
          ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
          "synthetic amount forbidden",
        );
      }
    }
  }
  if (summary.earnings.status === EARNINGS_STATUS.UNAVAILABLE) {
    if ((summary.earnings.amounts || []).length > 0) {
      throw readbackError(
        ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
        "unavailable earnings must not carry amounts",
      );
    }
    if (summary.earnings.zeroRevenueClaim === true) {
      throw readbackError(
        ERROR_CODES.FORBIDDEN_SYNTHETIC_REVENUE,
        "must not claim zero revenue for unavailable earnings",
      );
    }
  }
  // Pricing observed must not be smuggled into earnings.amounts
  if (summary.pricingObserved?.length) {
    for (const p of summary.pricingObserved) {
      if (p.estimateReserveIsCharge === true && p.run_completed_usd == null) {
        // fine — just ensure we never treat estimate reserve as earnings
      }
    }
  }
  return true;
}

function emptyCountsByKind() {
  return {
    [EVENT_KINDS.DRAFT]: 0,
    [EVENT_KINDS.LISTED]: 0,
    [EVENT_KINDS.REVIEWED]: 0,
    [EVENT_KINDS.INSTALL]: 0,
    [EVENT_KINDS.RUN]: 0,
    [EVENT_KINDS.EARNINGS]: 0,
  };
}

function emptyCountsByProvider() {
  return {
    [PROVIDERS.GREXAL]: 0,
    [PROVIDERS.AGENSI]: 0,
  };
}

function privacyNotes() {
  return [
    "Privacy-bounded fields only: kind, provider, evidenceRef, lastObserved, counts, pricingObserved.",
    "Listed pricing (e.g. run_completed USD) is not earnings/payout.",
    "Earnings amounts pass through from evidence only — never invent $ figures.",
    "unavailable omits installCount/runCount; no_users sets them to 0.",
    "Providers limited to grexal|agensi.",
  ];
}

function truthNotes() {
  return [
    "DEMO fixtures mirror S124/S131/S149 observed statuses without fake money or payout.",
    "Grexal S149: PUBLIC_ACTIVE listed; pricing Version1 run_completed 0.02 USD (estimate reserve 0.025 is NOT a charge).",
    "Grexal: no customer execution/revenue/payout yet — earnings unavailable (pricing ≠ earnings).",
    "Agensi: Free PendingReview (Root owns next); 0 installs — do not invent installs/revenue.",
    "unavailable ≠ no_users; unavailable earnings ≠ zero revenue.",
  ];
}

function mutationBoundary() {
  return {
    executesProviderMutations: false,
    forbids: [
      "grexal login",
      "agensi Bot login",
      "price / publish / review-submit",
      "invent buyers or earnings amounts",
      "synthetic:true on earnings",
      "treat list pricing as earnings/payout",
      "collapse unavailable into no_users",
      "treat missing earnings as $0 revenue",
      "accept non-grexal/agensi marketplaces",
    ],
    ownerOfPublicationAndPrice: "Root",
    ownerOfPendingReviewOutcome: "Root",
  };
}
