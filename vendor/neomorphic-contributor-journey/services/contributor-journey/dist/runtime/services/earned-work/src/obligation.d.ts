import type { Obligation, Reward } from "./types.js";
export declare const OBLIGATION_ADAPTER = "typed_owed_record_v0";
export declare const OBLIGATION_NOTE = "Typed obligation only. No payment rail, no transfer, no settlement.";
export type OwedInput = {
    id: string;
    taskId: string;
    reservationId: string;
    submissionId: string;
    contributorPublicId: string;
    payoutDestination: string | null;
    reward: Reward;
    termsVersion: string;
    idempotencyKey: string;
    createdAt: string;
    verdictId: string;
};
export declare function toOwedObligation(input: OwedInput): Obligation;
