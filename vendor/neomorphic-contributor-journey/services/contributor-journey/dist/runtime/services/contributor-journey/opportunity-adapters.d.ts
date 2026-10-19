import type { RootExternalReceiving } from './external-receiving.js';
import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import { OpportunityService } from '../earned-work/src/opportunity/service.js';
import type { ContributorPrincipal, Provenance, Verdict } from '../earned-work/src/types.js';
import type { CorrespondenceStore } from '../correspondence/src/store/types.js';
import type { EventRecord } from '../correspondence/src/types.js';
import type { ClaimLookupPort, KernelSubmissionPort, SubmissionPersistence } from './submission/types.js';
import type { KernelReviewPort, SourceBinding } from './review/types.js';
import type { ProjectLock } from './discussion/correspondence.js';
type Row = Record<string, any>;
/** Actual opportunity authority with common read DTOs for the received UI/services.
 * No earned_work_tasks/reservations/submissions/obligations are written here. */
export declare function createOpportunityJourneyAdapters(options: {
    external?: RootExternalReceiving;
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
    admitTask?: (taskId: string) => Promise<void>;
}): {
    claims: ClaimLookupPort;
    submission: KernelSubmissionPort;
    review: KernelReviewPort;
    load: (reservationId: string, taskId?: string) => Promise<{
        id: string;
        document: {
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
            receivingPolicy?: "root_mediated_external_report_v1" | undefined;
            schema: string;
            schemaVersion: number;
            roundKey: string;
        };
        owner: string | null;
        principal: ContributorPrincipal;
        record: import("./submission/types.js").DraftRecord | {
            frozen: {
                kind: "delivery";
                delivery: import("./external-receiving.js").ExternalDelivery;
                artifactId: string;
                artifact: {
                    ref: string;
                    digestSha256: string;
                    mediaType: string;
                    bytes: number;
                };
                key: string;
            } & {
                content: string;
            };
        } | null;
        external: {
            assignment: import("./external-receiving.js").ExternalAssignment;
            frozen: ({
                kind: "delivery";
                delivery: import("./external-receiving.js").ExternalDelivery;
                artifactId: string;
                artifact: {
                    ref: string;
                    digestSha256: string;
                    mediaType: string;
                    bytes: number;
                };
                key: string;
            } & {
                content: string;
            }) | null;
        } | null | undefined;
        claim: Row;
        round: Row;
        offer: Row;
        submission: Row | null;
        obligation: Row | null;
    } | null>;
    verdictReceipt: (bound: SourceBinding, key: string) => Promise<{
        event: EventRecord;
        entry: {
            source: SourceBinding;
            kind: "verdict" | "reject";
            outcome?: Verdict["outcome"];
            reason?: string;
            key: string;
            at: string;
            reviewEvidenceRef?: string;
        };
    } | null>;
};
export {};
