import { z } from "zod";
export declare const createTaskBodySchema: z.ZodObject<{
    title: z.ZodString;
    summary: z.ZodString;
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    reward: z.ZodObject<{
        amount: z.ZodEffects<z.ZodString, string, string>;
        asset: z.ZodString;
        network: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        amount: string;
        asset: string;
        network: string;
    }, {
        amount: string;
        asset: string;
        network: string;
    }>;
    budget: z.ZodObject<{
        amount: z.ZodEffects<z.ZodString, string, string>;
        asset: z.ZodString;
        network: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        amount: string;
        asset: string;
        network: string;
    }, {
        amount: string;
        asset: string;
        network: string;
    }>;
    correctionPolicy: z.ZodOptional<z.ZodObject<{
        maxRevisions: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        maxRevisions?: number | undefined;
    }, {
        maxRevisions?: number | undefined;
    }>>;
    terms: z.ZodOptional<z.ZodObject<{
        summary: z.ZodOptional<z.ZodString>;
        claimTtlSeconds: z.ZodOptional<z.ZodNumber>;
        maxArtifactBytes: z.ZodOptional<z.ZodNumber>;
        allowedMediaTypes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        slotLimit: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        summary?: string | undefined;
        claimTtlSeconds?: number | undefined;
        maxArtifactBytes?: number | undefined;
        allowedMediaTypes?: string[] | undefined;
        slotLimit?: number | undefined;
    }, {
        summary?: string | undefined;
        claimTtlSeconds?: number | undefined;
        maxArtifactBytes?: number | undefined;
        allowedMediaTypes?: string[] | undefined;
        slotLimit?: number | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    title: string;
    summary: string;
    provenance: "test" | "fixture" | "production";
    reward: {
        amount: string;
        asset: string;
        network: string;
    };
    budget: {
        amount: string;
        asset: string;
        network: string;
    };
    terms?: {
        summary?: string | undefined;
        claimTtlSeconds?: number | undefined;
        maxArtifactBytes?: number | undefined;
        allowedMediaTypes?: string[] | undefined;
        slotLimit?: number | undefined;
    } | undefined;
    correctionPolicy?: {
        maxRevisions?: number | undefined;
    } | undefined;
}, {
    title: string;
    summary: string;
    provenance: "test" | "fixture" | "production";
    reward: {
        amount: string;
        asset: string;
        network: string;
    };
    budget: {
        amount: string;
        asset: string;
        network: string;
    };
    terms?: {
        summary?: string | undefined;
        claimTtlSeconds?: number | undefined;
        maxArtifactBytes?: number | undefined;
        allowedMediaTypes?: string[] | undefined;
        slotLimit?: number | undefined;
    } | undefined;
    correctionPolicy?: {
        maxRevisions?: number | undefined;
    } | undefined;
}>;
export declare const addTermsBodySchema: z.ZodObject<{
    summary: z.ZodString;
    reward: z.ZodObject<{
        amount: z.ZodEffects<z.ZodString, string, string>;
        asset: z.ZodString;
        network: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        amount: string;
        asset: string;
        network: string;
    }, {
        amount: string;
        asset: string;
        network: string;
    }>;
    claimTtlSeconds: z.ZodOptional<z.ZodNumber>;
    maxArtifactBytes: z.ZodOptional<z.ZodNumber>;
    allowedMediaTypes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    slotLimit: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    summary: string;
    reward: {
        amount: string;
        asset: string;
        network: string;
    };
    claimTtlSeconds?: number | undefined;
    maxArtifactBytes?: number | undefined;
    allowedMediaTypes?: string[] | undefined;
    slotLimit?: number | undefined;
}, {
    summary: string;
    reward: {
        amount: string;
        asset: string;
        network: string;
    };
    claimTtlSeconds?: number | undefined;
    maxArtifactBytes?: number | undefined;
    allowedMediaTypes?: string[] | undefined;
    slotLimit?: number | undefined;
}>;
export declare const reserveFundingBodySchema: z.ZodObject<{}, "strict", z.ZodTypeAny, {}, {}>;
export declare const contributorTokenBodySchema: z.ZodObject<{
    contributorPublicId: z.ZodString;
    payoutDestination: z.ZodOptional<z.ZodString>;
    taskId: z.ZodOptional<z.ZodString>;
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    expiresAt: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    provenance: "test" | "fixture" | "production";
    contributorPublicId: string;
    payoutDestination?: string | undefined;
    taskId?: string | undefined;
    expiresAt?: string | undefined;
}, {
    provenance: "test" | "fixture" | "production";
    contributorPublicId: string;
    payoutDestination?: string | undefined;
    taskId?: string | undefined;
    expiresAt?: string | undefined;
}>;
export declare const claimBodySchema: z.ZodObject<{
    termsVersion: z.ZodUnknown;
}, "strict", z.ZodTypeAny, {
    termsVersion?: unknown;
}, {
    termsVersion?: unknown;
}>;
export declare const artifactSchema: z.ZodObject<{
    ref: z.ZodEffects<z.ZodString, string, string>;
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
export declare const submitBodySchema: z.ZodObject<{
    reservationId: z.ZodString;
    artifact: z.ZodObject<{
        ref: z.ZodEffects<z.ZodString, string, string>;
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
    evidenceBase64: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    reservationId: string;
    artifact: {
        ref: string;
        digestSha256: string;
        mediaType: string;
        bytes: number;
    };
    evidenceBase64?: string | undefined;
}, {
    reservationId: string;
    artifact: {
        ref: string;
        digestSha256: string;
        mediaType: string;
        bytes: number;
    };
    evidenceBase64?: string | undefined;
}>;
export declare const verdictBodySchema: z.ZodObject<{
    reservationId: z.ZodString;
    outcome: z.ZodOptional<z.ZodEnum<["pass", "fail", "needs_review"]>>;
    artifactDigestSha256: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strict", z.ZodTypeAny, {
    reservationId: string;
    outcome?: "pass" | "fail" | "needs_review" | undefined;
    artifactDigestSha256?: string | undefined;
}, {
    reservationId: string;
    outcome?: "pass" | "fail" | "needs_review" | undefined;
    artifactDigestSha256?: string | undefined;
}>;
export declare const acceptBodySchema: z.ZodObject<{
    reservationId: z.ZodString;
    artifactDigestSha256: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    verdictId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    reservationId: string;
    artifactDigestSha256?: string | undefined;
    verdictId?: string | undefined;
}, {
    reservationId: string;
    artifactDigestSha256?: string | undefined;
    verdictId?: string | undefined;
}>;
export declare const rejectBodySchema: z.ZodObject<{
    reservationId: z.ZodString;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reservationId: string;
    reason: string;
}, {
    reservationId: string;
    reason: string;
}>;
export declare function parseBody<T>(schema: z.ZodType<T>, body: unknown): T;
export declare function requireIdempotencyKey(value: string | string[] | undefined): string;
export declare const DEFAULT_CLAIM_TTL_SECONDS = 3600;
export declare const DEFAULT_MAX_ARTIFACT_BYTES = 65536;
export declare const DEFAULT_MEDIA_TYPES: readonly ["text/plain", "application/json"];
export declare const DEFAULT_SLOT_LIMIT = 1;
export declare const DEFAULT_CORRECTION_MAX_REVISIONS = 1;
