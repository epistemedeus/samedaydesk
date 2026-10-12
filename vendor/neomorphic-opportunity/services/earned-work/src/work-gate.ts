import { cardFromEarnedWorkTask, scoreCard, workGateFromDimensions } from "@neomorphic/arena-workability-dimensions/f01";
import type { OwnerTaskView, PublicTaskView, TaskAggregate } from "./types.js";

export type WorkabilityView = {
  schema: "arena.a3.workability-dimensions.envelope.v1";
  packet: {
    eligibility: {
      agentAccess: string;
      claimAuthority: string;
      doNotStartWork: boolean;
    };
    funding: {
      class: string;
      deadlineExpired: boolean;
      purpose: string;
    };
    effort: {
      kind: string;
      winProbability: "unknown";
    };
    mixedScore: { value: number; displayOnly: true };
  };
  doNotStartWork: boolean;
  startWork: false;
  ignoredMixedScore: true;
  claimAuthority: string;
  reasons: string[];
  note: string;
};

function taskLikeFromAggregate(agg: TaskAggregate) {
  return {
    id: agg.task.id,
    title: agg.task.title,
    provenance: agg.task.provenance,
    lifecycle: agg.task.lifecycle,
    fundingState: agg.task.fundingState,
    payoutState: agg.task.payoutState,
    termsVersion: agg.task.currentTermsVersion,
    constraints: {
      slotLimit: agg.terms.slotLimit,
      claimTtlSeconds: agg.terms.claimTtlSeconds,
    },
    reservation: agg.reservation,
  };
}

export function workabilityForAggregate(agg: TaskAggregate, now?: Date): WorkabilityView {
  const card = cardFromEarnedWorkTask(taskLikeFromAggregate(agg));
  const envelope = scoreCard(card, { now: now ?? new Date() });
  const gate = workGateFromDimensions(envelope.packet);
  return {
    schema: envelope.schema,
    packet: {
      eligibility: envelope.packet.eligibility,
      funding: envelope.packet.funding,
      effort: {
        kind: envelope.packet.effort.kind,
        winProbability: "unknown",
      },
      mixedScore: envelope.packet.mixedScore ?? { value: 0, displayOnly: true },
    },
    doNotStartWork: envelope.doNotStartWork,
    startWork: false,
    ignoredMixedScore: true,
    claimAuthority: envelope.packet.eligibility.claimAuthority,
    reasons: gate.reasons,
    note: "A3 three-dimension gate. mixedScore is displayOnly and never authority. HTTP 200 / reserved budget without an escrow hash is not escrowed. Occupancy remains F01 exclusive claim.",
  };
}

export function withWorkability<T extends PublicTaskView | OwnerTaskView>(
  view: T,
  agg: TaskAggregate,
  now?: Date,
): T & { workability: WorkabilityView } {
  return { ...view, workability: workabilityForAggregate(agg, now) };
}
