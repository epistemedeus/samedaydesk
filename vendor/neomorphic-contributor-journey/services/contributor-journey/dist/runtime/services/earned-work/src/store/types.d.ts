import type { AcceptInput, AddTermsInput, ClaimInput, ContributorPrincipal, CreateContributorTokenInput, CreateTaskInput, Obligation, OwnerTaskView, PublicTaskView, RejectInput, Reservation, SubmitInput, Submission, TaskAggregate, Verdict, VerdictInput } from "../types.js";
import type { PayoutReconciliation } from "../payout.js";
export type ReplayResult<T> = {
    replayed: boolean;
    statusCode: number;
    body: T;
};
export interface EarnedWorkStore {
    readonly kind: "postgres";
    checkReady(): Promise<void>;
    close(): Promise<void>;
    now(): Date;
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
    getTask(taskId: string): Promise<TaskAggregate | null>;
    getTermsDocument(taskId: string, termsVersion: string): Promise<{
        termsVersion: string;
        termsDocument: import("../types.js").TermsDocument;
    } | null>;
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
        reconciliation: PayoutReconciliation;
    }>;
}
