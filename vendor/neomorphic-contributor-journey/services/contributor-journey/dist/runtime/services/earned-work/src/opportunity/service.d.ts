import type pg from "pg";
import type { ContributorPrincipal, Provenance } from "../types.js";
import { type HostedDeliveryProjection } from "./hosted.js";
import { createRoundBodySchema, type importBodySchema } from "./validate.js";
import type { z } from "zod";
type RoundBody = z.infer<typeof createRoundBodySchema>;
type ImportBody = z.infer<typeof importBodySchema>;
export type OpportunityKernel = {
    now(): Date;
    withOpportunityClient<T>(fn: (client: pg.PoolClient) => Promise<T>, recover: "idempotent" | "read" | "none"): Promise<T>;
};
export type MediatedReceiptBinding = {
    roundId: string;
    claimId: string;
    termsVersion: string;
    credentialRef: string;
    principalId: string;
    artifactDigestSha256: string;
    artifactBytes: number;
};
export type MediatedReceiptVerifier = (proof: unknown, binding: MediatedReceiptBinding) => {
    receivedAt: string;
    attestedAt: string;
} | null;
export declare class OpportunityService {
    private readonly kernel;
    private readonly hosted;
    private readonly verifyMediatedReceipt?;
    constructor(kernel: OpportunityKernel, hosted?: HostedDeliveryProjection, verifyMediatedReceipt?: MediatedReceiptVerifier | undefined);
    private hostedFor;
    createRound(body: RoundBody, idempotencyKey: string): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    importClaim(roundKey: string, body: ImportBody & {
        scope?: {
            title: string;
            instructions: string;
        };
    }, idempotencyKey: string, token: string, tokenHash: string, kind: "imported_personal" | "owner_assigned"): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    claim(roundKey: string, body: {
        provenance: Provenance;
        offerKey: string;
        termsVersion: string;
        publicLabel: string;
        volunteeredObservation?: {
            placementId: string | null;
            campaignId: string | null;
            sourceId: string | null;
            providerId: string | null;
            query: string | null;
        };
    }, contributor: ContributorPrincipal, idempotencyKey: string, authenticatedEndpoint?: string, options?: {
        requireScopedPrincipal: boolean;
    }): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    submit(roundKey: string, claimId: string, body: {
        provenance: Provenance;
        artifact: {
            ref: string;
            digestSha256: string;
            mediaType: string;
            bytes: number;
        };
        evidence: Record<string, unknown>;
        modelUsage?: string | null;
        contributorActiveMinutes?: number | null;
    }, contributor: ContributorPrincipal, idempotencyKey: string, options?: {
        requireContinuationScope?: boolean;
        preExpiryCorrespondence?: {
            receivedAt: string;
            mediatedReceipt?: unknown;
        };
    }): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    accept(roundKey: string, claimId: string, provenance: Provenance, idempotencyKey: string, requesterActiveMinutes: number | null, expected?: {
        submissionId: string;
        artifactDigestSha256: string;
        termsVersion: string;
    }): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    /** Source-bound requester rejection, on the same opportunity authority. No IOU mutation. */
    rejectSubmission(roundKey: string, claimId: string, provenance: Provenance, idempotencyKey: string, expected: {
        submissionId: string;
        artifactDigestSha256: string;
        termsVersion: string;
    }, reason: string): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    acknowledgeStart(roundKey: string, claimId: string, provenance: Provenance, contributor: ContributorPrincipal, idempotencyKey: string): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    readRound(roundKey: string, provenance: Provenance | null): Promise<{
        schema: string;
        roundKey: string;
        provenance: "test" | "fixture" | "production";
        productionAdmission: boolean;
        status: "open" | "closed";
        termsVersion: string;
        termsDocument: unknown;
        principalCapAtomic: string;
        committedAtomic: string;
        remainingAtomic: string;
        protectedPersonalAtomic: string;
        availableAtomic: string;
        asset: string;
        network: string;
        chainId: number;
        atomicScale: number;
        submissionDeadline: string;
        offers: {
            offerKey: string;
            title: string;
            summary: string;
            slotCount: number;
            occupying: number;
            remainingSlots: number;
            ownerReservedSlots: number;
            pendingOwnerSlots: number;
            unreservedPublicSlots: number;
            publicRemainingSlots: number;
            rewardAtomic: string;
            reward: {
                amount: string;
                atomic: string;
                asset: string;
                network: string;
                chainId: number;
            };
            maxEffortSeconds: number;
            acceptance: string;
            evidenceKind: "discovery_trace" | "workflow_witness";
            publicClaimConfigured: boolean;
            publicClaimable: boolean;
            ownerAssignedOnly: boolean;
            rank: number;
            rewardPromised: boolean;
            reservedForCaller: boolean;
        }[];
        alternatives: {
            funded: boolean;
            paidSlot: boolean;
            rewardPromised: boolean;
            doNotStartWork: boolean;
        }[];
        paid: boolean;
        transfer: null;
        escrowed: boolean;
        revenue: boolean;
        claimAuthority: string;
        doNotStartWork: boolean;
        hostedClaimAutomation: boolean;
        deliveryState: "hosted" | "unconfigured";
        hostedDelivery: HostedDeliveryProjection;
        publicView: boolean;
        note: string;
    }>;
    readClaim(roundKey: string, claimId: string, provenance: Provenance, contributor: ContributorPrincipal | null, owner: boolean, options?: {
        requireScopedPrincipal: boolean;
    }): Promise<{
        hostedDelivery: HostedDeliveryProjection;
        outcome: string;
        created: boolean;
        paid: boolean;
        transfer: null;
        settled: boolean;
        revenue: boolean;
        escrowed: boolean;
        paidSlot: boolean;
        budgetedReservation: boolean;
        rewardPromised: boolean;
        doNotStartWork: boolean;
        claimAuthority: string;
        kernelObligationMinted: boolean;
        hostedClaimAutomation: boolean;
        productionCredential: boolean;
        credentialGrant: string | null;
        tokenReissued: boolean;
        token: string | undefined;
        nextAction: string;
        offerKey: string;
        claim: {
            id: string;
            status: string;
            kind: "imported_personal" | "owner_assigned" | "public_claim";
            publicLabel: string;
            settlementKey: string;
            termsVersion: string;
            rewardAtomic: string;
            reward: {
                amount: string;
                atomic: string;
                asset: string;
                network: string;
                chainId: number;
            };
            deferStart: boolean;
            expiresAt: string;
            assignedScope: unknown;
        };
        note: string;
    } | {
        obligation: {
            id: string;
            kind: string;
            adapter: string;
            payoutState: string;
            settlementKey: string;
            claimId: string;
            termsVersion: string;
            reward: {
                amount: string;
                atomic: string;
                asset: string;
                network: string;
                chainId: number;
            };
            paid: boolean;
            settled: boolean;
            transfer: null;
            revenue: boolean;
            escrowed: boolean;
        };
        hostedDelivery: HostedDeliveryProjection;
        outcome: string;
        created: boolean;
        paid: boolean;
        transfer: null;
        settled: boolean;
        revenue: boolean;
        escrowed: boolean;
        paidSlot: boolean;
        budgetedReservation: boolean;
        rewardPromised: boolean;
        doNotStartWork: boolean;
        claimAuthority: string;
        kernelObligationMinted: boolean;
        hostedClaimAutomation: boolean;
        productionCredential: boolean;
        credentialGrant: string | null;
        tokenReissued: boolean;
        token: string | undefined;
        nextAction: string;
        offerKey: string;
        claim: {
            id: string;
            status: string;
            kind: "imported_personal" | "owner_assigned" | "public_claim";
            publicLabel: string;
            settlementKey: string;
            termsVersion: string;
            rewardAtomic: string;
            reward: {
                amount: string;
                atomic: string;
                asset: string;
                network: string;
                chainId: number;
            };
            deferStart: boolean;
            expiresAt: string;
            assignedScope: unknown;
        };
        note: string;
    }>;
    listClaims(roundKey: string, provenance: Provenance): Promise<{
        roundKey: string;
        provenance: "test" | "fixture" | "production";
        claims: {
            id: string;
            offerKey: string;
            kind: "imported_personal" | "owner_assigned" | "public_claim";
            status: string;
            publicLabel: string;
            settlementKey: string;
            rewardAtomic: string;
            deferStart: boolean;
            expiresAt: string;
            termsVersion: string;
        }[];
    }>;
    /** Private future-round recovery. Never creates a reservation or repeats a write. */
    readClaimOperation(roundKey: string, provenance: Provenance, contributor: ContributorPrincipal, action: "claim" | "waitlist", idempotencyKey: string): Promise<{
        statusCode: number;
        body: unknown;
        currentClaim: {
            outcome: string;
            created: boolean;
            paid: boolean;
            transfer: null;
            settled: boolean;
            revenue: boolean;
            escrowed: boolean;
            paidSlot: boolean;
            budgetedReservation: boolean;
            rewardPromised: boolean;
            doNotStartWork: boolean;
            claimAuthority: string;
            kernelObligationMinted: boolean;
            hostedClaimAutomation: boolean;
            productionCredential: boolean;
            credentialGrant: string | null;
            tokenReissued: boolean;
            token: string | undefined;
            nextAction: string;
            offerKey: string;
            claim: {
                id: string;
                status: string;
                kind: "imported_personal" | "owner_assigned" | "public_claim";
                publicLabel: string;
                settlementKey: string;
                termsVersion: string;
                rewardAtomic: string;
                reward: {
                    amount: string;
                    atomic: string;
                    asset: string;
                    network: string;
                    chainId: number;
                };
                deferStart: boolean;
                expiresAt: string;
                assignedScope: unknown;
            };
            note: string;
        } | null;
    } | null>;
    readOwnClaims(roundKey: string, provenance: Provenance, contributor: ContributorPrincipal): Promise<{
        outcome: string;
        created: boolean;
        paid: boolean;
        transfer: null;
        settled: boolean;
        revenue: boolean;
        escrowed: boolean;
        paidSlot: boolean;
        budgetedReservation: boolean;
        rewardPromised: boolean;
        doNotStartWork: boolean;
        claimAuthority: string;
        kernelObligationMinted: boolean;
        hostedClaimAutomation: boolean;
        productionCredential: boolean;
        credentialGrant: string | null;
        tokenReissued: boolean;
        token: string | undefined;
        nextAction: string;
        offerKey: string;
        claim: {
            id: string;
            status: string;
            kind: "imported_personal" | "owner_assigned" | "public_claim";
            publicLabel: string;
            settlementKey: string;
            termsVersion: string;
            rewardAtomic: string;
            reward: {
                amount: string;
                atomic: string;
                asset: string;
                network: string;
                chainId: number;
            };
            deferStart: boolean;
            expiresAt: string;
            assignedScope: unknown;
        };
        note: string;
    }[]>;
    readWaitlist(roundKey: string, provenance: Provenance, contributor: ContributorPrincipal): Promise<{
        id: string;
        reason: string;
        joinedAt: string;
        paidSlot: false;
    } | null>;
    private privateClaimReadback;
    private assertStoredPrincipal;
    cohort(roundKey: string, provenance: Provenance): Promise<{
        roundKey: string;
        provenance: "test" | "fixture" | "production";
        contacted: number;
        delivered: number;
        replied: number;
        claimed: number;
        claimedMeans: string;
        claimedIsHolderConversion: boolean;
        claimedIsExternalActivity: boolean;
        completed: number;
        accepted: number;
        paid: number;
        paidObservations: number;
        usefulLaterConsumers: number;
        sentIsNotDelivery: boolean;
        paidFeedbackIsRevenue: boolean;
        organicAdoption: boolean;
        routeConversion: string;
        agentConversion: string;
        revenue: boolean;
        funnel: {
            schema: string;
            reservations: {
                ownerImportRows: number;
                ownerAssignmentRows: number;
                publicClaimRows: number;
                rows: number;
                uniqueRecipients: number;
                deferredStartRows: number;
            };
            holderOriginated: {
                acknowledgementEvents: number;
                acknowledgementRequests: number;
                uniqueRecipients: number;
                additionalPaidSlots: number;
                ownerIssuanceIncluded: boolean;
                readbackIncluded: boolean;
                verifiedExternalActivity: boolean;
            };
            ownerIssuance: {
                importRequests: number;
                assignmentRequests: number;
                verifiedExternalActivity: boolean;
            };
            submissions: {
                rows: number;
                requests: number;
                uniqueRecipients: number;
            };
            acceptance: {
                rows: number;
                requests: number;
                uniqueRecipients: number;
            };
            owed: {
                rows: number;
                paidRows: number;
                settledRows: number;
                transfer: null;
                revenue: boolean;
            };
            settlement: {
                stage: string;
                observedEvents: number;
                inferredFromOwed: boolean;
                inferredFromAcceptance: boolean;
                obligationPaidRows: number;
            };
            retainedUse: {
                stage: string;
                observedEvents: number;
                inferredFromSubmission: boolean;
                inferredFromAcceptance: boolean;
            };
            observations: {
                email: Record<string, number>;
                http: Record<string, number>;
                operator: Record<string, number>;
                unknown: Record<string, number>;
            };
            external: {
                identity: string;
                delivery: string;
                acquisition: string;
            };
        };
        note: string;
    }>;
    recordCohort(roundKey: string, provenance: Provenance, body: {
        kind: string;
        eventRef: string;
        publicLabel?: string | null;
        activeMinutes?: number | null;
        channel?: "email" | "http" | "operator";
    }, idempotencyKey: string): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    closeRound(roundKey: string, provenance: Provenance, idempotencyKey: string): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    closeNotice(body: {
        campaignKey: string;
        preservedPromise: Record<string, unknown>;
        nextRoundKey?: string | null;
    }, idempotencyKey: string): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    joinWaitlist(roundKey: string, body: {
        provenance: Provenance;
        publicLabel: string;
        reason?: string;
    }, contributor: ContributorPrincipal, idempotencyKey: string, options?: {
        requireScopedPrincipal: boolean;
    }): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    readNotice(campaignKey: string): Promise<{
        campaignKey: string;
        status: string;
        created: boolean;
        preservedPromise: unknown;
        promiseChanged: boolean;
        priorPromisesUnchanged: boolean;
        repriced: boolean;
        doNotStartWork: boolean;
        claimAuthority: string;
        paidSlot: boolean;
        paid: boolean;
        transfer: null;
        continuation: {
            roundKey: string;
            reservedForCaller: boolean;
            rewardPromised: boolean;
            doNotStartWork: boolean;
            claimAuthority: string;
            path: string | null;
            deliveryState: "hosted" | "unconfigured";
            hostedClaimAutomation: boolean;
            publicPaidCapacity: number;
            anonymousSelfRegistration: boolean;
            settlementAutomatic: boolean;
            grantsDelivered: boolean;
        } | null;
        note: string;
    }>;
    recordSource(roundKey: string, claimId: string, provenance: Provenance, body: {
        selfReport: unknown;
        observed: unknown;
    }, contributor: ContributorPrincipal, idempotencyKey: string): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    private route;
    private nextTasks;
    private replayIdentity;
    private insertClaim;
    private ensureCapacity;
    private expireUnlearned;
    private committed;
    private occupyingCount;
    private pendingOwnerSlots;
    private lockRound;
    private resolveRound;
    private requireOffer;
    private findOffer;
    private offerById;
    private offers;
    private lockClaim;
    private credentialForToken;
    private findOccupying;
    private findIdentity;
    private roundView;
    private serverObserved;
    private submissionView;
    private obligationView;
    private appendEvent;
}
export {};
