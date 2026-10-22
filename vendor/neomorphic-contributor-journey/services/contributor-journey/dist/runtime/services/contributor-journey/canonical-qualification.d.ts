import type { BaseReceiptObserver, PaidQualification, SettlementBinding, WorkBinding, WorkEvidence, WorkIdentity } from './showcase/types.js';
/** Selected by the receiving owner, never by a browser, a paid counter or a receipt upload.
 * The reader must read the existing task family's exclusive acceptance/allocation
 * authority on each call. This adapter has no storage or settlement write port. */
export type CanonicalSourcePin = {
    family: 'opportunity';
    sourceId: string;
    sourceRevision: string;
    sourceSha256: string;
};
export type CanonicalWorkQuery = WorkIdentity & {
    roundId: string;
    accountId: string;
    requesterAccountId: string;
    contributorPrincipalId: string;
};
export type CanonicalWorkRecord = {
    source: CanonicalSourcePin;
    state: 'accepted';
    work: CanonicalWorkQuery;
    authorizedSourceSha256: string;
    authorizedDestinationSha256: string;
    evidenceClass: WorkBinding['evidenceClass'];
    actorRelation: 'owner_qa' | 'sponsored' | 'recruited' | 'independent' | 'unknown';
    /** Null includes pending, unknown and absent settlement. No paid flag is authority. */
    settlement: SettlementBinding | null;
};
export type CanonicalReceiving = {
    pin: CanonicalSourcePin;
    readAcceptedWork(query: CanonicalWorkQuery): Promise<CanonicalWorkRecord | null>;
    /** All allocations in the owning exclusive registry, including other works.
     * A filtered list for just this claimant is insufficient. */
    readReceiptAllocations(transactionHash: string, logIndex: number): Promise<Array<{
        source: CanonicalSourcePin;
        work: CanonicalWorkQuery;
        settlement: SettlementBinding;
    }>>;
    observer: BaseReceiptObserver;
    allowSynthetic?: boolean;
};
/** Exact canonical222310/223500 receiving invariants: accepted artifact/terms,
 * authorized counterparties, successful exact token/amount transfer and one
 * exclusive allocation. The existing receipt verifier owns chain assessment. */
export declare function createInstalledCanonicalQualification(options: {
    receiving?: CanonicalReceiving;
    query(work: WorkEvidence): Promise<CanonicalWorkQuery | null>;
}): {
    configured: boolean;
    read: (work: WorkEvidence) => Promise<CanonicalWorkRecord | null>;
    qualify: (work: WorkEvidence) => Promise<PaidQualification>;
    identity: (work: WorkEvidence) => WorkIdentity;
    reference(work: WorkEvidence): Promise<{
        result: {
            qualified: false;
            reason: "missing_settlement" | "invalid_join" | "duplicate_receipt" | "unavailable" | "invalid_receipt" | "wrong_counterparty" | "amount_mismatch" | "fixture_refused";
        };
        record: null;
        receiptRef: null;
    } | {
        result: {
            qualified: true;
            source: BaseReceiptObserver["source"];
        };
        record: CanonicalWorkRecord | null;
        receiptRef: string | null;
    }>;
};
export type InstalledCanonicalQualification = ReturnType<typeof createInstalledCanonicalQualification>;
