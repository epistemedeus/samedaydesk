import { publicTermsDocument } from "./terms-version.js";
export function isClaimable(agg, now) {
    const occupying = agg.reservation &&
        (agg.reservation.status === "active" || agg.reservation.status === "submitted") &&
        !(agg.reservation.status === "active" && new Date(agg.reservation.expiresAt).getTime() <= now.getTime());
    const occupyingCount = occupying ? 1 : 0;
    return (agg.task.lifecycle === "open" &&
        agg.task.fundingState === "reserved" &&
        occupyingCount < agg.terms.slotLimit);
}
export function publicTask(agg, now) {
    return {
        id: agg.task.id,
        title: agg.task.title,
        summary: agg.task.summary,
        provenance: agg.task.provenance,
        lifecycle: agg.task.lifecycle,
        fundingState: agg.task.fundingState,
        termsVersion: agg.task.currentTermsVersion,
        termsDocument: publicTermsDocument(agg.task.id, agg.terms),
        reward: agg.terms.reward,
        constraints: {
            claimTtlSeconds: agg.terms.claimTtlSeconds,
            maxArtifactBytes: agg.terms.maxArtifactBytes,
            allowedMediaTypes: agg.terms.allowedMediaTypes,
            slotLimit: agg.terms.slotLimit,
            correctionMaxRevisions: agg.task.correctionMaxRevisions,
        },
        claimable: isClaimable(agg, now),
        createdAt: agg.task.createdAt,
        updatedAt: agg.task.updatedAt,
    };
}
export function ownerTask(agg) {
    return {
        id: agg.task.id,
        title: agg.task.title,
        summary: agg.task.summary,
        provenance: agg.task.provenance,
        lifecycle: agg.task.lifecycle,
        fundingState: agg.task.fundingState,
        payoutState: agg.task.payoutState,
        termsVersion: agg.task.currentTermsVersion,
        termsDocument: publicTermsDocument(agg.task.id, agg.terms),
        terms: agg.terms,
        reward: agg.terms.reward,
        budget: agg.task.budget,
        correctionPolicy: { maxRevisions: agg.task.correctionMaxRevisions },
        acceptance: { requiresPassVerdict: true },
        reservation: agg.reservation,
        submission: agg.submission,
        verdict: agg.verdict,
        createdAt: agg.task.createdAt,
        updatedAt: agg.task.updatedAt,
    };
}
export function ownerTaskWithoutSecrets(view) {
    return view;
}
//# sourceMappingURL=redaction.js.map