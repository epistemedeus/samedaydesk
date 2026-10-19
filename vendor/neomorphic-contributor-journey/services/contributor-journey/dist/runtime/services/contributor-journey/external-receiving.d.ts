import { z } from 'zod';
import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import type { ContributorPrincipal } from '../earned-work/src/types.js';
import type { CorrespondenceStore } from '../correspondence/src/store/types.js';
import { OpportunityService } from '../earned-work/src/opportunity/service.js';
import type { ContributorAccountService } from './account/service.js';
import type { JourneyAdmission } from './profile.js';
import type { ProjectLock } from './discussion/correspondence.js';
declare const packetPin: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.root-external-selection.v1">;
    roundId: z.ZodString;
    taskId: z.ZodString;
    requesterAccountId: z.ZodString;
    termsVersion: z.ZodString;
    termsPacketSha256: z.ZodString;
    allocationReceiptSha256: z.ZodString;
    identity: z.ZodEffects<z.ZodString, string, string>;
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
    publicLabel: z.ZodString;
    agreement: z.ZodObject<{
        sender: z.ZodEffects<z.ZodString, string, string>;
        threadRef: z.ZodString;
        messageRef: z.ZodString;
        termsRef: z.ZodString;
        originalOperationRef: z.ZodString;
        termsVersion: z.ZodString;
        termsPacketSha256: z.ZodString;
        agreedAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    }, {
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    }>;
    rootReceipt: z.ZodObject<{
        provenance: z.ZodLiteral<"root_received_private_correspondence">;
        recordRef: z.ZodString;
        receivedAt: z.ZodString;
        actualExternalIdentity: z.ZodLiteral<true>;
    }, "strict", z.ZodTypeAny, {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    }, {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    }>;
}, "strict", z.ZodTypeAny, {
    termsVersion: string;
    taskId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-external-selection.v1";
    requesterAccountId: string;
    roundId: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    identity: string;
    agreement: {
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    };
    rootReceipt: {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    };
}, {
    termsVersion: string;
    taskId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-external-selection.v1";
    requesterAccountId: string;
    roundId: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    identity: string;
    agreement: {
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    };
    rootReceipt: {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    };
}>;
export declare const externalSelectionSchema: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.root-external-selection.v1">;
    roundId: z.ZodString;
    taskId: z.ZodString;
    requesterAccountId: z.ZodString;
    termsVersion: z.ZodString;
    termsPacketSha256: z.ZodString;
    allocationReceiptSha256: z.ZodString;
    identity: z.ZodEffects<z.ZodString, string, string>;
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
    publicLabel: z.ZodString;
    agreement: z.ZodObject<{
        sender: z.ZodEffects<z.ZodString, string, string>;
        threadRef: z.ZodString;
        messageRef: z.ZodString;
        termsRef: z.ZodString;
        originalOperationRef: z.ZodString;
        termsVersion: z.ZodString;
        termsPacketSha256: z.ZodString;
        agreedAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    }, {
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    }>;
    rootReceipt: z.ZodObject<{
        provenance: z.ZodLiteral<"root_received_private_correspondence">;
        recordRef: z.ZodString;
        receivedAt: z.ZodString;
        actualExternalIdentity: z.ZodLiteral<true>;
    }, "strict", z.ZodTypeAny, {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    }, {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    }>;
} & {
    termsPacket: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    allocationReceipt: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strict", z.ZodTypeAny, {
    termsVersion: string;
    taskId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-external-selection.v1";
    requesterAccountId: string;
    roundId: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    identity: string;
    agreement: {
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    };
    rootReceipt: {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    };
    termsPacket: Record<string, unknown>;
    allocationReceipt: Record<string, unknown>;
}, {
    termsVersion: string;
    taskId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-external-selection.v1";
    requesterAccountId: string;
    roundId: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    identity: string;
    agreement: {
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    };
    rootReceipt: {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    };
    termsPacket: Record<string, unknown>;
    allocationReceipt: Record<string, unknown>;
}>;
export type ExternalSelection = z.infer<typeof externalSelectionSchema>;
export type RetainedExternalSelection = z.infer<typeof packetPin>;
export declare const externalReportSchema: z.ZodObject<{
    schema: z.ZodLiteral<"pilot.cold-first-use-report.v1">;
    observedStatus: z.ZodEnum<["completed", "refused", "failed", "unresolved"]>;
    runtimeVersion: z.ZodString;
    acquisitionUrl: z.ZodString;
    commands: z.ZodArray<z.ZodString, "many">;
    usefulResult: z.ZodOptional<z.ZodString>;
    reproducibleFailure: z.ZodOptional<z.ZodString>;
    effortSeconds: z.ZodNumber;
    clarifications: z.ZodNumber;
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
    effortSeconds: number;
    clarifications: number;
    usefulResult?: string | undefined;
    reproducibleFailure?: string | undefined;
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
    effortSeconds: number;
    clarifications: number;
    usefulResult?: string | undefined;
    reproducibleFailure?: string | undefined;
    tokenUse?: number | "unknown" | null | undefined;
    cost?: "unknown" | {
        amount: string;
        currency: string;
    } | null | undefined;
}>;
export declare const externalDeliverySchema: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.root-external-delivery.v1">;
    credentialRef: z.ZodString;
    claimId: z.ZodString;
    termsVersion: z.ZodString;
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
    agreementMessageRef: z.ZodString;
    deliveryMessageRef: z.ZodString;
    originalOperationRef: z.ZodString;
    reportSha256: z.ZodString;
    report: z.ZodObject<{
        schema: z.ZodLiteral<"pilot.cold-first-use-report.v1">;
        observedStatus: z.ZodEnum<["completed", "refused", "failed", "unresolved"]>;
        runtimeVersion: z.ZodString;
        acquisitionUrl: z.ZodString;
        commands: z.ZodArray<z.ZodString, "many">;
        usefulResult: z.ZodOptional<z.ZodString>;
        reproducibleFailure: z.ZodOptional<z.ZodString>;
        effortSeconds: z.ZodNumber;
        clarifications: z.ZodNumber;
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
        effortSeconds: number;
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
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
        effortSeconds: number;
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    }>;
    rootReceipt: z.ZodObject<{
        provenance: z.ZodLiteral<"root_received_private_correspondence">;
        recordRef: z.ZodString;
        receivedAt: z.ZodString;
        actualExternalIdentity: z.ZodLiteral<true>;
    }, "strict", z.ZodTypeAny, {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    }, {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    }>;
}, "strict", z.ZodTypeAny, {
    termsVersion: string;
    credentialRef: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-external-delivery.v1";
    claimId: string;
    report: {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        effortSeconds: number;
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    };
    sender: string;
    originalOperationRef: string;
    rootReceipt: {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    };
    agreementMessageRef: string;
    deliveryMessageRef: string;
    reportSha256: string;
}, {
    termsVersion: string;
    credentialRef: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-external-delivery.v1";
    claimId: string;
    report: {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        effortSeconds: number;
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    };
    sender: string;
    originalOperationRef: string;
    rootReceipt: {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    };
    agreementMessageRef: string;
    deliveryMessageRef: string;
    reportSha256: string;
}>;
export type ExternalDelivery = z.infer<typeof externalDeliverySchema>;
export declare function externalCredentialRef(selection: Pick<ExternalSelection, 'roundId' | 'identity'>): string;
/** Explicit key order. This is the signed selection; packet bodies stay outside correspondence. */
export declare function retainedExternalSelection(selection: ExternalSelection): RetainedExternalSelection;
export declare function externalEvidence(report: ExternalDelivery['report'], maxEffort: number): {
    content: string;
    digestSha256: string;
    bytes: number;
    mediaType: string;
};
export declare function inspectExternalDelivery(raw: unknown, bound: {
    credentialRef: string;
    claimId: string;
    termsVersion: string;
    identity: string;
    channel: ExternalSelection['channel'];
    agreementMessageRef: string;
    originalOperationRef: string;
    maxEffortSeconds: number;
    maxEvidenceBytes: number;
}): {
    termsVersion: string;
    credentialRef: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    schema: "neomorphic.root-external-delivery.v1";
    claimId: string;
    report: {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        effortSeconds: number;
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    };
    sender: string;
    originalOperationRef: string;
    rootReceipt: {
        provenance: "root_received_private_correspondence";
        recordRef: string;
        receivedAt: string;
        actualExternalIdentity: true;
    };
    agreementMessageRef: string;
    deliveryMessageRef: string;
    reportSha256: string;
};
type SignedEntry = {
    kind: 'selection';
    selection: RetainedExternalSelection;
    actor: {
        accountId: string;
        sessionId: string;
        authTime: string;
    };
    key: string;
} | {
    kind: 'delivery';
    delivery: ExternalDelivery;
    artifactId: string;
    artifact: {
        ref: string;
        digestSha256: string;
        mediaType: string;
        bytes: number;
    };
    key: string;
};
export type ExternalAssignment = {
    credentialRef: string;
    claimId: string;
    principal: ContributorPrincipal;
    selection: RetainedExternalSelection;
    assignmentKey: string;
};
type ExternalFrozen = Extract<SignedEntry, {
    kind: 'delivery';
}> & {
    content: string;
};
export declare class RootExternalReceiving {
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
    private loadTerms;
    private validateFull;
    assignment(sessionToken: string, raw: unknown, key: string): Promise<ExternalAssignment>;
    readAssignment(credentialRef: string, key: string): Promise<ExternalAssignment | null>;
    loadClaim(claim: Record<string, any>): Promise<{
        assignment: ExternalAssignment;
        frozen: ExternalFrozen | null;
    } | null>;
    private checkDelivery;
    receive(sessionToken: string, credentialRef: string, assignmentKey: string, raw: unknown, key: string): Promise<{
        claimId: string;
        artifactId: string;
        artifact: {
            ref: string;
            digestSha256: string;
            mediaType: string;
            bytes: number;
        };
        reportSha256: string;
    }>;
}
export {};
