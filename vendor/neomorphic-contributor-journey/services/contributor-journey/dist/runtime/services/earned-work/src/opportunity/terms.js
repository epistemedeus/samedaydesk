import { hashTermsVersion } from "../terms-version.js";
import { ApiError } from "../errors.js";
import { createRoundBodySchema } from "./validate.js";
export const OPPORTUNITY_TERMS_SCHEMA = "neomorphic.opportunity-round.terms.v1";
export const OPPORTUNITY_SCHEMA_VERSION = 1;
export function canonicalRoundTerms(input) {
    const offers = [...input.offers]
        .map((offer) => ({
        acceptance: offer.acceptance,
        evidenceKind: offer.evidenceKind,
        maxEffortSeconds: offer.maxEffortSeconds,
        offerKey: offer.offerKey,
        publicClaimable: offer.publicClaimable,
        rank: offer.rank,
        rewardAtomic: offer.rewardAtomic,
        slotCount: offer.slotCount,
        ownerReservedSlots: offer.ownerReservedSlots ?? 0,
        summary: offer.summary,
        title: offer.title,
    }))
        .sort((a, b) => (a.offerKey < b.offerKey ? -1 : a.offerKey > b.offerKey ? 1 : 0));
    const alternatives = [...input.alternatives]
        .map((item) => ({
        alternativeKey: item.alternativeKey,
        funded: false,
        paidSlot: false,
        rank: item.rank,
        summary: item.summary,
        title: item.title,
    }))
        .sort((a, b) => a.rank - b.rank || (a.alternativeKey < b.alternativeKey ? -1 : 1));
    return {
        schema: input.accountNative ? "neomorphic.opportunity-round.terms.v3" : input.rewardAsset ? "neomorphic.opportunity-round.terms.v2" : OPPORTUNITY_TERMS_SCHEMA,
        schemaVersion: input.accountNative ? 3 : input.rewardAsset ? 2 : OPPORTUNITY_SCHEMA_VERSION,
        ...(input.rewardAsset ? { rewardAsset: input.rewardAsset } : {}),
        ...(input.accountNative ? { accountNative: input.accountNative } : {}),
        roundKey: input.roundKey,
        ...(input.receivingPolicy ? { receivingPolicy: input.receivingPolicy } : {}),
        principalCapAtomic: input.principalCapAtomic,
        atomicScale: input.atomicScale,
        asset: input.asset,
        network: input.network,
        chainId: input.chainId,
        submissionDeadline: input.submissionDeadline,
        claimTtlSeconds: input.claimTtlSeconds,
        reviewWithinDays: input.reviewWithinDays,
        maxClarifications: input.maxClarifications,
        maxEvidenceBytes: input.maxEvidenceBytes,
        transferFeeCap: {
            amountAtomic: input.transferFeeCap.amountAtomic,
            asset: input.transferFeeCap.asset,
            note: input.transferFeeCap.note,
        },
        offers,
        alternatives,
        rules: {
            owedIsNotPaid: true,
            waitlistIsNotAPaidSlot: true,
            unknownIsNotReconstructed: true,
            fixtureIsNotProduction: true,
            payoutAdapter: "null_nonpaying_v0",
            rewardDoesNotDependOnEndorsement: true,
            noArtifactFetch: true,
        },
    };
}
export function hashRoundTerms(input) {
    return hashTermsVersion(canonicalRoundTerms(input));
}
/** Validate immutable stored terms before granting future-round authority. */
export function readCanonicalRoundTerms(document, version) {
    function corrupt() { throw new ApiError(503, "invalid_storage", "stored terms failed validation"); }
    if (!document || typeof document !== "object" || Array.isArray(document))
        corrupt();
    const { schema, schemaVersion, rules, alternatives, ...input } = document;
    if (!Array.isArray(alternatives))
        corrupt();
    const parsed = createRoundBodySchema.safeParse({ ...input, provenance: "fixture", productionAdmission: false,
        alternatives: alternatives.map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item))
                corrupt();
            const { funded, paidSlot, ...terms } = item;
            if (funded !== false || paidSlot !== false)
                corrupt();
            return terms;
        }),
    });
    if (!parsed.success)
        corrupt();
    const termsInput = { ...parsed.data, maxEvidenceBytes: parsed.data.maxEvidenceBytes ?? 12000,
        alternatives: parsed.data.alternatives.map((item) => ({ ...item, funded: false, paidSlot: false })) };
    const terms = canonicalRoundTerms(termsInput);
    if (hashRoundTerms(termsInput) !== version || hashTermsVersion(document) !== version)
        corrupt();
    return terms;
}
//# sourceMappingURL=terms.js.map