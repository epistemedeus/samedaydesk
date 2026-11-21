import { type CanonicalRead, type OriginalRoutePort } from './types.js';
import type { Provenance } from '../../earned-work/src/types.js';
export declare function canonicalOrigin(input: string): string;
export declare function validateCanonical(value: unknown, source: Pick<OriginalRoutePort, 'roundKey' | 'provenance'>, claimId: string, operationKey?: string): CanonicalRead;
/** Exactly one HTTPS attempt per call; no redirects, credential persistence or submit retry. */
export declare function createOriginalRouteClient(options: {
    origin: string;
    roundKey: string;
    provenance: Provenance;
    request?: typeof fetch;
}): OriginalRoutePort;
