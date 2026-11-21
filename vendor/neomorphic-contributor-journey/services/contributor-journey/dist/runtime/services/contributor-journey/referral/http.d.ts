import type { ReferralService } from './service.js';
import type { SourceEvent } from './types.js';
export interface ReferralHttpOptions {
    basePath?: string;
    /** Integration verifies allowed Origin + session CSRF, or its scoped machine
     * authorization. This is required and runs before every POST, including preview. */
    authorizeMutation(request: Request): Promise<boolean>;
    /** Bind the immutable arrival to the host's private visitor/session context.
     * Qualified signup/claim callbacks later use this parent, never a body flag. */
    retainArrival?(request: Request, event: SourceEvent): Promise<void>;
}
/** Fetch handler; SDS/Express adaptation belongs to227800. It never sets cookies,
 * broadcasts, accepts proof flags, or exposes private event/operation records. */
export declare function createReferralHttpHandler(service: ReferralService, options: ReferralHttpOptions): (request: Request) => Promise<Response>;
