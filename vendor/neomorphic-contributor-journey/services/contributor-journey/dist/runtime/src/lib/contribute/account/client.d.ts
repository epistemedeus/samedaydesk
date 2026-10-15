import type { AuthenticatedAccount } from "../../../../services/contributor-journey/account/types.js";
export type BrowserAccountReceipt = {
    account: AuthenticatedAccount;
    recoveryCode?: string;
    sessionDelivery: "cookie";
    replayed: boolean;
};
export type AccountOperation = "signup" | "login" | "recover";
export declare class AccountClientError extends Error {
    readonly unknownOutcome: boolean;
    constructor(message: string, unknownOutcome?: boolean);
}
/** Browser session credentials stay in the server's HttpOnly cookie. Pending proof stays in memory. */
export declare class AccountPreviewClient {
    readonly basePath: string;
    private readonly fetcher;
    private pending?;
    constructor(basePath: string, fetcher?: typeof fetch);
    get hasPendingOperation(): boolean;
    private request;
    private checkedReceipt;
    private readbackBody;
    submit(operation: AccountOperation, input: Record<string, string>): Promise<BrowserAccountReceipt>;
    readback(): Promise<BrowserAccountReceipt>;
    session(): Promise<AuthenticatedAccount | null>;
    logout(allSessions?: boolean): Promise<void>;
}
export declare function initializeAccountPreview(document: Document): void;
