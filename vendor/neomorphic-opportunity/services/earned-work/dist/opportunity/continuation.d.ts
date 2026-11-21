import type pg from 'pg';
import type { ContributorPrincipal, Provenance } from '../types.js';
import type { PostgresStore } from '../store/postgres.js';
import type { OpportunityService, OpportunityKernel } from './service.js';
export type ContinuationScope = {
    roundKey: string;
    claimId: string;
    provenance: Provenance;
};
/** The original ledger checks CURRENT holder scope inside its transaction, including replays. */
export declare function assertContinuationHolder(client: pg.PoolClient, scope: ContinuationScope, holder: ContributorPrincipal, now: Date): Promise<{
    round: any;
    claim: any;
    offer: any;
    terms: any;
}>;
/** Private canonical projection. It neither imports records nor changes earned obligations. */
export declare function readOriginalContinuation(kernel: OpportunityKernel, scope: ContinuationScope, holder: ContributorPrincipal, operationKey?: string): Promise<{
    claim: {
        id: any;
        termsVersion: any;
        status: any;
        offerKey: any;
        expiresAt: any;
        deferStart: any;
    };
    terms: any;
    submission: {
        id: any;
        claimId: any;
        termsVersion: any;
        artifact: {
            ref: any;
            digestSha256: any;
            mediaType: any;
            bytes: any;
        };
        submittedAt: any;
    } | null;
    obligation: {
        id: any;
        claimId: any;
        termsVersion: any;
        settlementKey: any;
        payoutState: "owed";
        paid: false;
    } | null;
    operation: {
        key: string;
        requestHash: any;
        statusCode: any;
    } | null;
    roundKey: string;
    claimId: string;
    provenance: Provenance;
    schema: "neomorphic.original-continuation.canonical.v1";
}>;
/** Additive holder-only paths at the ORIGINAL route, sharing its exclusive submit/idempotency ledger. */
export declare function mountOriginalContinuationRoutes(app: {
    get: Function;
    post: Function;
}, store: PostgresStore, opportunity: OpportunityService): void;
