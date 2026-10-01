import type { Request } from "express";
import type { ServiceConfig } from "./config.js";
import type { EarnedWorkStore } from "./store/types.js";
import type { ContributorPrincipal } from "./types.js";
export type AuthedRequest = Request & {
    contributor?: ContributorPrincipal;
    bearerToken?: string;
};
export declare function readBearer(req: Request): string | undefined;
export declare function requireContributor(req: AuthedRequest, store: EarnedWorkStore): Promise<ContributorPrincipal>;
export declare function createRateLimiter(config: ServiceConfig, maxBuckets?: number, clock?: () => number): (key: string) => void;
