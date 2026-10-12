import { z } from "zod";
export declare const SOURCE_ROUTES: readonly ["search", "feed", "api", "mcp", "another_agent", "direct_invitation", "other", "unknown"];
export declare const selfReportSchema: z.ZodObject<{
    listingRef: z.ZodNullable<z.ZodString>;
    encounterAt: z.ZodNullable<z.ZodString>;
    encounterEstimated: z.ZodBoolean;
    route: z.ZodEnum<["search", "feed", "api", "mcp", "another_agent", "direct_invitation", "other", "unknown"]>;
    query: z.ZodNullable<z.ZodString>;
    endpointOrFilter: z.ZodNullable<z.ZodString>;
    upstreamPublicLink: z.ZodNullable<z.ZodString>;
    snippetRef: z.ZodNullable<z.ZodString>;
    pagesFollowed: z.ZodArray<z.ZodString, "many">;
    decisionPoint: z.ZodNullable<z.ZodString>;
    role: z.ZodNullable<z.ZodString>;
    activeMinutes: z.ZodNullable<z.ZodNumber>;
    confidence: z.ZodEnum<["measured", "estimated", "unknown"]>;
    unknowns: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    listingRef: string | null;
    encounterAt: string | null;
    encounterEstimated: boolean;
    route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
    query: string | null;
    endpointOrFilter: string | null;
    upstreamPublicLink: string | null;
    snippetRef: string | null;
    pagesFollowed: string[];
    decisionPoint: string | null;
    role: string | null;
    activeMinutes: number | null;
    confidence: "unknown" | "measured" | "estimated";
    unknowns: string[];
}, {
    listingRef: string | null;
    encounterAt: string | null;
    encounterEstimated: boolean;
    route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
    query: string | null;
    endpointOrFilter: string | null;
    upstreamPublicLink: string | null;
    snippetRef: string | null;
    pagesFollowed: string[];
    decisionPoint: string | null;
    role: string | null;
    activeMinutes: number | null;
    confidence: "unknown" | "measured" | "estimated";
    unknowns: string[];
}>;
export declare const observedSchema: z.ZodObject<{
    eventIds: z.ZodArray<z.ZodString, "many">;
    placementId: z.ZodNullable<z.ZodString>;
    campaignId: z.ZodNullable<z.ZodString>;
    sourceId: z.ZodNullable<z.ZodString>;
    providerId: z.ZodNullable<z.ZodString>;
    query: z.ZodNullable<z.ZodString>;
    endpoint: z.ZodNullable<z.ZodString>;
    reconstructed: z.ZodLiteral<false>;
}, "strict", z.ZodTypeAny, {
    query: string | null;
    eventIds: string[];
    placementId: string | null;
    campaignId: string | null;
    sourceId: string | null;
    providerId: string | null;
    endpoint: string | null;
    reconstructed: false;
}, {
    query: string | null;
    eventIds: string[];
    placementId: string | null;
    campaignId: string | null;
    sourceId: string | null;
    providerId: string | null;
    endpoint: string | null;
    reconstructed: false;
}>;
export declare const sourceBodySchema: z.ZodObject<{
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    selfReport: z.ZodObject<{
        listingRef: z.ZodNullable<z.ZodString>;
        encounterAt: z.ZodNullable<z.ZodString>;
        encounterEstimated: z.ZodBoolean;
        route: z.ZodEnum<["search", "feed", "api", "mcp", "another_agent", "direct_invitation", "other", "unknown"]>;
        query: z.ZodNullable<z.ZodString>;
        endpointOrFilter: z.ZodNullable<z.ZodString>;
        upstreamPublicLink: z.ZodNullable<z.ZodString>;
        snippetRef: z.ZodNullable<z.ZodString>;
        pagesFollowed: z.ZodArray<z.ZodString, "many">;
        decisionPoint: z.ZodNullable<z.ZodString>;
        role: z.ZodNullable<z.ZodString>;
        activeMinutes: z.ZodNullable<z.ZodNumber>;
        confidence: z.ZodEnum<["measured", "estimated", "unknown"]>;
        unknowns: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        listingRef: string | null;
        encounterAt: string | null;
        encounterEstimated: boolean;
        route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
        query: string | null;
        endpointOrFilter: string | null;
        upstreamPublicLink: string | null;
        snippetRef: string | null;
        pagesFollowed: string[];
        decisionPoint: string | null;
        role: string | null;
        activeMinutes: number | null;
        confidence: "unknown" | "measured" | "estimated";
        unknowns: string[];
    }, {
        listingRef: string | null;
        encounterAt: string | null;
        encounterEstimated: boolean;
        route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
        query: string | null;
        endpointOrFilter: string | null;
        upstreamPublicLink: string | null;
        snippetRef: string | null;
        pagesFollowed: string[];
        decisionPoint: string | null;
        role: string | null;
        activeMinutes: number | null;
        confidence: "unknown" | "measured" | "estimated";
        unknowns: string[];
    }>;
    observed: z.ZodObject<{
        eventIds: z.ZodArray<z.ZodString, "many">;
        placementId: z.ZodNullable<z.ZodString>;
        campaignId: z.ZodNullable<z.ZodString>;
        sourceId: z.ZodNullable<z.ZodString>;
        providerId: z.ZodNullable<z.ZodString>;
        query: z.ZodNullable<z.ZodString>;
        endpoint: z.ZodNullable<z.ZodString>;
        reconstructed: z.ZodLiteral<false>;
    }, "strict", z.ZodTypeAny, {
        query: string | null;
        eventIds: string[];
        placementId: string | null;
        campaignId: string | null;
        sourceId: string | null;
        providerId: string | null;
        endpoint: string | null;
        reconstructed: false;
    }, {
        query: string | null;
        eventIds: string[];
        placementId: string | null;
        campaignId: string | null;
        sourceId: string | null;
        providerId: string | null;
        endpoint: string | null;
        reconstructed: false;
    }>;
}, "strict", z.ZodTypeAny, {
    provenance: "test" | "fixture" | "production";
    selfReport: {
        listingRef: string | null;
        encounterAt: string | null;
        encounterEstimated: boolean;
        route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
        query: string | null;
        endpointOrFilter: string | null;
        upstreamPublicLink: string | null;
        snippetRef: string | null;
        pagesFollowed: string[];
        decisionPoint: string | null;
        role: string | null;
        activeMinutes: number | null;
        confidence: "unknown" | "measured" | "estimated";
        unknowns: string[];
    };
    observed: {
        query: string | null;
        eventIds: string[];
        placementId: string | null;
        campaignId: string | null;
        sourceId: string | null;
        providerId: string | null;
        endpoint: string | null;
        reconstructed: false;
    };
}, {
    provenance: "test" | "fixture" | "production";
    selfReport: {
        listingRef: string | null;
        encounterAt: string | null;
        encounterEstimated: boolean;
        route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
        query: string | null;
        endpointOrFilter: string | null;
        upstreamPublicLink: string | null;
        snippetRef: string | null;
        pagesFollowed: string[];
        decisionPoint: string | null;
        role: string | null;
        activeMinutes: number | null;
        confidence: "unknown" | "measured" | "estimated";
        unknowns: string[];
    };
    observed: {
        query: string | null;
        eventIds: string[];
        placementId: string | null;
        campaignId: string | null;
        sourceId: string | null;
        providerId: string | null;
        endpoint: string | null;
        reconstructed: false;
    };
}>;
export declare const createRoundBodySchema: z.ZodObject<{
    roundKey: z.ZodString;
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    productionAdmission: z.ZodBoolean;
    principalCapAtomic: z.ZodNumber;
    atomicScale: z.ZodNumber;
    asset: z.ZodString;
    network: z.ZodString;
    chainId: z.ZodNumber;
    submissionDeadline: z.ZodString;
    claimTtlSeconds: z.ZodNumber;
    reviewWithinDays: z.ZodNumber;
    maxClarifications: z.ZodNumber;
    maxEvidenceBytes: z.ZodOptional<z.ZodNumber>;
    transferFeeCap: z.ZodObject<{
        amountAtomic: z.ZodString;
        asset: z.ZodString;
        note: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        note: string;
        asset: string;
        amountAtomic: string;
    }, {
        note: string;
        asset: string;
        amountAtomic: string;
    }>;
    offers: z.ZodArray<z.ZodObject<{
        offerKey: z.ZodString;
        title: z.ZodString;
        summary: z.ZodString;
        slotCount: z.ZodNumber;
        ownerReservedSlots: z.ZodOptional<z.ZodNumber>;
        rewardAtomic: z.ZodNumber;
        maxEffortSeconds: z.ZodNumber;
        acceptance: z.ZodString;
        evidenceKind: z.ZodEnum<["discovery_trace", "workflow_witness"]>;
        publicClaimable: z.ZodBoolean;
        rank: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        title: string;
        summary: string;
        offerKey: string;
        slotCount: number;
        rewardAtomic: number;
        maxEffortSeconds: number;
        acceptance: string;
        evidenceKind: "discovery_trace" | "workflow_witness";
        publicClaimable: boolean;
        rank: number;
        ownerReservedSlots?: number | undefined;
    }, {
        title: string;
        summary: string;
        offerKey: string;
        slotCount: number;
        rewardAtomic: number;
        maxEffortSeconds: number;
        acceptance: string;
        evidenceKind: "discovery_trace" | "workflow_witness";
        publicClaimable: boolean;
        rank: number;
        ownerReservedSlots?: number | undefined;
    }>, "many">;
    alternatives: z.ZodArray<z.ZodObject<{
        alternativeKey: z.ZodString;
        rank: z.ZodNumber;
        title: z.ZodString;
        summary: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        title: string;
        summary: string;
        rank: number;
        alternativeKey: string;
    }, {
        title: string;
        summary: string;
        rank: number;
        alternativeKey: string;
    }>, "many">;
    expectedTermsVersion: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    provenance: "test" | "fixture" | "production";
    asset: string;
    network: string;
    claimTtlSeconds: number;
    roundKey: string;
    productionAdmission: boolean;
    principalCapAtomic: number;
    atomicScale: number;
    chainId: number;
    submissionDeadline: string;
    reviewWithinDays: number;
    maxClarifications: number;
    transferFeeCap: {
        note: string;
        asset: string;
        amountAtomic: string;
    };
    offers: {
        title: string;
        summary: string;
        offerKey: string;
        slotCount: number;
        rewardAtomic: number;
        maxEffortSeconds: number;
        acceptance: string;
        evidenceKind: "discovery_trace" | "workflow_witness";
        publicClaimable: boolean;
        rank: number;
        ownerReservedSlots?: number | undefined;
    }[];
    alternatives: {
        title: string;
        summary: string;
        rank: number;
        alternativeKey: string;
    }[];
    maxEvidenceBytes?: number | undefined;
    expectedTermsVersion?: string | undefined;
}, {
    provenance: "test" | "fixture" | "production";
    asset: string;
    network: string;
    claimTtlSeconds: number;
    roundKey: string;
    productionAdmission: boolean;
    principalCapAtomic: number;
    atomicScale: number;
    chainId: number;
    submissionDeadline: string;
    reviewWithinDays: number;
    maxClarifications: number;
    transferFeeCap: {
        note: string;
        asset: string;
        amountAtomic: string;
    };
    offers: {
        title: string;
        summary: string;
        offerKey: string;
        slotCount: number;
        rewardAtomic: number;
        maxEffortSeconds: number;
        acceptance: string;
        evidenceKind: "discovery_trace" | "workflow_witness";
        publicClaimable: boolean;
        rank: number;
        ownerReservedSlots?: number | undefined;
    }[];
    alternatives: {
        title: string;
        summary: string;
        rank: number;
        alternativeKey: string;
    }[];
    maxEvidenceBytes?: number | undefined;
    expectedTermsVersion?: string | undefined;
}>;
export declare const importBodySchema: z.ZodObject<{
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    offerKey: z.ZodString;
    publicLabel: z.ZodString;
    importKey: z.ZodString;
    credentialRef: z.ZodString;
    deferStart: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    provenance: "test" | "fixture" | "production";
    credentialRef: string;
    offerKey: string;
    publicLabel: string;
    importKey: string;
    deferStart?: boolean | undefined;
}, {
    provenance: "test" | "fixture" | "production";
    credentialRef: string;
    offerKey: string;
    publicLabel: string;
    importKey: string;
    deferStart?: boolean | undefined;
}>;
export declare const assignBodySchema: z.ZodObject<{
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    offerKey: z.ZodString;
    publicLabel: z.ZodString;
    importKey: z.ZodString;
    credentialRef: z.ZodString;
    deferStart: z.ZodOptional<z.ZodBoolean>;
} & {
    scope: z.ZodObject<{
        title: z.ZodString;
        instructions: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        title: string;
        instructions: string;
    }, {
        title: string;
        instructions: string;
    }>;
}, "strict", z.ZodTypeAny, {
    provenance: "test" | "fixture" | "production";
    credentialRef: string;
    offerKey: string;
    publicLabel: string;
    importKey: string;
    scope: {
        title: string;
        instructions: string;
    };
    deferStart?: boolean | undefined;
}, {
    provenance: "test" | "fixture" | "production";
    credentialRef: string;
    offerKey: string;
    publicLabel: string;
    importKey: string;
    scope: {
        title: string;
        instructions: string;
    };
    deferStart?: boolean | undefined;
}>;
export declare const claimBodySchema: z.ZodObject<{
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    offerKey: z.ZodString;
    termsVersion: z.ZodString;
    publicLabel: z.ZodString;
    volunteeredObservation: z.ZodOptional<z.ZodObject<Omit<{
        eventIds: z.ZodArray<z.ZodString, "many">;
        placementId: z.ZodNullable<z.ZodString>;
        campaignId: z.ZodNullable<z.ZodString>;
        sourceId: z.ZodNullable<z.ZodString>;
        providerId: z.ZodNullable<z.ZodString>;
        query: z.ZodNullable<z.ZodString>;
        endpoint: z.ZodNullable<z.ZodString>;
        reconstructed: z.ZodLiteral<false>;
    }, "eventIds" | "endpoint" | "reconstructed">, "strict", z.ZodTypeAny, {
        query: string | null;
        placementId: string | null;
        campaignId: string | null;
        sourceId: string | null;
        providerId: string | null;
    }, {
        query: string | null;
        placementId: string | null;
        campaignId: string | null;
        sourceId: string | null;
        providerId: string | null;
    }>>;
}, "strict", z.ZodTypeAny, {
    provenance: "test" | "fixture" | "production";
    termsVersion: string;
    offerKey: string;
    publicLabel: string;
    volunteeredObservation?: {
        query: string | null;
        placementId: string | null;
        campaignId: string | null;
        sourceId: string | null;
        providerId: string | null;
    } | undefined;
}, {
    provenance: "test" | "fixture" | "production";
    termsVersion: string;
    offerKey: string;
    publicLabel: string;
    volunteeredObservation?: {
        query: string | null;
        placementId: string | null;
        campaignId: string | null;
        sourceId: string | null;
        providerId: string | null;
    } | undefined;
}>;
export declare const waitlistBodySchema: z.ZodObject<{
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    publicLabel: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    provenance: "test" | "fixture" | "production";
    publicLabel: string;
    reason?: string | undefined;
}, {
    provenance: "test" | "fixture" | "production";
    publicLabel: string;
    reason?: string | undefined;
}>;
export declare const submitBodySchema: z.ZodObject<{
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    artifact: z.ZodObject<{
        ref: z.ZodString;
        digestSha256: z.ZodEffects<z.ZodString, string, string>;
        mediaType: z.ZodString;
        bytes: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        ref: string;
        digestSha256: string;
        mediaType: string;
        bytes: number;
    }, {
        ref: string;
        digestSha256: string;
        mediaType: string;
        bytes: number;
    }>;
    evidence: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    modelUsage: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    contributorActiveMinutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    artifact: {
        ref: string;
        digestSha256: string;
        mediaType: string;
        bytes: number;
    };
    provenance: "test" | "fixture" | "production";
    evidence: Record<string, unknown>;
    modelUsage?: string | null | undefined;
    contributorActiveMinutes?: number | null | undefined;
}, {
    artifact: {
        ref: string;
        digestSha256: string;
        mediaType: string;
        bytes: number;
    };
    provenance: "test" | "fixture" | "production";
    evidence: Record<string, unknown>;
    modelUsage?: string | null | undefined;
    contributorActiveMinutes?: number | null | undefined;
}>;
export declare const discoveryEvidenceSchema: z.ZodObject<{
    kind: z.ZodLiteral<"discovery_trace">;
    selfReport: z.ZodObject<{
        listingRef: z.ZodNullable<z.ZodString>;
        encounterAt: z.ZodNullable<z.ZodString>;
        encounterEstimated: z.ZodBoolean;
        route: z.ZodEnum<["search", "feed", "api", "mcp", "another_agent", "direct_invitation", "other", "unknown"]>;
        query: z.ZodNullable<z.ZodString>;
        endpointOrFilter: z.ZodNullable<z.ZodString>;
        upstreamPublicLink: z.ZodNullable<z.ZodString>;
        snippetRef: z.ZodNullable<z.ZodString>;
        pagesFollowed: z.ZodArray<z.ZodString, "many">;
        decisionPoint: z.ZodNullable<z.ZodString>;
        role: z.ZodNullable<z.ZodString>;
        activeMinutes: z.ZodNullable<z.ZodNumber>;
        confidence: z.ZodEnum<["measured", "estimated", "unknown"]>;
        unknowns: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        listingRef: string | null;
        encounterAt: string | null;
        encounterEstimated: boolean;
        route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
        query: string | null;
        endpointOrFilter: string | null;
        upstreamPublicLink: string | null;
        snippetRef: string | null;
        pagesFollowed: string[];
        decisionPoint: string | null;
        role: string | null;
        activeMinutes: number | null;
        confidence: "unknown" | "measured" | "estimated";
        unknowns: string[];
    }, {
        listingRef: string | null;
        encounterAt: string | null;
        encounterEstimated: boolean;
        route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
        query: string | null;
        endpointOrFilter: string | null;
        upstreamPublicLink: string | null;
        snippetRef: string | null;
        pagesFollowed: string[];
        decisionPoint: string | null;
        role: string | null;
        activeMinutes: number | null;
        confidence: "unknown" | "measured" | "estimated";
        unknowns: string[];
    }>;
}, "strict", z.ZodTypeAny, {
    selfReport: {
        listingRef: string | null;
        encounterAt: string | null;
        encounterEstimated: boolean;
        route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
        query: string | null;
        endpointOrFilter: string | null;
        upstreamPublicLink: string | null;
        snippetRef: string | null;
        pagesFollowed: string[];
        decisionPoint: string | null;
        role: string | null;
        activeMinutes: number | null;
        confidence: "unknown" | "measured" | "estimated";
        unknowns: string[];
    };
    kind: "discovery_trace";
}, {
    selfReport: {
        listingRef: string | null;
        encounterAt: string | null;
        encounterEstimated: boolean;
        route: "unknown" | "search" | "feed" | "api" | "mcp" | "another_agent" | "direct_invitation" | "other";
        query: string | null;
        endpointOrFilter: string | null;
        upstreamPublicLink: string | null;
        snippetRef: string | null;
        pagesFollowed: string[];
        decisionPoint: string | null;
        role: string | null;
        activeMinutes: number | null;
        confidence: "unknown" | "measured" | "estimated";
        unknowns: string[];
    };
    kind: "discovery_trace";
}>;
export declare const workflowEvidenceSchema: z.ZodObject<{
    kind: z.ZodLiteral<"workflow_witness">;
    attempt: z.ZodString;
    limitationOrResult: z.ZodString;
    syntheticFailure: z.ZodLiteral<false>;
    versions: z.ZodOptional<z.ZodString>;
    minimalInput: z.ZodOptional<z.ZodString>;
    expectedResult: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    kind: "workflow_witness";
    attempt: string;
    limitationOrResult: string;
    syntheticFailure: false;
    versions?: string | undefined;
    minimalInput?: string | undefined;
    expectedResult?: string | undefined;
}, {
    kind: "workflow_witness";
    attempt: string;
    limitationOrResult: string;
    syntheticFailure: false;
    versions?: string | undefined;
    minimalInput?: string | undefined;
    expectedResult?: string | undefined;
}>;
export declare const acceptBodySchema: z.ZodObject<{
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    requesterActiveMinutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    provenance: "test" | "fixture" | "production";
    requesterActiveMinutes?: number | null | undefined;
}, {
    provenance: "test" | "fixture" | "production";
    requesterActiveMinutes?: number | null | undefined;
}>;
export declare const provenanceBodySchema: z.ZodObject<{
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
}, "strict", z.ZodTypeAny, {
    provenance: "test" | "fixture" | "production";
}, {
    provenance: "test" | "fixture" | "production";
}>;
export declare const cohortBodySchema: z.ZodObject<{
    kind: z.ZodEnum<["contacted", "delivered", "replied", "claimed", "completed", "accepted", "paid", "useful_later_consumer"]>;
    eventRef: z.ZodString;
    publicLabel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    activeMinutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strict", z.ZodTypeAny, {
    kind: "claimed" | "accepted" | "completed" | "contacted" | "delivered" | "replied" | "paid" | "useful_later_consumer";
    eventRef: string;
    activeMinutes?: number | null | undefined;
    publicLabel?: string | null | undefined;
}, {
    kind: "claimed" | "accepted" | "completed" | "contacted" | "delivered" | "replied" | "paid" | "useful_later_consumer";
    eventRef: string;
    activeMinutes?: number | null | undefined;
    publicLabel?: string | null | undefined;
}>;
export declare const noticeBodySchema: z.ZodObject<{
    campaignKey: z.ZodString;
    preservedPromise: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    nextRoundKey: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    campaignKey: string;
    preservedPromise: Record<string, unknown>;
    nextRoundKey?: string | null | undefined;
}, {
    campaignKey: string;
    preservedPromise: Record<string, unknown>;
    nextRoundKey?: string | null | undefined;
}>;
export declare function parseBody<T>(schema: z.ZodType<T>, value: unknown): T;
