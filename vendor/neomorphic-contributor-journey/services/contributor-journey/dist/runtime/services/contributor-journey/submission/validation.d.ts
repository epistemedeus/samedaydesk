import { z } from 'zod';
import type { Claim, DraftRecord, EvidenceInput, FailureCode, FrozenDelivery } from './types.js';
export declare const MAX_EVIDENCE_BYTES = 16384;
export declare const MAX_REQUEST_BYTES = 32768;
export declare const opaqueId: z.ZodString;
export declare const keySchema: z.ZodString;
export declare const evidenceSchema: z.ZodObject<{
    format: z.ZodEnum<["plaintext", "json", "source"]>;
    body: z.ZodString;
    sourceReferences: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    body: string;
    format: "source" | "plaintext" | "json";
    sourceReferences: string[];
}, {
    body: string;
    format: "source" | "plaintext" | "json";
    sourceReferences: string[];
}>;
export declare const saveSchema: z.ZodObject<{
    reservationId: z.ZodString;
    termsVersion: z.ZodString;
    expectedRevision: z.ZodNumber;
    evidence: z.ZodObject<{
        format: z.ZodEnum<["plaintext", "json", "source"]>;
        body: z.ZodString;
        sourceReferences: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        body: string;
        format: "source" | "plaintext" | "json";
        sourceReferences: string[];
    }, {
        body: string;
        format: "source" | "plaintext" | "json";
        sourceReferences: string[];
    }>;
}, "strict", z.ZodTypeAny, {
    termsVersion: string;
    reservationId: string;
    evidence: {
        body: string;
        format: "source" | "plaintext" | "json";
        sourceReferences: string[];
    };
    expectedRevision: number;
}, {
    termsVersion: string;
    reservationId: string;
    evidence: {
        body: string;
        format: "source" | "plaintext" | "json";
        sourceReferences: string[];
    };
    expectedRevision: number;
}>;
export declare const submitSchema: z.ZodObject<{
    reservationId: z.ZodString;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    reservationId: string;
    expectedRevision: number;
}, {
    reservationId: string;
    expectedRevision: number;
}>;
export declare class SubmissionError extends Error {
    readonly code: FailureCode;
    constructor(code: FailureCode, message: string);
}
export declare function refuse(code: FailureCode, message: string): never;
export declare function rejectSecrets(value: string): void;
export declare function encodeEvidence(input: EvidenceInput, taskFamily?: Claim['taskFamily']): {
    content: string;
    mediaType: string;
    sources: string[];
};
export declare function boundedEvidence(input: EvidenceInput, claim: Claim): {
    bytes: number;
    digest: string;
    content: string;
    mediaType: string;
    sources: string[];
};
export declare function parseRecord(raw: unknown): DraftRecord;
export declare function assertFrozen(frozen: FrozenDelivery, record: DraftRecord): void;
