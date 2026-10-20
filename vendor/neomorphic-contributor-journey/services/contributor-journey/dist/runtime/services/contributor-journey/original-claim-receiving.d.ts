import { z } from 'zod';
import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import type { ContributorPrincipal } from '../earned-work/src/types.js';
import type { CorrespondenceStore } from '../correspondence/src/store/types.js';
import { OpportunityService } from '../earned-work/src/opportunity/service.js';
import type { ContributorAccountService } from './account/service.js';
import type { JourneyAdmission } from './profile.js';
import type { ProjectLock } from './discussion/correspondence.js';
export declare const originalReportSchema: z.ZodObject<{
    schema: z.ZodLiteral<"pilot.cold-first-use-report.v1">;
    observedStatus: z.ZodEnum<["completed", "refused", "failed", "unresolved"]>;
    runtimeVersion: z.ZodString;
    acquisitionUrl: z.ZodString;
    commands: z.ZodArray<z.ZodString, "many">;
    usefulResult: z.ZodOptional<z.ZodString>;
    reproducibleFailure: z.ZodOptional<z.ZodString>;
    effortSeconds: z.ZodOptional<z.ZodNumber>;
    clarifications: z.ZodOptional<z.ZodNumber>;
    tokenUse: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"unknown">, z.ZodNull, z.ZodNumber]>>;
    cost: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"unknown">, z.ZodNull, z.ZodObject<{
        amount: z.ZodString;
        currency: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        amount: string;
        currency: string;
    }, {
        amount: string;
        currency: string;
    }>]>>;
}, "strict", z.ZodTypeAny, {
    schema: "pilot.cold-first-use-report.v1";
    observedStatus: "failed" | "completed" | "refused" | "unresolved";
    runtimeVersion: string;
    acquisitionUrl: string;
    commands: string[];
    usefulResult?: string | undefined;
    reproducibleFailure?: string | undefined;
    effortSeconds?: number | undefined;
    clarifications?: number | undefined;
    tokenUse?: number | "unknown" | null | undefined;
    cost?: "unknown" | {
        amount: string;
        currency: string;
    } | null | undefined;
}, {
    schema: "pilot.cold-first-use-report.v1";
    observedStatus: "failed" | "completed" | "refused" | "unresolved";
    runtimeVersion: string;
    acquisitionUrl: string;
    commands: string[];
    usefulResult?: string | undefined;
    reproducibleFailure?: string | undefined;
    effortSeconds?: number | undefined;
    clarifications?: number | undefined;
    tokenUse?: number | "unknown" | null | undefined;
    cost?: "unknown" | {
        amount: string;
        currency: string;
    } | null | undefined;
}>;
declare const deliveryPin: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.root-original-claim-delivery.v1">;
    accountId: z.ZodString;
    claimId: z.ZodString;
    roundId: z.ZodString;
    offerKey: z.ZodString;
    taskId: z.ZodString;
    requesterAccountId: z.ZodString;
    termsVersion: z.ZodString;
    termsPacketSha256: z.ZodString;
    allocationReceiptSha256: z.ZodString;
    sender: z.ZodEffects<z.ZodString, string, string>;
    channel: z.ZodObject<{
        kind: z.ZodLiteral<"email">;
        threadRef: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        kind: "email";
        threadRef: string;
    }, {
        kind: "email";
        threadRef: string;
    }>;
    messageRef: z.ZodString;
    deliveryMessageRef: z.ZodString;
    originalOperationRef: z.ZodString;
    receivedAt: z.ZodString;
    reportSha256: z.ZodString;
    report: z.ZodObject<{
        schema: z.ZodLiteral<"pilot.cold-first-use-report.v1">;
        observedStatus: z.ZodEnum<["completed", "refused", "failed", "unresolved"]>;
        runtimeVersion: z.ZodString;
        acquisitionUrl: z.ZodString;
        commands: z.ZodArray<z.ZodString, "many">;
        usefulResult: z.ZodOptional<z.ZodString>;
        reproducibleFailure: z.ZodOptional<z.ZodString>;
        effortSeconds: z.ZodOptional<z.ZodNumber>;
        clarifications: z.ZodOptional<z.ZodNumber>;
        tokenUse: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"unknown">, z.ZodNull, z.ZodNumber]>>;
        cost: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"unknown">, z.ZodNull, z.ZodObject<{
            amount: z.ZodString;
            currency: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            amount: string;
            currency: string;
        }, {
            amount: string;
            currency: string;
        }>]>>;
    }, "strict", z.ZodTypeAny, {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        clarifications?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    }, {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        clarifications?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    }>;
    provenance: z.ZodLiteral<"root_received_private_correspondence">;
    contributorAuthenticated: z.ZodLiteral<false>;
    cliSubmitted: z.ZodLiteral<false>;
}, "strict", z.ZodTypeAny, {
    provenance: "root_received_private_correspondence";
    termsVersion: string;
    taskId: string;
    offerKey: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-original-claim-delivery.v1";
    claimId: string;
    accountId: string;
    report: {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        clarifications?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    };
    requesterAccountId: string;
    roundId: string;
    receivedAt: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    sender: string;
    messageRef: string;
    originalOperationRef: string;
    deliveryMessageRef: string;
    reportSha256: string;
    contributorAuthenticated: false;
    cliSubmitted: false;
}, {
    provenance: "root_received_private_correspondence";
    termsVersion: string;
    taskId: string;
    offerKey: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-original-claim-delivery.v1";
    claimId: string;
    accountId: string;
    report: {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        clarifications?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    };
    requesterAccountId: string;
    roundId: string;
    receivedAt: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    sender: string;
    messageRef: string;
    originalOperationRef: string;
    deliveryMessageRef: string;
    reportSha256: string;
    contributorAuthenticated: false;
    cliSubmitted: false;
}>;
export declare const originalDeliverySchema: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.root-original-claim-delivery.v1">;
    accountId: z.ZodString;
    claimId: z.ZodString;
    roundId: z.ZodString;
    offerKey: z.ZodString;
    taskId: z.ZodString;
    requesterAccountId: z.ZodString;
    termsVersion: z.ZodString;
    termsPacketSha256: z.ZodString;
    allocationReceiptSha256: z.ZodString;
    sender: z.ZodEffects<z.ZodString, string, string>;
    channel: z.ZodObject<{
        kind: z.ZodLiteral<"email">;
        threadRef: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        kind: "email";
        threadRef: string;
    }, {
        kind: "email";
        threadRef: string;
    }>;
    messageRef: z.ZodString;
    deliveryMessageRef: z.ZodString;
    originalOperationRef: z.ZodString;
    receivedAt: z.ZodString;
    reportSha256: z.ZodString;
    report: z.ZodObject<{
        schema: z.ZodLiteral<"pilot.cold-first-use-report.v1">;
        observedStatus: z.ZodEnum<["completed", "refused", "failed", "unresolved"]>;
        runtimeVersion: z.ZodString;
        acquisitionUrl: z.ZodString;
        commands: z.ZodArray<z.ZodString, "many">;
        usefulResult: z.ZodOptional<z.ZodString>;
        reproducibleFailure: z.ZodOptional<z.ZodString>;
        effortSeconds: z.ZodOptional<z.ZodNumber>;
        clarifications: z.ZodOptional<z.ZodNumber>;
        tokenUse: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"unknown">, z.ZodNull, z.ZodNumber]>>;
        cost: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"unknown">, z.ZodNull, z.ZodObject<{
            amount: z.ZodString;
            currency: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            amount: string;
            currency: string;
        }, {
            amount: string;
            currency: string;
        }>]>>;
    }, "strict", z.ZodTypeAny, {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        clarifications?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    }, {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        clarifications?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    }>;
    provenance: z.ZodLiteral<"root_received_private_correspondence">;
    contributorAuthenticated: z.ZodLiteral<false>;
    cliSubmitted: z.ZodLiteral<false>;
} & {
    termsPacket: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    allocationReceipt: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strict", z.ZodTypeAny, {
    provenance: "root_received_private_correspondence";
    termsVersion: string;
    taskId: string;
    offerKey: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-original-claim-delivery.v1";
    claimId: string;
    accountId: string;
    report: {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        clarifications?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    };
    requesterAccountId: string;
    roundId: string;
    receivedAt: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    sender: string;
    messageRef: string;
    originalOperationRef: string;
    termsPacket: Record<string, unknown>;
    allocationReceipt: Record<string, unknown>;
    deliveryMessageRef: string;
    reportSha256: string;
    contributorAuthenticated: false;
    cliSubmitted: false;
}, {
    provenance: "root_received_private_correspondence";
    termsVersion: string;
    taskId: string;
    offerKey: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-original-claim-delivery.v1";
    claimId: string;
    accountId: string;
    report: {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        clarifications?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    };
    requesterAccountId: string;
    roundId: string;
    receivedAt: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    sender: string;
    messageRef: string;
    originalOperationRef: string;
    termsPacket: Record<string, unknown>;
    allocationReceipt: Record<string, unknown>;
    deliveryMessageRef: string;
    reportSha256: string;
    contributorAuthenticated: false;
    cliSubmitted: false;
}>;
export type OriginalDelivery = z.infer<typeof originalDeliverySchema>;
export type RetainedOriginalDelivery = z.infer<typeof deliveryPin>;
/** Explicit key order. Packet and allocation bodies stay outside the signed entry. */
export declare function retainedOriginalDelivery(raw: OriginalDelivery): RetainedOriginalDelivery;
export declare function originalEvidence(report: RetainedOriginalDelivery['report'], maxEffort: number): {
    content: string;
    digestSha256: string;
    bytes: number;
    mediaType: string;
};
export declare function inspectOriginalDelivery(raw: unknown, bound: {
    accountId: string;
    claimId: string;
    roundId: string;
    offerKey: string;
    taskId: string;
    requesterAccountId: string;
    termsVersion: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    maxEffortSeconds: number;
    maxEvidenceBytes: number;
}): {
    provenance: "root_received_private_correspondence";
    termsVersion: string;
    taskId: string;
    offerKey: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-original-claim-delivery.v1";
    claimId: string;
    accountId: string;
    report: {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        clarifications?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    };
    requesterAccountId: string;
    roundId: string;
    receivedAt: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    sender: string;
    messageRef: string;
    originalOperationRef: string;
    deliveryMessageRef: string;
    reportSha256: string;
    contributorAuthenticated: false;
    cliSubmitted: false;
};
type SignedEntry = {
    kind: 'delivery';
    delivery: RetainedOriginalDelivery;
    artifactId: string;
    artifact: {
        ref: string;
        digestSha256: string;
        mediaType: string;
        bytes: number;
    };
    key: string;
    requesterAccountId: string;
};
export type OriginalClaimFrozen = SignedEntry & {
    content: string;
    provenance: 'root_received_private_correspondence';
    contributorAuthenticated: false;
    cliSubmitted: false;
    accountId: string;
    claimId: string;
    taskId: string;
    termsVersion: string;
};
export type OriginalClaimBinding = {
    accountId: string;
    principal: ContributorPrincipal;
    frozen: OriginalClaimFrozen;
};
export declare class RootOriginalClaimReceiving {
    private readonly o;
    constructor(o: {
        store: PostgresStore;
        correspondence: CorrespondenceStore;
        integrityKey: string;
        accounts: ContributorAccountService;
        admission: JourneyAdmission;
        lock: ProjectLock;
        opportunity: OpportunityService;
    });
    private signature;
    private projectIntent;
    private project;
    private history;
    private append;
    private authenticate;
    private principalFor;
    private loadBound;
    storedDelivery(id: string): Promise<SignedEntry | null>;
    loadClaim(claim: Record<string, any>): Promise<OriginalClaimBinding | null>;
    receive(sessionToken: string, raw: unknown, key: string): Promise<{
        claimId: any;
        artifactId: string;
        artifact: {
            ref: string;
            digestSha256: string;
            mediaType: string;
            bytes: number;
        };
        reportSha256: string;
        accountId: string;
        contributorAuthenticated: false;
        cliSubmitted: false;
    }>;
}
export {};
