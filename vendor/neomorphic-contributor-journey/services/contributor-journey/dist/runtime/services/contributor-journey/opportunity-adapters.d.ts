import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import { OpportunityService } from '../earned-work/src/opportunity/service.js';
import type { ContributorPrincipal, Provenance } from '../earned-work/src/types.js';
import type { CorrespondenceStore } from '../correspondence/src/store/types.js';
import type { ClaimLookupPort, KernelSubmissionPort, SubmissionPersistence } from './submission/types.js';
import type { KernelReviewPort, SourceBinding } from './review/types.js';
import type { ProjectLock } from './discussion/correspondence.js';
type Row = Record<string, any>;
/** Actual opportunity authority with common read DTOs for the received UI/services.
 * No earned_work_tasks/reservations/submissions/obligations are written here. */
export declare function createOpportunityJourneyAdapters(options: {
    store: PostgresStore;
    opportunity: OpportunityService;
    futureRounds: Array<{
        roundKey: string;
        provenance: Provenance;
    }>;
    principal(accountId: string, roundKey: string, provenance: Provenance): Promise<ContributorPrincipal | null>;
    accountForPrincipal(principalId: string): Promise<string | null>;
    persistence: SubmissionPersistence;
    correspondence: CorrespondenceStore;
    decisionProject(source: SourceBinding): Promise<string>;
    integrityKey: string;
    lock: ProjectLock;
}): {
    claims: ClaimLookupPort;
    submission: KernelSubmissionPort;
    review: KernelReviewPort;
    load: (reservationId: string, taskId?: string) => Promise<{
        id: string;
        document: {
            schema: string;
            schemaVersion: number;
            roundKey: string;
            principalCapAtomic: number;
            atomicScale: number;
            asset: string;
            network: string;
            chainId: number;
            submissionDeadline: string;
            claimTtlSeconds: number;
            reviewWithinDays: number;
            maxClarifications: number;
            maxEvidenceBytes: number;
            transferFeeCap: {
                amountAtomic: string;
                asset: string;
                note: string;
            };
            offers: {
                acceptance: string;
                evidenceKind: "discovery_trace" | "workflow_witness";
                maxEffortSeconds: number;
                offerKey: string;
                publicClaimable: boolean;
                rank: number;
                rewardAtomic: number;
                slotCount: number;
                ownerReservedSlots: number;
                summary: string;
                title: string;
            }[];
            alternatives: {
                alternativeKey: string;
                funded: false;
                paidSlot: false;
                rank: number;
                summary: string;
                title: string;
            }[];
            rules: {
                owedIsNotPaid: boolean;
                waitlistIsNotAPaidSlot: boolean;
                unknownIsNotReconstructed: boolean;
                fixtureIsNotProduction: boolean;
                payoutAdapter: string;
                rewardDoesNotDependOnEndorsement: boolean;
                noArtifactFetch: boolean;
            };
        };
        owner: string;
        principal: ContributorPrincipal;
        record: import("./submission/types.js").DraftRecord | null;
        claim: Row;
        round: Row;
        offer: Row;
        submission: Row | null;
        obligation: Row | null;
    } | null>;
};
export {};
