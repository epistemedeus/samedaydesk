import { reconcilePayout } from "../payout.js";
import type { AcceptInput, AddTermsInput, ClaimInput, Clock, ContributorPrincipal, CreateContributorTokenInput, CreateTaskInput, Obligation, OwnerTaskView, PublicTaskView, RejectInput, Reservation, SubmitInput, Submission, TaskAggregate, TermsDocument, Verdict, VerdictInput } from "../types.js";
import type { EarnedWorkStore, ReplayResult } from "./types.js";
/** Connection death after pg_ctl stop/restart — not a business-rule conflict. */
export declare function isTransientPgError(error: unknown): boolean;
export type DurableWriteKind = "commit" | "autocommit";
export type PostgresStoreOptions = {
    schema?: string;
    poolMax?: number;
    clock?: Clock;
    /**
     * Test-only driver-boundary hook. Invoked after Postgres has accepted the write.
     * Throw a transient error to simulate ACK/response loss. This is not a network proxy.
     */
    afterDurableWrite?: (event: {
        kind: DurableWriteKind;
    }) => void;
};
export declare class PostgresStore implements EarnedWorkStore {
    readonly kind: "postgres";
    readonly schema: string;
    private readonly schemaIdent;
    private readonly pool;
    private readonly clock;
    private readonly afterDurableWrite?;
    constructor(databaseUrl: string, options?: PostgresStoreOptions);
    now(): Date;
    private bindClientErrors;
    private destroyClient;
    private withTransientRetry;
    private noteDurableWrite;
    /** Connection acquisition only. Dead clients are destroyed and the connect is retried. */
    private connectScoped;
    /** Read path. Mutating SQL must not use this — a retry would replay the write. */
    private query;
    /**
     * Unfenced mutation (no durable idempotency). Retry connect, never replay the write
     * after a possible commit — ACK loss stays unknown rather than unique-violation remint.
     */
    private executeUnfenced;
    /**
     * `idempotent`: load/save idempotency in the same TX — retry after COMMIT-uncertain is replay.
     * `read`: SELECT plus idempotent expire. `none`: never replay the callback after a possible COMMIT.
     */
    private withTx;
    migrate(): Promise<void>;
    checkReady(): Promise<void>;
    close(): Promise<void>;
    private loadIdempotency;
    private saveIdempotency;
    private appendEvent;
    private lockTask;
    private loadTerms;
    private expireStale;
    private occupyingReservations;
    private committedRewardTotal;
    private loadAggregateWithClient;
    private ownerView;
    findContributorByTokenHash(tokenHash: string): Promise<ContributorPrincipal | null>;
    createContributorToken(input: CreateContributorTokenInput): Promise<{
        id: string;
        publicId: string;
        expiresAt: string | null;
        provenance: string;
    }>;
    createTask(input: CreateTaskInput): Promise<ReplayResult<{
        task: OwnerTaskView;
    }>>;
    addTerms(input: AddTermsInput): Promise<ReplayResult<{
        task: OwnerTaskView;
    }>>;
    reserveFunding(taskId: string, idempotencyKey: string, requestHash: string): Promise<ReplayResult<{
        task: OwnerTaskView;
    }>>;
    claim(input: ClaimInput): Promise<ReplayResult<{
        reservation: Reservation;
        task: OwnerTaskView;
    }>>;
    submit(input: SubmitInput): Promise<ReplayResult<{
        submission: Submission;
        task: OwnerTaskView;
    }>>;
    createVerdict(input: VerdictInput): Promise<ReplayResult<{
        verdict: Verdict;
        task: OwnerTaskView;
    }>>;
    accept(input: AcceptInput): Promise<ReplayResult<{
        obligation: Obligation;
        task: OwnerTaskView;
    }>>;
    reject(input: RejectInput): Promise<ReplayResult<{
        task: OwnerTaskView;
    }>>;
    getTermsDocument(taskId: string, termsVersion: string): Promise<{
        termsVersion: string;
        termsDocument: TermsDocument;
    } | null>;
    getTask(taskId: string): Promise<TaskAggregate | null>;
    listOpenTasks(): Promise<PublicTaskView[]>;
    getObligation(taskId: string): Promise<Obligation | null>;
    getContributorObligationReadback(taskId: string, contributor: ContributorPrincipal): Promise<{
        readback: "none" | "owed";
        obligation: Obligation | null;
    }>;
    getPayout(taskId: string): Promise<{
        taskId: string;
        payoutState: string;
        obligationId: string | null;
        reservationId: string | null;
        contributorPublicId: string | null;
        payoutDestination: string | null;
        termsVersion: string | null;
        reconciliation: ReturnType<typeof reconcilePayout>;
    }>;
}
/**
 * Boot always migrate()s: CREATE SCHEMA + DDL. The DATABASE_URL login must be
 * the dedicated app/schema owner used on every start and restart. A DML-only
 * runtime role is not a working kernel path.
 */
export declare function createPostgresStore(databaseUrl: string, options?: PostgresStoreOptions): Promise<PostgresStore>;
