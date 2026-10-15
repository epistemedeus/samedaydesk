import type { Pool } from 'pg';
import type { EarnedWorkStore } from '../../earned-work/src/store/types.js';
import type { ContributorPrincipal } from '../../earned-work/src/types.js';
import type { Claim, FrozenDelivery, KernelSubmissionPort } from './types.js';
export declare function kernelPayload(delivery: Pick<FrozenDelivery, 'reservationId' | 'artifact' | 'content'>): {
    reservationId: string;
    artifact: import("../../earned-work/src/types.js").Artifact;
    evidenceBase64: string;
};
export declare function createPostgresReservationOwnerCheck(pool: Pool, schema: string): (claim: Claim, contributor: ContributorPrincipal) => Promise<void>;
export declare function createEarnedWorkSubmissionPort(options: {
    store: EarnedWorkStore;
    /** Exact private account/reservation credential binding from account/claims modules. */
    resolvePrincipal(accountId: string, reservationId: string): Promise<ContributorPrincipal>;
    assertReservationOwner(claim: Claim, contributor: ContributorPrincipal): Promise<void>;
}): KernelSubmissionPort;
