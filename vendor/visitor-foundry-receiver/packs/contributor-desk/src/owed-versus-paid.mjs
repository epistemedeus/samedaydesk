import {
  EARNED_WORK,
  NULL_PAYOUT_ADAPTER,
  OWED_VERSUS_PAID_SCHEMA,
  SETTLEMENT_RECEIPT_VIEW,
} from "./constants.mjs";

/**
 * Honest IOU comparison. Never confirms settlement.
 * Disjoint from R3-09 settlement-receipt-view.
 */
export function owedVersusPaid(task, { now } = {}) {
  // Public catalog rows omit payoutState. Accepted + released is the fixture IOU.
  const owed =
    task.payoutState === "owed" ||
    task.obligation?.payoutState === "owed" ||
    (task.payoutState == null &&
      task.obligation == null &&
      task.lifecycle === "accepted" &&
      task.fundingState === "released");
  // This desk never confirms settlement. Origin/task flags are not paid proof.
  const paid = false;
  const settled = false;
  const transfer = null;

  return {
    schema: OWED_VERSUS_PAID_SCHEMA,
    taskId: task.id,
    contributorPublicId: task.reservation?.contributorPublicId ?? task.obligation?.contributorPublicId ?? null,
    payoutState: task.payoutState ?? "none",
    owed,
    paid,
    settled,
    unlike: owed !== paid || paid !== settled || owed !== settled,
    transfer,
    paying: false,
    adapter: NULL_PAYOUT_ADAPTER,
    earnedWork: EARNED_WORK,
    settlementReceiptView: SETTLEMENT_RECEIPT_VIEW,
    actualCompletion: false,
    note: owed
      ? "Owed is an IOU record. Paid is false. Settled is false. This is not a settlement receipt."
      : "No owed obligation on this task. Paid and settled remain false. This is not a settlement receipt.",
    observedAt: now ?? task.updatedAt,
  };
}

export function assertNotSettlementReceipt(view) {
  if (view?.settled === true) {
    throw new Error("contributor desk must not emit settled=true");
  }
  if (view?.settlementReceiptView?.rendersSettlementReceipt === true) {
    throw new Error("contributor desk must not render a settlement receipt");
  }
  if (view?.transfer && view.transfer !== null) {
    throw new Error("contributor desk must not emit a transfer");
  }
  return true;
}
