import type pg from "pg";
import type { ContributorPrincipal, Provenance } from "../types.js";
import { type createRoundBodySchema, type importBodySchema } from "./validate.js";
import type { z } from "zod";
type RoundBody = z.infer<typeof createRoundBodySchema>;
type ImportBody = z.infer<typeof importBodySchema>;
export type OpportunityKernel = {
    now(): Date;
    withOpportunityClient<T>(fn: (client: pg.PoolClient) => Promise<T>, recover: "idempotent" | "read" | "none"): Promise<T>;
};
export declare class OpportunityService {
    private readonly kernel;
    constructor(kernel: OpportunityKernel);
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
    }, contributor: ContributorPrincipal, idempotencyKey: string, authenticatedEndpoint?: string): Promise<{
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
    }, contributor: ContributorPrincipal, idempotencyKey: string): Promise<{
        replayed: boolean;
        statusCode: number;
        body: unknown;
    }>;
    accept(roundKey: string, claimId: string, provenance: Provenance, idempotencyKey: string, requesterActiveMinutes: number | null): Promise<{
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
        deliveryState: string;
        publicView: boolean;
        note: string;
    }>;
    readClaim(roundKey: string, claimId: string, provenance: Provenance, contributor: ContributorPrincipal | null, owner: boolean): Promise<{
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
    cohort(roundKey: string, provenance: Provenance): Promise<{
        roundKey: string;
        provenance: "test" | "fixture" | "production";
        contacted: number;
        delivered: number;
        replied: number;
        claimed: number;
        completed: number;
        accepted: number;
        paid: number;
        paidObservations: number;
        usefulLaterConsumers: number;
        sentIsNotDelivery: boolean;
        paidFeedbackIsRevenue: boolean;
        organicAdoption: boolean;
        routeConversion: string;
        revenue: boolean;
        note: string;
    }>;
    recordCohort(roundKey: string, provenance: Provenance, body: {
        kind: string;
        eventRef: string;
        publicLabel?: string | null;
        activeMinutes?: number | null;
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
    }, contributor: ContributorPrincipal, idempotencyKey: string): Promise<{
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
            path: null;
            deliveryState: string;
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
