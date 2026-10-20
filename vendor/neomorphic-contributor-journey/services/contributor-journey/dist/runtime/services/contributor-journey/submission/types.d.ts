import type { Artifact, Reservation, Submission, Verdict } from '../../earned-work/src/types.js';
export type AuthenticatedAccount = {
    accountId: string;
    sessionId: string;
    authTime: string;
    expiresAt: string;
};
export type Claim = {
    taskFamily?: 'kernel' | 'opportunity';
    accountId: string;
    taskId: string;
    reservationId: string;
    termsId: string;
    termsVersion: string;
    currentTermsVersion: string;
    expiresAt: string;
    status: Reservation['status'];
    maxArtifactBytes: number;
    allowedMediaTypes: string[];
};
export type EvidenceInput = {
    format: 'plaintext' | 'json' | 'source';
    body: string;
    sourceReferences: string[];
};
export type Draft = {
    taskFamily?: 'kernel' | 'opportunity';
    accountId: string;
    taskId: string;
    reservationId: string;
    termsId: string;
    termsVersion: string;
    revision: number;
    evidence: EvidenceInput;
    updatedAt: string;
};
export type FrozenDelivery = {
    taskFamily?: 'kernel' | 'opportunity';
    artifactId: string;
    artifact: Artifact;
    content: string;
    sourceReferences: string[];
    taskId: string;
    reservationId: string;
    termsId: string;
    termsVersion: string;
    accountId: string;
    revision: number;
    kernelIdempotencyKey: string;
    requestHash: string;
    frozenAt: string;
};
export type DraftRecord = {
    draft: Draft;
    frozen: FrozenDelivery | null;
};
export type KernelSnapshot = {
    submission: Submission | null;
    task: {
        id: string;
        lifecycle: string;
        payoutState: string;
        termsVersion: string;
        reservation: Reservation | null;
        submission: Submission | null;
        verdict: Verdict | null;
    };
};
export interface ClaimLookupPort {
    /** Private account-to-reservation binding. Aliases and public labels are never authority. */
    lookup(accountId: string, reservationId: string): Promise<Claim | null>;
}
export interface KernelSubmissionPort {
    read(accountId: string, claim: Claim): Promise<KernelSnapshot>;
    /** Always the same kernel idempotency key and byte-identical immutable payload on retry. */
    submit(accountId: string, claim: Claim, delivery: FrozenDelivery): Promise<void>;
}
export interface SubmissionPersistence {
    load(accountId: string, reservationId: string): Promise<DraftRecord | null>;
    save(draft: Draft, expectedRevision: number, key: string, hash: string): Promise<{
        record: DraftRecord;
        savedRevision: number;
        replayed: boolean;
    }>;
    freeze(accountId: string, reservationId: string, expectedRevision: number, build: (draft: Draft) => FrozenDelivery): Promise<DraftRecord>;
}
export type FailureCode = 'invalid_input' | 'unauthorized' | 'not_found' | 'forbidden' | 'oversize' | 'secret_detected' | 'terms_changed' | 'late_submission' | 'revision_conflict' | 'idempotency_conflict' | 'immutable_submission' | 'foreign_evidence' | 'storage_invalid' | 'temporarily_unavailable' | 'kernel_refused';
export type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: FailureCode;
        message: string;
    };
};
export type SubmissionStatus = {
    reservationId: string;
    taskId: string;
    termsId: string;
    termsVersion: string;
    draftRevision: number | null;
    deliveryState: 'draft' | 'ready' | 'unknown' | 'submitted';
    editable: boolean;
    progress: string;
    nextAction: string;
    authoritative: boolean;
    observedAt: string;
    submission: null | {
        submissionId: string;
        artifactId: string;
        digest: string;
        mediaType: string;
        bytes: number;
        submittedAt: string;
        termsVersion: string;
    };
};
