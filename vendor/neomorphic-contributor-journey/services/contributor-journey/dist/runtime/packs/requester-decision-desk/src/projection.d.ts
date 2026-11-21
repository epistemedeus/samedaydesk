import { NULL_PAYOUT_ADAPTER, OBLIGATION_KIND } from "./constants.js";
export type ProjectedAccept = {
    accepted: true;
    paid: false;
    settled: false;
    transfer: null;
    payoutState: "owed";
    obligationKind: typeof OBLIGATION_KIND;
    obligationAdapter: string;
    obligationId: string | null;
    obligationTermsVersion: string;
    payoutAdapter: typeof NULL_PAYOUT_ADAPTER;
    nextAction: "wait_owed";
};
/**
 * Payout documents must carry an explicit payoutState. Missing, blank, or
 * object-only bodies are unknown. They are never owed.
 */
export declare function readExplicitPayoutState(payoutBody: unknown): string;
/**
 * F02 INTEROP + current I01 Obligation: accept creates owed_record with
 * termsVersion. Paid/settled claims are refused. Empty payout is handled by
 * readExplicitPayoutState, not by this accept projector.
 */
export declare function projectAccept(acceptBody: unknown): ProjectedAccept;
export declare function projectPayout(payoutBody: unknown): {
    paid: false;
    settled: false;
    transfer: null;
    paying: false;
    payoutState: string;
};
export declare function refuseLlmVerdictAsPayout(verdict: unknown): never;
