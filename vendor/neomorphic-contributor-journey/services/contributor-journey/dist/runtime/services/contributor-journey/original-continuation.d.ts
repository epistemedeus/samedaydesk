import type { JourneyRuntime } from './runtime.js';
import { createOriginalRouteClient } from './original-continuation/client.js';
import { OriginalContinuationService } from './original-continuation/service.js';
import type { Provenance } from '../earned-work/src/types.js';
export declare const ORIGINAL_CONTINUATION_PREFIX = "/api/neomorphic-original-continuation";
export { createOriginalRouteClient, OriginalContinuationService };
export { CONSENT_VERSION, ContinuationError } from './original-continuation/types.js';
export type * from './original-continuation/types.js';
/** Explicit integration API. It uses existing account authentication; adoption/FKs/future-round admission are untouched. */
export declare function createInstalledOriginalContinuation(runtime: JourneyRuntime, options?: {
    enabled?: boolean;
    canonicalOrigin?: string;
    roundKey?: string;
    provenance?: Provenance;
    request?: typeof fetch;
}): Promise<{
    router: import("express-serve-static-core").Router;
    service: null;
} | {
    router: import("express-serve-static-core").Router;
    service: OriginalContinuationService;
}>;
