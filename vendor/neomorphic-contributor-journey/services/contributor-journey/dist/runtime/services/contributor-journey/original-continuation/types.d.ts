import { z } from 'zod';
import type { Provenance } from '../../earned-work/src/types.js';
import type { submitBodySchema } from '../../earned-work/src/opportunity/validate.js';
export declare const canonicalSchema: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.original-continuation.canonical.v1">;
    roundKey: z.ZodString;
    claimId: z.ZodString;
    provenance: z.ZodEnum<["test", "fixture", "production"]>;
    claim: z.ZodObject<{
        id: z.ZodString;
        termsVersion: z.ZodString;
        status: z.ZodString;
        offerKey: z.ZodString;
        expiresAt: z.ZodString;
        deferStart: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        id: string;
        status: string;
        expiresAt: string;
        termsVersion: string;
        offerKey: string;
        deferStart: boolean;
    }, {
        id: string;
        status: string;
        expiresAt: string;
        termsVersion: string;
        offerKey: string;
        deferStart: boolean;
    }>;
    terms: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    submission: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        claimId: z.ZodString;
        termsVersion: z.ZodString;
        artifact: z.ZodObject<{
            ref: z.ZodString;
            digestSha256: z.ZodString;
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
        submittedAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        artifact: {
            ref: string;
            digestSha256: string;
            mediaType: string;
            bytes: number;
        };
        termsVersion: string;
        claimId: string;
        submittedAt: string;
    }, {
        id: string;
        artifact: {
            ref: string;
            digestSha256: string;
            mediaType: string;
            bytes: number;
        };
        termsVersion: string;
        claimId: string;
        submittedAt: string;
    }>>;
    obligation: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        claimId: z.ZodString;
        termsVersion: z.ZodString;
        settlementKey: z.ZodString;
        payoutState: z.ZodLiteral<"owed">;
        paid: z.ZodLiteral<false>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        termsVersion: string;
        payoutState: "owed";
        paid: false;
        claimId: string;
        settlementKey: string;
    }, {
        id: string;
        termsVersion: string;
        payoutState: "owed";
        paid: false;
        claimId: string;
        settlementKey: string;
    }>>;
    operation: z.ZodNullable<z.ZodObject<{
        key: z.ZodString;
        requestHash: z.ZodString;
        statusCode: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        statusCode: number;
        key: string;
        requestHash: string;
    }, {
        statusCode: number;
        key: string;
        requestHash: string;
    }>>;
}, "strict", z.ZodTypeAny, {
    claim: {
        id: string;
        status: string;
        expiresAt: string;
        termsVersion: string;
        offerKey: string;
        deferStart: boolean;
    };
    terms: Record<string, unknown>;
    submission: {
        id: string;
        artifact: {
            ref: string;
            digestSha256: string;
            mediaType: string;
            bytes: number;
        };
        termsVersion: string;
        claimId: string;
        submittedAt: string;
    } | null;
    obligation: {
        id: string;
        termsVersion: string;
        payoutState: "owed";
        paid: false;
        claimId: string;
        settlementKey: string;
    } | null;
    provenance: "test" | "fixture" | "production";
    roundKey: string;
    schema: "neomorphic.original-continuation.canonical.v1";
    claimId: string;
    operation: {
        statusCode: number;
        key: string;
        requestHash: string;
    } | null;
}, {
    claim: {
        id: string;
        status: string;
        expiresAt: string;
        termsVersion: string;
        offerKey: string;
        deferStart: boolean;
    };
    terms: Record<string, unknown>;
    submission: {
        id: string;
        artifact: {
            ref: string;
            digestSha256: string;
            mediaType: string;
            bytes: number;
        };
        termsVersion: string;
        claimId: string;
        submittedAt: string;
    } | null;
    obligation: {
        id: string;
        termsVersion: string;
        payoutState: "owed";
        paid: false;
        claimId: string;
        settlementKey: string;
    } | null;
    provenance: "test" | "fixture" | "production";
    roundKey: string;
    schema: "neomorphic.original-continuation.canonical.v1";
    claimId: string;
    operation: {
        statusCode: number;
        key: string;
        requestHash: string;
    } | null;
}>;
export type CanonicalRead = z.infer<typeof canonicalSchema>;
export type OriginalSubmission = z.infer<typeof submitBodySchema>;
export interface OriginalRoutePort {
    readonly origin: string;
    readonly roundKey: string;
    readonly provenance: Provenance;
    read(claimId: string, holderCredential: string, operationKey?: string): Promise<CanonicalRead>;
    submit(claimId: string, holderCredential: string, body: OriginalSubmission, operationKey: string): Promise<{
        status: number;
    }>;
}
export type Link = {
    id: string;
    account_id: string;
    desk_origin: string;
    canonical_origin: string;
    round_key: string;
    provenance: Provenance;
    claim_id: string;
    terms_version: string;
    holder_digest: string;
    consent_version: string;
    link_key: string;
    request_hash: string;
    revoked_at: Date | null;
};
export type Operation = {
    link_id: string;
    operation_key: string;
    canonical_key: string;
    request_hash: string;
    state: 'unknown' | 'confirmed' | 'refused';
    submission_id: string | null;
};
export type ContinuationCode = 'disabled' | 'invalid_input' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'revoked' | 'unavailable';
export declare class ContinuationError extends Error {
    readonly code: ContinuationCode;
    readonly status: number;
    constructor(code: ContinuationCode, status: number);
}
export declare const CONSENT_VERSION = "original-continuation/v1";
