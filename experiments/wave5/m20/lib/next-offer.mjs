import { DEFAULT_OFFER } from "./pins.mjs";

function count(rows, useClass) {
  return rows.filter((row) => row.useClass === useClass).length;
}

export const NEXT_OFFER_RULES = Object.freeze([
  {
    id: "keep-offer-await-field-receipts",
    match(summary) {
      return summary.siblingPendingCount > 0 && summary.paidReturnCount === 0;
    },
    build(summary) {
      return {
        change: "keep-current-pr52-nonsettling-offer",
        targetOffer: summary.offerId || DEFAULT_OFFER,
        reason:
          "D27 and M15-M19 field receipts are absent in this checkout. Owner-qa dry runs and reserved-fixture repeats are not paid return or independent demand.",
        nextOwner: "W5-M01",
        remainingLiveSteps: [
          "Collect D27 recruited-trial receipts under experiments/wave5/d27/",
          "Collect M15-M19 trial receipts under their owned paths",
          "Re-run node experiments/wave5/m20/bin/readout.mjs dry-run --buyer-class owner-qa",
        ],
        evidenceIds: summary.siblingPendingIds,
      };
    },
  },
  {
    id: "keep-narrow-after-paid-return",
    match(summary) {
      return summary.paidReturnCount > 0;
    },
    build(summary) {
      return {
        change: "keep-narrow-offer-measure-volume",
        targetOffer: summary.offerId || DEFAULT_OFFER,
        reason: "An exact settlement join on a later job exists. Do not widen the offer until more joined returns exist.",
        nextOwner: "W5-M01",
        remainingLiveSteps: ["Record the next joined return against the same offer id"],
        evidenceIds: summary.paidReturnIds,
      };
    },
  },
  {
    id: "tighten-quickstart-inputs",
    match(summary) {
      return summary.frictionCount > summary.usefulUseCount && summary.frictionCount > 0;
    },
    build(summary) {
      return {
        change: "tighten-m14-quickstart-required-inputs",
        targetOffer: summary.offerId || DEFAULT_OFFER,
        reason: "First-use friction (missing inputs or SAMPLE-as-sale) outnumbers useful use.",
        nextOwner: "W5-M14",
        remainingLiveSteps: ["Show required --before/--after flags before any payment flag"],
        evidenceIds: summary.frictionIds,
      };
    },
  },
  {
    id: "hold-for-engine-transport",
    match(summary) {
      return summary.transportFailureCount > 0 && summary.usefulUseCount === 0;
    },
    build(summary) {
      return {
        change: "hold-offer-until-transport-is-honest",
        targetOffer: summary.offerId || DEFAULT_OFFER,
        reason: "Engine crash, timeout, or acquisition failure is not a valid analysis outcome.",
        nextOwner: "W5-D01",
        remainingLiveSteps: ["Replay against samedaydesk.paid-useful-jobs.execution.v1"],
        evidenceIds: summary.transportFailureIds,
      };
    },
  },
  {
    id: "publish-repeat-next-step",
    match(summary) {
      return summary.usefulUseCount > 0 && summary.repeatCount === 0 && summary.noReplyCount === 0;
    },
    build(summary) {
      return {
        change: "publish-repeat-job-binder-next-step",
        targetOffer: summary.offerId || DEFAULT_OFFER,
        reason: "Useful first jobs exist with no later job. The next offer should name the Co03 binder inputs.",
        nextOwner: "W5-D09",
        remainingLiveSteps: [
          "Point the caller at tools/repeat-job-binder once D09 consumes W4-commerce-03",
        ],
        evidenceIds: summary.usefulUseIds,
      };
    },
  },
  {
    id: "narrow-discovery-for-no-reply",
    match(summary) {
      return summary.noReplyCount > summary.usefulUseCount && summary.presentedCount > 0;
    },
    build(summary) {
      return {
        change: "narrow-discovery-copy-m12-m13",
        targetOffer: summary.offerId || DEFAULT_OFFER,
        reason: "Offers were presented and no later invocation was observed. Do not change the engine.",
        nextOwner: "W5-M13",
        remainingLiveSteps: ["Rewrite the discoverable example around the current required inputs"],
        evidenceIds: summary.noReplyIds,
      };
    },
  },
  {
    id: "keep-current-insufficient-field-evidence",
    match() {
      return true;
    },
    build(summary) {
      return {
        change: "keep-current-offer-insufficient-field-evidence",
        targetOffer: summary.offerId || DEFAULT_OFFER,
        reason: "No field class dominates. Keep the current PR52 offer and collect labelled observations.",
        nextOwner: "W5-M01",
        remainingLiveSteps: ["Add labelled observations and re-run classify"],
        evidenceIds: summary.allIds,
      };
    },
  },
]);

export function summarizeRows(rows, { offerId } = {}) {
  const classified = rows.filter((row) => row.useClass);
  const siblingPending = rows.filter((row) => row.siblingStatus === "pending" || (row.kind === "sibling-receipt" && row.present !== true));
  const friction = classified.filter(
    (row) => row.useClass === "failed-use" && row.failureKind === "first-use-friction",
  );
  const transportFailure = classified.filter(
    (row) => row.useClass === "failed-use" && row.failureKind === "transport",
  );
  return {
    offerId:
      offerId ||
      classified.find((row) => row.useClass === "useful-use")?.offerId ||
      classified.find((row) => row.useClass === "failed-use")?.offerId ||
      rows.find((row) => row.offerId)?.offerId ||
      DEFAULT_OFFER,
    presentedCount: rows.filter((row) => row.kind === "offer-presented").length,
    noReplyCount: count(classified, "no-reply"),
    failedUseCount: count(classified, "failed-use"),
    usefulUseCount: count(classified, "useful-use"),
    paidReturnCount: count(classified, "paid-return"),
    repeatCount: classified.filter((row) => row.repeat === true).length,
    frictionCount: friction.length,
    transportFailureCount: transportFailure.length,
    siblingPendingCount: siblingPending.length,
    siblingPendingIds: siblingPending.map((row) => row.id),
    paidReturnIds: classified.filter((row) => row.useClass === "paid-return").map((row) => row.id),
    frictionIds: friction.map((row) => row.id),
    transportFailureIds: transportFailure.map((row) => row.id),
    usefulUseIds: classified.filter((row) => row.useClass === "useful-use").map((row) => row.id),
    noReplyIds: classified.filter((row) => row.useClass === "no-reply").map((row) => row.id),
    allIds: rows.map((row) => row.id),
  };
}

export function recommendNextOffer(rows, options = {}) {
  const summary = summarizeRows(rows, options);
  const rule = NEXT_OFFER_RULES.find((entry) => entry.match(summary));
  const built = rule.build(summary);
  return {
    one: true,
    id: rule.id,
    ...built,
    counts: {
      noReply: summary.noReplyCount,
      failedUse: summary.failedUseCount,
      usefulUse: summary.usefulUseCount,
      paidReturn: summary.paidReturnCount,
      siblingPending: summary.siblingPendingCount,
    },
  };
}
