/** Default payout adapter. Never pays, queues, or settles. */
export const NULL_PAYOUT_ADAPTER = "null_nonpaying_v0";
export const PAYOUT_NOTE = "Null/nonpaying adapter. payoutState=owed is an IOU record, not paid and not settled. No chain transfer.";
export const EMPTY_PAYOUT_NOTE = "No owed obligation. An empty payout projection is not owed, not paid, and not a sale.";
/**
 * Reconcile a payout projection against the nonpaying adapter.
 * An empty projection (no obligation id) is never owed. An owed IOU is never a sale.
 */
export function reconcilePayout(input) {
    const obligation = input.obligation;
    const obligationId = typeof obligation?.id === "string" && obligation.id.length > 0 ? obligation.id : null;
    const owed = Boolean(obligationId) && obligation?.payoutState === "owed";
    const payoutState = owed ? "owed" : input.payoutState === "owed" && !obligationId ? "none" : input.payoutState;
    return {
        adapter: NULL_PAYOUT_ADAPTER,
        payoutState,
        transfer: null,
        paying: false,
        paid: false,
        settled: false,
        sale: false,
        owed,
        note: owed ? PAYOUT_NOTE : EMPTY_PAYOUT_NOTE,
        obligationId,
        reservationId: obligation?.reservationId ?? null,
        contributorPublicId: obligation?.contributorPublicId ?? null,
        payoutDestination: obligation?.payoutDestination ?? null,
        termsVersion: obligation?.termsVersion ?? null,
    };
}
//# sourceMappingURL=payout.js.map