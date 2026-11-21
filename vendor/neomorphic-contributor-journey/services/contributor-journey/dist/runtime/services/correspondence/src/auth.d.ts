import type { Request } from "express";
import type { ServiceConfig } from "./config.js";
import type { CorrespondenceStore } from "./store/types.js";
import type { ActiveGrant } from "./types.js";
export type AuthedRequest = Request & {
    grant?: ActiveGrant;
    bearerToken?: string;
};
export declare function readBearer(req: Request): string | undefined;
export declare function requireGrant(req: AuthedRequest, store: CorrespondenceStore, roles?: Array<ActiveGrant["role"]>): Promise<ActiveGrant>;
export declare function requireProjectAccess(grant: ActiveGrant, projectId: string): void;
export declare function createRateLimiter(config: ServiceConfig, maxBuckets?: number, clock?: () => number): (key: string) => void;
