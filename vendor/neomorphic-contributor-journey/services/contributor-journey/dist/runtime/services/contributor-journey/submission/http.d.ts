import { type Request, type Router } from 'express';
import type { AuthenticatedAccount, FailureCode } from './types.js';
import type { SubmissionService } from './service.js';
export declare const HTTP_STATUS: Record<FailureCode, number>;
/** Session and write authorization come from the account service, never from JSON fields. */
export declare function createSubmissionRouter(options: {
    service: SubmissionService;
    resolveAccount(req: Request): Promise<AuthenticatedAccount | null>;
    authorizeWrite(req: Request, account: AuthenticatedAccount): Promise<boolean>;
    enabled?: boolean;
}): Router;
