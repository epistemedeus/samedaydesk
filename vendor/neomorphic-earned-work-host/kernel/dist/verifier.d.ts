import type { Artifact, Terms, VerdictOutcome } from "./types.js";
export declare const DEFAULT_VERIFIER_VERSION = "earned-work.default-verifier.v1";
export declare const OWNER_VERIFIER_VERSION = "earned-work.owner-explicit.v1";
export declare const DEFAULT_VERIFIER_PASS_REASON = "digest, mediaType, and bytes are within terms bounds; this is not a reproduction of the submitted work";
export type VerifierInput = {
    artifact: Artifact;
    terms: Terms;
    taskId: string;
    reservationId: string;
    termsVersion: string;
    evidenceBytes?: Buffer | Uint8Array | null;
    contributorPublicId?: string;
};
export type VerifierResult = {
    outcome: VerdictOutcome;
    verifierVersion: string;
    reasons: string[];
};
export type VerifierHook = (input: VerifierInput) => VerifierResult;
/**
 * Deterministic metadata verifier. Checks digest/media/bytes bounds only.
 * Never fetches `artifact.ref` and never executes bytes.
 */
export declare function defaultVerifier(input: VerifierInput): VerifierResult;
