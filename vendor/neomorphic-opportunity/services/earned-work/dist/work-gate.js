import { cardFromEarnedWorkTask, scoreCard, workGateFromDimensions } from "@neomorphic/arena-workability-dimensions/f01";
function taskLikeFromAggregate(agg) {
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
export function workabilityForAggregate(agg, now) {
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
export function withWorkability(view, agg, now) {
    return { ...view, workability: workabilityForAggregate(agg, now) };
}
//# sourceMappingURL=work-gate.js.map