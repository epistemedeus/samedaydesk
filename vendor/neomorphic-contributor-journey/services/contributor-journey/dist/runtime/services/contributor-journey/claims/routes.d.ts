import { type Request } from 'express';
import type { ContributorClaimsService } from './service.js';
/** Mount behind the host's body limit, session auth, CSRF/origin checks and rate
 * limiter. No account/principal/provenance/role is accepted from request data. */
export declare function createContributorClaimsRouter(service: ContributorClaimsService<Request>): import("express-serve-static-core").Router;
