import { hashTermsVersion, TERMS_VERSION_RE, isTermsVersionHash } from "@neomorphic/funded-task-terms/hash";
import type { Reward, Terms } from "./types.js";
/** Shape version of the F01 terms document. Distinct from termsVersion (content hash). */
export declare const SCHEMA_VERSION: 1;
export declare const EARNED_WORK_TERMS_SCHEMA: "neomorphic.earned-work.terms.v1";
export { TERMS_VERSION_RE, isTermsVersionHash, hashTermsVersion };
/** F17 complete-fixture golden. Shared by F01/F02/F07/F12/F17 agreement tests. */
export declare const F17_GOLDEN_TERMS_VERSION: "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f";
export type HashableTerms = {
    summary: string;
    reward: Reward;
    claimTtlSeconds: number;
    maxArtifactBytes: number;
    allowedMediaTypes: string[];
    slotLimit: number;
};
/**
 * Canonical F01 terms body hashed by F17 `hashTermsVersion`.
 * `termsRevision` is the correction counter (F02 alias), never a public termsVersion.
 */
export declare function earnedWorkTermsBody(taskId: string, termsRevision: number, terms: HashableTerms, schemaVersion?: number): {
    schema: "neomorphic.earned-work.terms.v1";
    schemaVersion: number;
    taskId: string;
    termsRevision: number;
    summary: string;
    reward: Reward;
    claimTtlSeconds: number;
    maxArtifactBytes: number;
    allowedMediaTypes: string[];
    slotLimit: number;
};
export declare function hashEarnedWorkTerms(taskId: string, termsRevision: number, terms: HashableTerms, schemaVersion?: number): string;
/** Exact non-secret canonical F01 terms body bound by `termsVersion`. */
export declare function publicTermsDocument(taskId: string, terms: Terms): {
    schema: "neomorphic.earned-work.terms.v1";
    schemaVersion: number;
    taskId: string;
    termsRevision: number;
    summary: string;
    reward: Reward;
    claimTtlSeconds: number;
    maxArtifactBytes: number;
    allowedMediaTypes: string[];
    slotLimit: number;
};
/**
 * Public claim key. Integers are rejected (no silent dual-key).
 * A one-way adapter that *writes* a hash lives as `hashTermsVersion` / `hashEarnedWorkTerms`.
 */
export declare function parseClaimTermsVersion(value: unknown): string;
