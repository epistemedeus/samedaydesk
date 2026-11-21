export type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    code: FailureCode;
};
export type FailureCode = 'disabled' | 'invalid_input' | 'unauthenticated' | 'forbidden' | 'source_unavailable' | 'source_changed' | 'private_projection' | 'consent_required' | 'preview_changed' | 'not_found' | 'revoked' | 'expired' | 'conflict' | 'idempotency_conflict' | 'storage_unavailable' | 'write_unknown' | 'would_widen' | 'observation_required' | 'evidence_required' | 'capacity';
export type SourceKind = 'showcase' | 'discussion';
export type ShareField = 'summary' | 'evidence';
export type NextAction = 'browse_tasks' | 'signup' | 'discussion';
export type Stage = 'declared_source' | 'observed_link_arrival' | 'qualified_signup' | 'claim' | 'repeat';
export type Cohort = 'owner_qa' | 'sponsored' | 'independent' | 'unknown';
export type Relation = 'self' | 'distinct' | 'unknown';
export interface AuthenticatedAccount {
    accountId: string;
    sessionId: string;
    authTime: string;
    expiresAt: string;
}
/** Private, authoritative read port. The owner verifies the exact accepted work
 * and publication consent before returning published. Forum text is never proof. */
export interface PublishedSource {
    kind: SourceKind;
    sourceId: string;
    version: string;
    ownerAccountId: string;
    workRef: string;
    artifactDigest: string;
    acceptanceRef: string;
    consentVersion: string;
    publicationExpiresAt: string;
    title: string;
    summary: string;
    evidence: string | null;
}
export type SourceRead = {
    state: 'published';
    source: PublishedSource;
} | {
    state: 'withdrawn' | 'unavailable';
};
export interface ShareSelection {
    source: {
        kind: SourceKind;
        id: string;
    };
    fields: ShareField[];
    nextAction: NextAction;
    expiresAt: string;
}
export interface SharePreview {
    title: string;
    summary: string | null;
    evidence: string | null;
    fields: ShareField[];
    nextAction: NextAction;
    expiresAt: string;
    previewDigest: string;
}
export interface ShareRecord extends ShareSelection {
    shareRef: string;
    ownerAccountId: string;
    sourceVersion: string;
    sourceBindingDigest: string;
    revision: number;
    state: 'active' | 'withdrawn';
    createdAt: string;
    updatedAt: string;
    /** Private reference from the authoritative published source; never public JSON. */
    acceptedWorkRef?: string;
}
export interface ShareOperation {
    accountId: string;
    operationKey: string;
    bodyDigest: string;
    shareRef: string;
    revision: number;
}
/** Integration must implement atomic CAS + unique(accountId, operationKey) and
 * unique(shareRef). This is a module persistence port, not an alternate ledger. */
export interface ReferralRepository {
    readShare(shareRef: string): Promise<ShareRecord | null>;
    readOperation(accountId: string, operationKey: string): Promise<ShareOperation | null>;
    commitShare(input: {
        expectedRevision: number | null;
        record: ShareRecord;
        operation: ShareOperation;
    }): Promise<'committed' | 'conflict' | 'idempotency_conflict'>;
}
export interface PublicShare {
    shareRef: string;
    revision: number;
    title: string;
    summary: string | null;
    evidence: string | null;
    expiresAt: string;
    nextAction: NextAction;
    nextPath: string;
    url: string;
}
export interface OwnShare {
    shareRef: string;
    revision: number;
    state: 'active' | 'withdrawn';
    fields: ShareField[];
    expiresAt: string;
    nextAction: NextAction;
    public: PublicShare | null;
}
/** Server-issued continuity and request references, never a body or query ID. */
export interface VisitorObservation {
    visitorRef: string;
    accountId: string | null;
    requestRef: string;
}
export interface SourceEvent {
    eventId: string;
    bodyDigest: string;
    stage: Stage;
    occurredAt: string;
    visitorRef: string;
    accountId: string | null;
    referrerAccountId: string | null;
    shareRef: string | null;
    shareRevision: number | null;
    sourceType: 'declared' | 'observed_link';
    declaredChannel: 'shared_link' | 'listing' | 'other' | 'unknown' | null;
    nextAction: NextAction | null;
    parentEventId: string | null;
    evidenceRef: string | null;
    cohort: Cohort;
    relation: Relation;
}
/** Bounded append-only sink: atomic unique eventId, immutable payload, readback.
 * Private events are consumed by measurement227900, never sent to public clients. */
export interface SourceEventSink {
    read(eventId: string): Promise<SourceEvent | null>;
    append(event: SourceEvent): Promise<'stored' | 'duplicate' | 'conflict' | 'capacity'>;
}
export interface MilestoneEvidence {
    stage: 'qualified_signup' | 'claim' | 'repeat';
    evidenceRef: string;
    accountId: string;
    visitorRef: string;
    occurredAt: string;
    qualificationVersion: string;
    acceptedWorkRefs: string[];
}
export interface ReferralPorts {
    resolveAccount(context: unknown): Promise<AuthenticatedAccount | null>;
    readPublishedSource(source: ShareSelection['source']): Promise<SourceRead>;
    repository: ReferralRepository;
    events: SourceEventSink;
    resolveVisitor(context: unknown): Promise<VisitorObservation | null>;
    classify(input: {
        visitorRef: string;
        accountId: string | null;
        referrerAccountId: string | null;
    }): Promise<{
        cohort: Cohort;
        relation: Relation;
    }>;
    readMilestone(stage: MilestoneEvidence['stage'], evidenceRef: string): Promise<MilestoneEvidence | null>;
}
export interface ReferralConfig {
    /** Same-origin receiving page, explicitly supplied by the installed host. */
    sharePath?: string;
    /** Defaults to false; only staging composition should enable before review. */
    enabled?: boolean;
    publicOrigin: string;
    clock?: () => string;
}
