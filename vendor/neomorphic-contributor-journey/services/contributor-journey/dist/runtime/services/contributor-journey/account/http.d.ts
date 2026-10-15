import express, { type Request, type RequestHandler } from "express";
import type { ContributorAccountService } from "./service.js";
import type { AuthenticatedAccount, SessionReceipt, RequestContext } from "./types.js";
export type AccountAuthedRequest = Request & {
    account?: AuthenticatedAccount;
};
export type AccountRouterOptions = {
    /** Enables same-origin HTTPS preview cookie delivery. Unset means bearer-only agent API. */
    browserOrigin?: string;
    /** Optional trusted host resolver; default is the socket address, never unverified X-Forwarded-For. */
    requestContext?: (req: Request) => RequestContext;
    /** Host observation runs after the durable account operation. It grants no authority. */
    afterReceipt?: (req: Request, receipt: SessionReceipt) => Promise<void>;
};
export declare function readAccountSessionToken(req: Request, allowCookie?: boolean): string | undefined;
/** Leaves private contributor authority out of Request and every browser DTO. */
export declare function requireAuthenticatedAccount(service: ContributorAccountService, options?: AccountRouterOptions): RequestHandler;
export declare function createAccountRouter(service: ContributorAccountService, options?: AccountRouterOptions): express.Router;
