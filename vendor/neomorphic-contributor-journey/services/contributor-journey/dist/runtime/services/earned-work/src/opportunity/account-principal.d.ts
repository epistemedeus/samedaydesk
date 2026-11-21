import type { OpportunityKernel } from './service.js';
import type { ContributorPrincipal, Provenance } from '../types.js';
/** Account owner supplies its durable, exclusive account -> round-scoped token ID
 * binding. This adapter reads existing tokens; it never issues or rotates one. */
export declare function createStoredOpportunityPrincipalResolver(kernel: OpportunityKernel, lookupBinding: (accountId: string, roundKey: string) => Promise<string | null>): (accountId: string, roundKey: string, provenance: Provenance) => Promise<ContributorPrincipal | null>;
