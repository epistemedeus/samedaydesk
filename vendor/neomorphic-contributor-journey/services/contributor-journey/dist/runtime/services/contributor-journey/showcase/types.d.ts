import type { TaskAggregate } from "../../earned-work/src/types.js";
export declare const CONSENT_VERSION: "showcase-publication-v1";
export declare const VERIFIER_VERSION: "showcase-join-v1";
export type AuthenticatedAccount = {
    accountId: string;
    sessionId: string;
    authTime: string;
    expiresAt: string;
};
/** Private directory entry. The account binding must come from a principal FK, never an alias. */
export type WorkBinding = {
    workId: string;
    accountId: string;
    profileId: string;
    contributorPrincipalId: string;
    contributorPublicId: string;
    taskId: string;
    reservationId: string;
    submissionId: string;
    obligationId: string;
    verdictId: string;
    termsVersion: string;
    artifactDigestSha256: string;
    authorizedSourceSha256: string | null;
    authorizedDestinationSha256: string | null;
    evidenceClass: "sponsored" | "requester_paid" | "owner_qa" | "unclassified";
};
export type ClaimPrincipal = {
    taskId: string;
    reservationId: string;
    contributorPrincipalId: string;
    contributorPublicId: string;
    provenance: "fixture" | "test" | "production";
};
export interface ClaimPrincipalPort {
    /** Read the reservation's original credential FK. Expiry/revocation cannot erase earned ownership. */
    read(taskId: string, reservationId: string): Promise<ClaimPrincipal | null>;
}
export type WorkEvidence = {
    authorityFamily?: 'kernel' | 'opportunity';
    /** Private current canonical receiving revision; never serialized publicly. */
    canonicalRevision?: string;
    binding: WorkBinding;
    aggregate: TaskAggregate;
    claimPrincipal: ClaimPrincipal;
};
export interface WorkEvidencePort {
    read(workId: string): Promise<WorkEvidence | null>;
}
export interface WorkBindingPort {
    read(workId: string): Promise<WorkBinding | null>;
}
export type WorkIdentity = Pick<WorkBinding, "workId" | "taskId" | "reservationId" | "submissionId" | "obligationId" | "verdictId" | "termsVersion" | "artifactDigestSha256">;
/** Read from the canonical registry, not opportunity paid flags or a user receipt upload. */
export type SettlementBinding = WorkIdentity & {
    transactionHash: string;
    blockNumber: number;
    blockHash: string;
    logIndex: number;
    timestamp: string;
    sourceSha256: string;
    destinationSha256: string;
};
export interface CanonicalSettlementRegistry {
    readForObligation(obligationId: string): Promise<SettlementBinding | null>;
    /** All bindings for this receipt, including other works. Exactly one is required. */
    readReceiptBindings(transactionHash: string, logIndex: number): Promise<SettlementBinding[]>;
}
export interface BaseReceiptObserver {
    readonly source: "configured_base_rpc" | "synthetic_fixture";
    observe(transactionHash: string, reservationId: string): Promise<unknown>;
}
export type PaidQualification = {
    qualified: true;
    source: BaseReceiptObserver["source"];
} | {
    qualified: false;
    reason: "missing_settlement" | "invalid_join" | "duplicate_receipt" | "unavailable" | "invalid_receipt" | "wrong_counterparty" | "amount_mismatch" | "fixture_refused";
};
export interface QualifiedSettlementPort {
    qualify(work: WorkEvidence): Promise<PaidQualification>;
}
export type ApprovedSummary = WorkIdentity & {
    accountId: string;
    profileId: string;
    approvalId: string;
    approvalSource: "requester_review";
    approvedAt: string;
    summary: string;
    evidenceDescription: string;
};
export interface ApprovedSummaryPort {
    /** Null includes withdrawn or unapproved content. This is a server-controlled read port. */
    read(workId: string): Promise<ApprovedSummary | null>;
}
export type ProfilePublication = {
    profileId: string;
    accountId: string;
    displayName: string;
    visible: boolean;
    consentVersion: number;
};
export interface ProfilePublicationPort {
    read(profileId: string): Promise<ProfilePublication | null>;
}
export type PublicWorkView = {
    workId: string;
    profileId: string;
    displayName: string;
    summary: string;
    evidenceDescription: string;
    paid: boolean;
    provenance: "production" | "fixture" | "test";
    evidenceClass: WorkBinding["evidenceClass"];
    verification: {
        verifier: "Neomorphic";
        version: typeof VERIFIER_VERSION;
        workSource: "earned_work_kernel" | "opportunity_service";
        settlementSource: "configured_base_rpc" | "synthetic_fixture" | "not_qualified" | "not_disclosed";
        independentVerification: false;
    };
};
/** Stores publication consent only. It has no payment/obligation write capability. */
export type ConsentRecord = {
    workId: string;
    accountId: string;
    profileId: string;
    version: number;
    visibility: "visible" | "withdrawn";
    consentVersion: typeof CONSENT_VERSION;
    summaryDigest: string;
    profileConsentVersion: number;
    includePaidBadge: boolean;
};
export type ConsentOperation = {
    accountId: string;
    workId: string;
    idempotencyKey: string;
    requestHash: string;
    resultVersion: number;
};
export type ConsentWrite = {
    record: ConsentRecord;
    expectedVersion: number;
    idempotencyKey: string;
    requestHash: string;
};
export type ConsentStoreResult = {
    kind: "applied" | "replayed";
    operation: ConsentOperation;
} | {
    kind: "conflict";
} | {
    kind: "idempotency_conflict";
} | {
    kind: "forbidden";
};
export interface ConsentedSummaryStore {
    read(workId: string): Promise<ConsentRecord | null>;
    /** One authoritative snapshot for a list's final withdrawal/version fence. At most 50 IDs. */
    readMany(workIds: string[]): Promise<ConsentRecord[]>;
    apply(write: ConsentWrite): Promise<ConsentStoreResult>;
    readOperation(accountId: string, workId: string, idempotencyKey: string): Promise<ConsentOperation | null>;
    listVisibleWorkIds(limit: number): Promise<string[]>;
}
export type PublishInput = {
    expectedVersion: number;
    summaryDigest: string;
    consentVersion: typeof CONSENT_VERSION;
    publicationConsent: true;
    includePaidBadge: boolean;
};
export type WithdrawInput = {
    expectedVersion: number;
};
export type FailureCode = "disabled" | "unauthenticated" | "not_found" | "invalid_input" | "not_accepted" | "content_unavailable" | "profile_not_visible" | "stale_consent" | "conflict" | "idempotency_conflict" | "unavailable" | "unknown_outcome";
export type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    code: FailureCode;
};
export type ConsentReadback = {
    version: number;
    visibility: "private" | ConsentRecord["visibility"];
    includePaidBadge: boolean;
};
export type WriteReadback = {
    replayed: boolean;
    recovered: boolean;
    operationVersion: number;
    current: ConsentReadback;
};
export type OwnerPreview = {
    consent: ConsentReadback;
    summaryDigest: string;
    consentVersion: typeof CONSENT_VERSION;
    candidate: PublicWorkView;
    publicationCurrent: boolean;
};
