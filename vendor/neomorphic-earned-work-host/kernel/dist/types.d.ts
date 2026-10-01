export declare const PROVENANCES: readonly ["test", "fixture", "production"];
export type Provenance = (typeof PROVENANCES)[number];
export declare const FUNDING_STATES: readonly ["unfunded", "reserved", "released"];
export type FundingState = (typeof FUNDING_STATES)[number];
export declare const PAYOUT_STATES: readonly ["none", "owed", "queued", "submitted", "confirmed", "failed", "unknown"];
export type PayoutState = (typeof PAYOUT_STATES)[number];
export declare const LIFECYCLES: readonly ["open", "claimed", "submitted", "verified", "accepted", "rejected"];
export type Lifecycle = (typeof LIFECYCLES)[number];
export declare const RESERVATION_STATES: readonly ["active", "submitted", "expired", "released", "completed"];
export type ReservationStatus = (typeof RESERVATION_STATES)[number];
export declare const VERDICT_OUTCOMES: readonly ["pass", "fail", "needs_review"];
export type VerdictOutcome = (typeof VERDICT_OUTCOMES)[number];
export declare const EVENT_KINDS: readonly ["discovery", "claim", "submit", "verdict", "accept", "pay", "repeat", "reject", "terms", "funding_reserve"];
export type EventKind = (typeof EVENT_KINDS)[number];
export type Clock = () => Date;
export type Reward = {
    amount: string;
    asset: string;
    network: string;
};
export type Artifact = {
    ref: string;
    digestSha256: string;
    mediaType: string;
    bytes: number;
};
export type Terms = {
    version: string;
    schemaVersion: number;
    termsRevision: number;
    summary: string;
    reward: Reward;
    claimTtlSeconds: number;
    maxArtifactBytes: number;
    allowedMediaTypes: string[];
    slotLimit: number;
    createdAt: string;
};
export type Reservation = {
    id: string;
    taskId: string;
    termsVersion: string;
    contributorPublicId: string;
    status: ReservationStatus;
    expiresAt: string;
    createdAt: string;
};
export type Submission = {
    id: string;
    taskId: string;
    reservationId: string;
    termsVersion: string;
    artifact: Artifact;
    createdAt: string;
};
export type Verdict = {
    id: string;
    taskId: string;
    reservationId: string;
    submissionId: string;
    termsVersion: string;
    artifactDigestSha256: string;
    verifierVersion: string;
    outcome: VerdictOutcome;
    reasons: string[];
    ordinal: number;
    createdAt: string;
};
export type Obligation = {
    id: string;
    kind: "owed_record";
    adapter: string;
    taskId: string;
    reservationId: string;
    submissionId: string;
    contributorPublicId: string;
    payoutDestination: string | null;
    reward: Reward;
    payoutState: "owed";
    termsVersion: string;
    idempotencyKey: string;
    verdictId: string;
    transfer: null;
    note: string;
    createdAt: string;
};
export type EventRecord = {
    id: string;
    taskId: string;
    sequence: number;
    kind: EventKind;
    payload: Record<string, unknown>;
    createdAt: string;
};
export type ContributorPrincipal = {
    id: string;
    publicId: string;
    payoutDestination: string | null;
    taskScope: string | null;
    provenance: Provenance;
    expiresAt: string | null;
};
export type CorrectionPolicy = {
    maxRevisions: number;
};
export type TaskRecord = {
    id: string;
    title: string;
    summary: string;
    provenance: Provenance;
    lifecycle: Lifecycle;
    fundingState: FundingState;
    payoutState: PayoutState;
    currentTermsVersion: string;
    termsRevision: number;
    schemaVersion: number;
    correctionMaxRevisions: number;
    budget: Reward;
    createdAt: string;
    updatedAt: string;
};
export type TaskAggregate = {
    task: TaskRecord;
    terms: Terms;
    reservation: Reservation | null;
    submission: Submission | null;
    /** Received reproduction bytes, never serialized on public/owner JSON. */
    submissionEvidenceBytes: Buffer | null;
    verdict: Verdict | null;
    obligation: Obligation | null;
};
export type TermsDocument = {
    schema: string;
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
export type PublicTaskView = {
    id: string;
    title: string;
    summary: string;
    provenance: Provenance;
    lifecycle: Lifecycle;
    fundingState: FundingState;
    termsVersion: string;
    termsDocument: TermsDocument;
    reward: Reward;
    constraints: {
        claimTtlSeconds: number;
        maxArtifactBytes: number;
        allowedMediaTypes: string[];
        slotLimit: number;
        correctionMaxRevisions: number;
    };
    claimable: boolean;
    workability?: import("./work-gate.js").WorkabilityView;
    createdAt: string;
    updatedAt: string;
};
export type OwnerTaskView = {
    id: string;
    title: string;
    summary: string;
    provenance: Provenance;
    lifecycle: Lifecycle;
    fundingState: FundingState;
    payoutState: PayoutState;
    termsVersion: string;
    termsDocument: TermsDocument;
    terms: Terms;
    reward: Reward;
    budget: Reward;
    correctionPolicy: CorrectionPolicy;
    acceptance: {
        requiresPassVerdict: true;
    };
    reservation: Reservation | null;
    submission: Submission | null;
    verdict: Verdict | null;
    workability?: import("./work-gate.js").WorkabilityView;
    createdAt: string;
    updatedAt: string;
};
export type CreateTaskInput = {
    title: string;
    summary: string;
    provenance: Provenance;
    budget: Reward;
    correctionMaxRevisions: number;
    terms: {
        summary: string;
        reward: Reward;
        claimTtlSeconds: number;
        maxArtifactBytes: number;
        allowedMediaTypes: string[];
        slotLimit: number;
    };
    idempotencyKey: string;
    requestHash: string;
};
export type AddTermsInput = {
    taskId: string;
    summary: string;
    reward: Reward;
    claimTtlSeconds: number;
    maxArtifactBytes: number;
    allowedMediaTypes: string[];
    slotLimit: number;
    idempotencyKey: string;
    requestHash: string;
};
export type CreateContributorTokenInput = {
    publicId: string;
    payoutDestination: string | null;
    taskScope: string | null;
    provenance: Provenance;
    tokenHash: string;
    expiresAt: string | null;
};
export type ClaimInput = {
    taskId: string;
    termsVersion: string;
    contributor: ContributorPrincipal;
    idempotencyKey: string;
    requestHash: string;
};
export type SubmitInput = {
    taskId: string;
    reservationId: string;
    contributor: ContributorPrincipal;
    artifact: Artifact;
    evidenceBytes?: Buffer | null;
    idempotencyKey: string;
    requestHash: string;
};
export type VerdictInput = {
    taskId: string;
    reservationId: string;
    outcome: VerdictOutcome;
    verifierVersion: string;
    reasons: string[];
    artifactDigestSha256?: string;
    idempotencyKey: string;
    requestHash: string;
};
export type AcceptInput = {
    taskId: string;
    reservationId: string;
    artifactDigestSha256?: string;
    verdictId?: string;
    idempotencyKey: string;
    requestHash: string;
};
export type RejectInput = {
    taskId: string;
    reservationId: string;
    reason: string;
    idempotencyKey: string;
    requestHash: string;
};
