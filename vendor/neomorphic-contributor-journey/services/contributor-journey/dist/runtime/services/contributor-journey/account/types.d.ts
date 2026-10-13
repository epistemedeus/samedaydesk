import type pg from "pg";
import type { ContributorPrincipal, CreateContributorTokenInput, TaskAggregate, Provenance } from "../../earned-work/src/types.js";
export type AuthenticatedAccount = {
    accountId: string;
    sessionId: string;
    authTime: string;
    expiresAt: string;
    publicProfileId: string;
};
export type AccountErrorCode = "disabled" | "invalid_input" | "unauthorized" | "not_found" | "conflict" | "rate_limited" | "unavailable" | "forbidden";
export type AccountResult<T> = {
    ok: true;
    value: T;
    replayed: boolean;
} | {
    ok: false;
    error: {
        code: AccountErrorCode;
        status: number;
        message: string;
    };
};
export type SessionReceipt = {
    account: AuthenticatedAccount;
    sessionToken: string;
    /** Returned only by signup/recovery. Save privately; never a public profile field. */
    recoveryCode?: string;
};
export type OperationKind = "signup" | "login" | "recover";
export type OperationProof = {
    idempotencyKey: string;
    proof: string;
};
/** Supplied by the server/controller, never taken from request JSON or forwarded headers. */
export type RequestContext = {
    clientAddress: string;
};
/** The existing PostgresStore implements this port, including fenced transaction retries. */
export interface AccountDatabasePort {
    now(): Date;
    withOpportunityClient<T>(fn: (client: pg.PoolClient) => Promise<T>, recover: "idempotent" | "read" | "none"): Promise<T>;
}
export interface AccountKernelPort {
    findContributorByTokenHash(hash: string): Promise<ContributorPrincipal | null>;
    createContributorToken(input: CreateContributorTokenInput): Promise<{
        id: string;
        publicId: string;
        expiresAt: string | null;
        provenance: string;
    }>;
    getTask(taskId: string): Promise<TaskAggregate | null>;
}
export type AccountServiceOptions = {
    database: AccountDatabasePort;
    kernel: AccountKernelPort;
    /** Stable, dedicated 32-byte staging key. Never substitute the existing owner/issuer secret. */
    replayKey: Uint8Array;
    enabled?: boolean;
    sessionTtlSeconds?: number;
    freshAuthSeconds?: number;
    allowedKernelProvenance?: ReadonlyArray<Provenance>;
};
