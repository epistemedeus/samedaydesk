import type { Obligation, PayoutState } from "./types.js";
/** Default payout adapter. Never pays, queues, or settles. */
export declare const NULL_PAYOUT_ADAPTER = "null_nonpaying_v0";
export declare const PAYOUT_NOTE = "Null/nonpaying adapter. payoutState=owed is an IOU record, not paid and not settled. No chain transfer.";
export declare const EMPTY_PAYOUT_NOTE = "No owed obligation. An empty payout projection is not owed, not paid, and not a sale.";
export type PayoutReconciliation = {
    adapter: typeof NULL_PAYOUT_ADAPTER;
    payoutState: PayoutState;
    transfer: null;
    paying: false;
    paid: false;
    settled: false;
    sale: false;
    owed: boolean;
    note: string;
    obligationId: string | null;
    reservationId: string | null;
    contributorPublicId: string | null;
    payoutDestination: string | null;
    termsVersion: string | null;
};
/**
 * Reconcile a payout projection against the nonpaying adapter.
 * An empty projection (no obligation id) is never owed. An owed IOU is never a sale.
 */
export declare function reconcilePayout(input: {
    payoutState: PayoutState;
    obligation: Obligation | null;
}): PayoutReconciliation;
