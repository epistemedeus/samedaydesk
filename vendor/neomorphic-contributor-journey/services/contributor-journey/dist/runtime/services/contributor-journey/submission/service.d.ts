import type { AuthenticatedAccount, ClaimLookupPort, KernelSubmissionPort, Result, SubmissionPersistence, SubmissionStatus } from './types.js';
export declare class SubmissionService {
    private readonly ports;
    constructor(ports: {
        claims: ClaimLookupPort;
        kernel: KernelSubmissionPort;
        persistence: SubmissionPersistence;
        clock?: () => Date;
    });
    private now;
    private result;
    private authenticate;
    private claim;
    private open;
    private bind;
    private observe;
    read(account: AuthenticatedAccount, reservationId: unknown): Promise<Result<{
        draft: import("./types.js").Draft | null;
        status: SubmissionStatus;
    }>>;
    save(account: AuthenticatedAccount, raw: unknown, idempotencyKey: unknown): Promise<Result<{
        draft: import("./types.js").Draft;
        savedRevision: number;
        replayed: boolean;
    }>>;
    submit(account: AuthenticatedAccount, raw: unknown): Promise<Result<SubmissionStatus>>;
}
