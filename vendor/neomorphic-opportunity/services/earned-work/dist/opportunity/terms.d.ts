export declare const OPPORTUNITY_TERMS_SCHEMA = "neomorphic.opportunity-round.terms.v1";
export declare const OPPORTUNITY_SCHEMA_VERSION = 1;
export type OfferTerms = {
    offerKey: string;
    title: string;
    summary: string;
    slotCount: number;
    ownerReservedSlots?: number;
    rewardAtomic: number;
    maxEffortSeconds: number;
    publicClaimable: boolean;
    acceptance: string;
    evidenceKind: "discovery_trace" | "workflow_witness";
    rank: number;
};
export type AlternativeTerms = {
    alternativeKey: string;
    rank: number;
    title: string;
    summary: string;
    funded: false;
    paidSlot: false;
};
export type RoundTermsInput = {
    roundKey: string;
    principalCapAtomic: number;
    atomicScale: number;
    asset: string;
    network: string;
    chainId: number;
    submissionDeadline: string;
    claimTtlSeconds: number;
    reviewWithinDays: number;
    maxClarifications: number;
    maxEvidenceBytes: number;
    transferFeeCap: {
        amountAtomic: string;
        asset: string;
        note: string;
    };
    offers: OfferTerms[];
    alternatives: AlternativeTerms[];
};
export declare function canonicalRoundTerms(input: RoundTermsInput): {
    schema: string;
    schemaVersion: number;
    roundKey: string;
    principalCapAtomic: number;
    atomicScale: number;
    asset: string;
    network: string;
    chainId: number;
    submissionDeadline: string;
    claimTtlSeconds: number;
    reviewWithinDays: number;
    maxClarifications: number;
    maxEvidenceBytes: number;
    transferFeeCap: {
        amountAtomic: string;
        asset: string;
        note: string;
    };
    offers: {
        acceptance: string;
        evidenceKind: "discovery_trace" | "workflow_witness";
        maxEffortSeconds: number;
        offerKey: string;
        publicClaimable: boolean;
        rank: number;
        rewardAtomic: number;
        slotCount: number;
        ownerReservedSlots: number;
        summary: string;
        title: string;
    }[];
    alternatives: {
        alternativeKey: string;
        funded: false;
        paidSlot: false;
        rank: number;
        summary: string;
        title: string;
    }[];
    rules: {
        owedIsNotPaid: boolean;
        waitlistIsNotAPaidSlot: boolean;
        unknownIsNotReconstructed: boolean;
        fixtureIsNotProduction: boolean;
        payoutAdapter: string;
        rewardDoesNotDependOnEndorsement: boolean;
        noArtifactFetch: boolean;
    };
};
export declare function hashRoundTerms(input: RoundTermsInput): string;
