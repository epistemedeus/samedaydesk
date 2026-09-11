import { SCHEMA_INTEROP, FUNDING } from "./constants.mjs";

/**
 * Interop draft v0 projection. Correct if needed; do not silently diverge.
 * This pack observes listings — it does not create reservations or payouts.
 */
export function toInteropV0(record, overlay = {}) {
  const rewardUnknown = record.reward?.unknown || record.reward?.amount == null;
  const funding = record.funding?.status || FUNDING.UNKNOWN;
  const payout = overlay.payout || (funding === FUNDING.RELEASED ? "confirmed" : "unknown");
  return {
    schema: SCHEMA_INTEROP,
    dataLabel: record.dataLabel,
    taskId: record.taskId,
    termsVersion: record.termsVersion,
    reward: {
      amount: rewardUnknown ? null : String(record.reward.amount),
      asset: record.reward?.asset || null,
      network: record.reward?.network || null,
      unknown: rewardUnknown,
    },
    funding,
    contributorPublicId: record.interopHints?.contributorPublicId || overlay.contributorPublicId || null,
    payoutDestination: overlay.payoutDestination || record.interopHints?.payoutDestination || null,
    reservation: overlay.reservation || {
      id: null,
      expiry: null,
      active: false,
      unknown: true,
      note: "At most one active reservation; none observed by this pack.",
    },
    submission: overlay.submission || {
      artifactRef: null,
      digest: null,
      mediaType: null,
      bytes: null,
      unknown: true,
    },
    verdict: overlay.verdict || {
      result: null,
      unknown: true,
      boundTo: {
        taskId: record.taskId,
        reservationId: null,
        termsVersion: record.termsVersion,
        artifactDigest: null,
        verifierVersion: null,
      },
    },
    payout,
    idempotencyKey: overlay.idempotencyKey || `${record.taskId}:${record.termsVersion}`,
    notes: [
      "contributorPublicId is not a payout destination",
      "reward amounts are atomic decimal strings, never floats",
      "fixture/test data is labelled on dataLabel",
    ],
  };
}

export function interopFromReport(records, overlays = []) {
  const byTask = new Map(overlays.map((o) => [o.taskId, o]));
  return records.map((r) => toInteropV0(r, byTask.get(r.taskId) || {}));
}
