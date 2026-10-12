import type { Obligation, Reward } from "./types.js";

export const OBLIGATION_ADAPTER = "typed_owed_record_v0";
export const OBLIGATION_NOTE =
  "Typed obligation only. No payment rail, no transfer, no settlement.";

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

export function toOwedObligation(input: OwedInput): Obligation {
  return {
    id: input.id,
    kind: "owed_record",
    adapter: OBLIGATION_ADAPTER,
    taskId: input.taskId,
    reservationId: input.reservationId,
    submissionId: input.submissionId,
    contributorPublicId: input.contributorPublicId,
    payoutDestination: input.payoutDestination,
    reward: input.reward,
    payoutState: "owed",
    termsVersion: input.termsVersion,
    idempotencyKey: input.idempotencyKey,
    verdictId: input.verdictId,
    transfer: null,
    note: OBLIGATION_NOTE,
    createdAt: input.createdAt,
  };
}
