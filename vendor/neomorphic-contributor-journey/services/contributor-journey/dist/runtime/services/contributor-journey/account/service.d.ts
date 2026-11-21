import type { ContributorPrincipal } from "../../earned-work/src/types.js";
import type { AccountDatabasePort, AccountResult, AccountServiceOptions, AuthenticatedAccount, RequestContext, SessionReceipt } from "./types.js";
export declare function migrateContributorAccounts(database: AccountDatabasePort): Promise<void>;
export declare class ContributorAccountService {
    private readonly options;
    private readonly database;
    private readonly cipher;
    private readonly ttl;
    private readonly fresh;
    private readonly allowed;
    constructor(options: AccountServiceOptions);
    private enabled;
    private result;
    private limit;
    private operationContext;
    private session;
    private accountFromSession;
    private authenticated;
    private savedReceipt;
    private sessionOperation;
    signup(input: unknown, operationProof: unknown, context: RequestContext): Promise<AccountResult<SessionReceipt>>;
    login(input: unknown, operationProof: unknown, context: RequestContext): Promise<AccountResult<SessionReceipt>>;
    recover(input: unknown, operationProof: unknown, context: RequestContext): Promise<AccountResult<SessionReceipt>>;
    readback(input: unknown, operationProof: unknown, context: RequestContext): Promise<AccountResult<SessionReceipt>>;
    authenticate(sessionToken: unknown): Promise<AccountResult<AuthenticatedAccount>>;
    logout(sessionToken: unknown, allSessions?: boolean): Promise<AccountResult<{
        revoked: true;
    }>>;
    private requireFresh;
    private bindingScope;
    private assertBinding;
    private checkLiveKernelProof;
    /** Server-only result. Never serialize this principal or expose a kernel bearer to the browser. */
    resolveKernelPrincipal(sessionToken: unknown, requestedKernelScope: unknown): Promise<AccountResult<{
        account: AuthenticatedAccount;
        principal: ContributorPrincipal;
    }>>;
    /** Possession of a live task-scoped kernel bearer is required; alias/email cannot adopt. */
    adoptKernelPrincipal(sessionToken: unknown, input: unknown): Promise<AccountResult<{
        bound: true;
    }>>;
}
