import type { ClaimsOptions, Result, TaskView, ExactTerms, ClaimView, ClaimOutcome, WaitlistView, OperationReadback } from './types.js';
export declare class ContributorClaimsService<Context> {
    private readonly options;
    private readonly rounds;
    private readonly now;
    constructor(options: ClaimsOptions<Context>);
    list(context: Context): Promise<Result<{
        accountId: string;
        tasks: TaskView[];
    }>>;
    terms(context: Context, input: unknown): Promise<Result<ExactTerms>>;
    claim(context: Context, input: unknown, operationKey: unknown): Promise<Result<ClaimOutcome>>;
    lookupClaim(context: Context, input: unknown): Promise<Result<ClaimView>>;
    mine(context: Context): Promise<Result<{
        claims: ClaimView[];
    }>>;
    joinWaitlist(context: Context, input: unknown, operationKey: unknown): Promise<Result<WaitlistView>>;
    waitlist(context: Context, input: unknown): Promise<Result<WaitlistView>>;
    readOperation(context: Context, input: unknown): Promise<Result<OperationReadback>>;
    private account;
    private config;
    private termsId;
    private operationKey;
    private principal;
    private checkPrincipal;
    private tasks;
    private claimView;
    private claimOutcome;
    private waitlistView;
    private mutation;
    private run;
}
export declare function createContributorClaimsService<Context>(options: ClaimsOptions<Context>): ContributorClaimsService<Context>;
