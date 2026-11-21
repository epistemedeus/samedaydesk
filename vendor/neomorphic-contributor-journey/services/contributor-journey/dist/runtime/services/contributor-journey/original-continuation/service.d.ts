import type { ContributorAccountService } from '../account/service.js';
import type { AccountDatabasePort, AuthenticatedAccount } from '../account/types.js';
import { type OriginalRoutePort } from './types.js';
export declare class OriginalContinuationService {
    private readonly options;
    readonly origin: string;
    constructor(options: {
        accounts: ContributorAccountService;
        database: AccountDatabasePort;
        source: OriginalRoutePort;
        origin: string;
        integrityKey: string;
    });
    migrate(): Promise<void>;
    authenticate(sessionToken: string | undefined): Promise<AuthenticatedAccount>;
    private digest;
    private holder;
    /** Lock current session and auth generation so recovery/logout cannot race an authorized send. */
    private guard;
    private link;
    private canonical;
    private receipt;
    createLink(sessionToken: string | undefined, credential: string | undefined, input: unknown, operationKey: unknown): Promise<{
        replayed: boolean;
        linkId: string;
        roundKey: string;
        claimId: string;
        termsVersion: string;
        consentVersion: string;
    }>;
    read(sessionToken: string | undefined, credential: string | undefined, linkId: string): Promise<{
        canonical: {
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
            schema: "neomorphic.original-continuation.canonical.v1";
            roundKey: string;
            claimId: string;
            operation: {
                statusCode: number;
                key: string;
                requestHash: string;
            } | null;
        };
        linkId: string;
        roundKey: string;
        claimId: string;
        termsVersion: string;
        consentVersion: string;
    }>;
    revoke(sessionToken: string | undefined, linkId: string): Promise<{
        revoked: boolean;
    }>;
    private reconcile;
    readOperation(sessionToken: string | undefined, credential: string | undefined, linkId: string, operationKey: string): Promise<{
        operationKey: string;
        state: "unknown" | "confirmed" | "refused";
        canonical: {
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
            schema: "neomorphic.original-continuation.canonical.v1";
            roundKey: string;
            claimId: string;
            operation: {
                statusCode: number;
                key: string;
                requestHash: string;
            } | null;
        };
    }>;
    submit(sessionToken: string | undefined, credential: string | undefined, linkId: string, input: unknown, operationKey: string): Promise<{
        operationKey: string;
        state: "unknown" | "confirmed" | "refused";
        canonical: {
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
            schema: "neomorphic.original-continuation.canonical.v1";
            roundKey: string;
            claimId: string;
            operation: {
                statusCode: number;
                key: string;
                requestHash: string;
            } | null;
        };
    } | {
        operationKey: string;
        state: "unknown";
    } | {
        operationKey: string;
        state: "refused";
    }>;
}
