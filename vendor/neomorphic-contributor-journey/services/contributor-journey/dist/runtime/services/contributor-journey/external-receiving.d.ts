import { z } from 'zod';
import type { PostgresStore } from '../earned-work/src/store/postgres.js';
import type { ContributorPrincipal } from '../earned-work/src/types.js';
import type { CorrespondenceStore } from '../correspondence/src/store/types.js';
import { OpportunityService } from '../earned-work/src/opportunity/service.js';
import type { ContributorAccountService } from './account/service.js';
import type { JourneyAdmission } from './profile.js';
import type { ProjectLock } from './discussion/correspondence.js';
import type { MediatedReceiptBinding } from '../earned-work/src/opportunity/service.js';
declare const packetPin: z.ZodDiscriminatedUnion<"schema", [z.ZodObject<{
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }, {
        provenance: "root_received_private_correspondence";
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }>;
}, "strict", z.ZodTypeAny, {
    termsVersion: string;
    taskId: string;
    schema: "neomorphic.root-external-selection.v1";
    requesterAccountId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
}, {
    termsVersion: string;
    taskId: string;
    schema: "neomorphic.root-external-selection.v1";
    requesterAccountId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
}>, z.ZodObject<{
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
    rootReceipt: z.ZodObject<{
        provenance: z.ZodLiteral<"root_received_private_correspondence">;
        recordRef: z.ZodString;
        receivedAt: z.ZodString;
        actualExternalIdentity: z.ZodLiteral<true>;
    }, "strict", z.ZodTypeAny, {
        provenance: "root_received_private_correspondence";
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }, {
        provenance: "root_received_private_correspondence";
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }>;
} & {
    schema: z.ZodLiteral<"neomorphic.root-external-selection.v2">;
    agreement: z.ZodObject<{
        sender: z.ZodEffects<z.ZodString, string, string>;
        threadRef: z.ZodString;
        messageRef: z.ZodString;
        termsRef: z.ZodString;
        originalOperationRef: z.ZodString;
        termsVersion: z.ZodString;
        termsPacketSha256: z.ZodString;
        agreedAt: z.ZodString;
    } & {
        payoutDestination: z.ZodObject<{
            rewardAsset: z.ZodObject<{
                schema: z.ZodLiteral<"pilot.reward-asset.v1">;
                kind: z.ZodLiteral<"native">;
                chainId: z.ZodLiteral<8453>;
                symbol: z.ZodLiteral<"ETH">;
                decimals: z.ZodLiteral<18>;
                denomination: z.ZodLiteral<"wei">;
            }, "strict", z.ZodTypeAny, {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            }, {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            }>;
            address: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        }, {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        }>;
    }, "strict", z.ZodTypeAny, {
        payoutDestination: {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        };
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    }, {
        payoutDestination: {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        };
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    }>;
}, "strict", z.ZodTypeAny, {
    termsVersion: string;
    taskId: string;
    schema: "neomorphic.root-external-selection.v2";
    requesterAccountId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    roundId: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    identity: string;
    agreement: {
        payoutDestination: {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        };
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
}, {
    termsVersion: string;
    taskId: string;
    schema: "neomorphic.root-external-selection.v2";
    requesterAccountId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    roundId: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    identity: string;
    agreement: {
        payoutDestination: {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        };
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
}>]>;
export declare const externalSelectionSchema: z.ZodDiscriminatedUnion<"schema", [z.ZodObject<{
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }, {
        provenance: "root_received_private_correspondence";
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }>;
} & {
    termsPacket: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    allocationReceipt: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strict", z.ZodTypeAny, {
    termsVersion: string;
    taskId: string;
    schema: "neomorphic.root-external-selection.v1";
    requesterAccountId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
    termsPacket: Record<string, unknown>;
    allocationReceipt: Record<string, unknown>;
}, {
    termsVersion: string;
    taskId: string;
    schema: "neomorphic.root-external-selection.v1";
    requesterAccountId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
    termsPacket: Record<string, unknown>;
    allocationReceipt: Record<string, unknown>;
}>, z.ZodObject<{
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
    rootReceipt: z.ZodObject<{
        provenance: z.ZodLiteral<"root_received_private_correspondence">;
        recordRef: z.ZodString;
        receivedAt: z.ZodString;
        actualExternalIdentity: z.ZodLiteral<true>;
    }, "strict", z.ZodTypeAny, {
        provenance: "root_received_private_correspondence";
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }, {
        provenance: "root_received_private_correspondence";
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }>;
} & {
    schema: z.ZodLiteral<"neomorphic.root-external-selection.v2">;
    agreement: z.ZodObject<{
        sender: z.ZodEffects<z.ZodString, string, string>;
        threadRef: z.ZodString;
        messageRef: z.ZodString;
        termsRef: z.ZodString;
        originalOperationRef: z.ZodString;
        termsVersion: z.ZodString;
        termsPacketSha256: z.ZodString;
        agreedAt: z.ZodString;
    } & {
        payoutDestination: z.ZodObject<{
            rewardAsset: z.ZodObject<{
                schema: z.ZodLiteral<"pilot.reward-asset.v1">;
                kind: z.ZodLiteral<"native">;
                chainId: z.ZodLiteral<8453>;
                symbol: z.ZodLiteral<"ETH">;
                decimals: z.ZodLiteral<18>;
                denomination: z.ZodLiteral<"wei">;
            }, "strict", z.ZodTypeAny, {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            }, {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            }>;
            address: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        }, {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        }>;
    }, "strict", z.ZodTypeAny, {
        payoutDestination: {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        };
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    }, {
        payoutDestination: {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        };
        termsVersion: string;
        threadRef: string;
        termsPacketSha256: string;
        sender: string;
        messageRef: string;
        termsRef: string;
        originalOperationRef: string;
        agreedAt: string;
    }>;
} & {
    termsPacket: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    allocationReceipt: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strict", z.ZodTypeAny, {
    termsVersion: string;
    taskId: string;
    schema: "neomorphic.root-external-selection.v2";
    requesterAccountId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    roundId: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    identity: string;
    agreement: {
        payoutDestination: {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        };
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
    termsPacket: Record<string, unknown>;
    allocationReceipt: Record<string, unknown>;
}, {
    termsVersion: string;
    taskId: string;
    schema: "neomorphic.root-external-selection.v2";
    requesterAccountId: string;
    publicLabel: string;
    channel: {
        kind: "email";
        threadRef: string;
    };
    roundId: string;
    termsPacketSha256: string;
    allocationReceiptSha256: string;
    identity: string;
    agreement: {
        payoutDestination: {
            rewardAsset: {
                symbol: "ETH";
                schema: "pilot.reward-asset.v1";
                kind: "native";
                chainId: 8453;
                decimals: 18;
                denomination: "wei";
            };
            address: string;
        };
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
    termsPacket: Record<string, unknown>;
    allocationReceipt: Record<string, unknown>;
}>]>;
export type ExternalSelection = z.infer<typeof externalSelectionSchema>;
export type RetainedExternalSelection = z.infer<typeof packetPin>;
export declare const externalReportSchema: z.ZodUnion<[z.ZodObject<{
    schema: z.ZodLiteral<"pilot.cold-first-use-report.v1">;
    observedStatus: z.ZodEnum<["completed", "refused", "failed", "unresolved"]>;
    runtimeVersion: z.ZodString;
    acquisitionUrl: z.ZodString;
    commands: z.ZodArray<z.ZodString, "many">;
    usefulResult: z.ZodOptional<z.ZodString>;
    reproducibleFailure: z.ZodOptional<z.ZodString>;
    effortSeconds: z.ZodOptional<z.ZodNumber>;
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
    clarifications: number;
    usefulResult?: string | undefined;
    reproducibleFailure?: string | undefined;
    effortSeconds?: number | undefined;
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
    clarifications: number;
    usefulResult?: string | undefined;
    reproducibleFailure?: string | undefined;
    effortSeconds?: number | undefined;
    tokenUse?: number | "unknown" | null | undefined;
    cost?: "unknown" | {
        amount: string;
        currency: string;
    } | null | undefined;
}>, z.ZodType<{
    kind: "workflow_witness";
    attempt: string;
    limitationOrResult: string;
    syntheticFailure: false;
    versions?: string | undefined;
    minimalInput?: string | undefined;
    expectedResult?: string | undefined;
}, z.ZodTypeDef, {
    kind: "workflow_witness";
    attempt: string;
    limitationOrResult: string;
    syntheticFailure: false;
    versions?: string | undefined;
    minimalInput?: string | undefined;
    expectedResult?: string | undefined;
}>]>;
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
    report: z.ZodUnion<[z.ZodObject<{
        schema: z.ZodLiteral<"pilot.cold-first-use-report.v1">;
        observedStatus: z.ZodEnum<["completed", "refused", "failed", "unresolved"]>;
        runtimeVersion: z.ZodString;
        acquisitionUrl: z.ZodString;
        commands: z.ZodArray<z.ZodString, "many">;
        usefulResult: z.ZodOptional<z.ZodString>;
        reproducibleFailure: z.ZodOptional<z.ZodString>;
        effortSeconds: z.ZodOptional<z.ZodNumber>;
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
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
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
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
        tokenUse?: number | "unknown" | null | undefined;
        cost?: "unknown" | {
            amount: string;
            currency: string;
        } | null | undefined;
    }>, z.ZodType<{
        kind: "workflow_witness";
        attempt: string;
        limitationOrResult: string;
        syntheticFailure: false;
        versions?: string | undefined;
        minimalInput?: string | undefined;
        expectedResult?: string | undefined;
    }, z.ZodTypeDef, {
        kind: "workflow_witness";
        attempt: string;
        limitationOrResult: string;
        syntheticFailure: false;
        versions?: string | undefined;
        minimalInput?: string | undefined;
        expectedResult?: string | undefined;
    }>]>;
    rootReceipt: z.ZodObject<{
        provenance: z.ZodLiteral<"root_received_private_correspondence">;
        recordRef: z.ZodString;
        receivedAt: z.ZodString;
        actualExternalIdentity: z.ZodLiteral<true>;
    }, "strict", z.ZodTypeAny, {
        provenance: "root_received_private_correspondence";
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }, {
        provenance: "root_received_private_correspondence";
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    }>;
    receiptAttestation: z.ZodOptional<z.ZodObject<{
        schema: z.ZodLiteral<"neomorphic.root-external-receipt.v1">;
        binding: z.ZodObject<{
            roundId: z.ZodString;
            claimId: z.ZodString;
            termsVersion: z.ZodString;
            credentialRef: z.ZodString;
            principalId: z.ZodString;
            artifactDigestSha256: z.ZodString;
            artifactBytes: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            termsVersion: string;
            artifactDigestSha256: string;
            credentialRef: string;
            claimId: string;
            roundId: string;
            principalId: string;
            artifactBytes: number;
        }, {
            termsVersion: string;
            artifactDigestSha256: string;
            credentialRef: string;
            claimId: string;
            roundId: string;
            principalId: string;
            artifactBytes: number;
        }>;
        selectionSha256: z.ZodString;
        assignmentKeySha256: z.ZodString;
        deliverySha256: z.ZodString;
        receivedAt: z.ZodString;
        attestedAt: z.ZodString;
        signature: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        schema: "neomorphic.root-external-receipt.v1";
        receivedAt: string;
        binding: {
            termsVersion: string;
            artifactDigestSha256: string;
            credentialRef: string;
            claimId: string;
            roundId: string;
            principalId: string;
            artifactBytes: number;
        };
        selectionSha256: string;
        assignmentKeySha256: string;
        deliverySha256: string;
        attestedAt: string;
        signature: string;
    }, {
        schema: "neomorphic.root-external-receipt.v1";
        receivedAt: string;
        binding: {
            termsVersion: string;
            artifactDigestSha256: string;
            credentialRef: string;
            claimId: string;
            roundId: string;
            principalId: string;
            artifactBytes: number;
        };
        selectionSha256: string;
        assignmentKeySha256: string;
        deliverySha256: string;
        attestedAt: string;
        signature: string;
    }>>;
}, "strict", z.ZodTypeAny, {
    termsVersion: string;
    credentialRef: string;
    schema: "neomorphic.root-external-delivery.v1";
    channel: {
        kind: "email";
        threadRef: string;
    };
    claimId: string;
    report: {
        kind: "workflow_witness";
        attempt: string;
        limitationOrResult: string;
        syntheticFailure: false;
        versions?: string | undefined;
        minimalInput?: string | undefined;
        expectedResult?: string | undefined;
    } | {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
    agreementMessageRef: string;
    deliveryMessageRef: string;
    reportSha256: string;
    receiptAttestation?: {
        schema: "neomorphic.root-external-receipt.v1";
        receivedAt: string;
        binding: {
            termsVersion: string;
            artifactDigestSha256: string;
            credentialRef: string;
            claimId: string;
            roundId: string;
            principalId: string;
            artifactBytes: number;
        };
        selectionSha256: string;
        assignmentKeySha256: string;
        deliverySha256: string;
        attestedAt: string;
        signature: string;
    } | undefined;
}, {
    termsVersion: string;
    credentialRef: string;
    schema: "neomorphic.root-external-delivery.v1";
    channel: {
        kind: "email";
        threadRef: string;
    };
    claimId: string;
    report: {
        kind: "workflow_witness";
        attempt: string;
        limitationOrResult: string;
        syntheticFailure: false;
        versions?: string | undefined;
        minimalInput?: string | undefined;
        expectedResult?: string | undefined;
    } | {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
    agreementMessageRef: string;
    deliveryMessageRef: string;
    reportSha256: string;
    receiptAttestation?: {
        schema: "neomorphic.root-external-receipt.v1";
        receivedAt: string;
        binding: {
            termsVersion: string;
            artifactDigestSha256: string;
            credentialRef: string;
            claimId: string;
            roundId: string;
            principalId: string;
            artifactBytes: number;
        };
        selectionSha256: string;
        assignmentKeySha256: string;
        deliverySha256: string;
        attestedAt: string;
        signature: string;
    } | undefined;
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
    schema: "neomorphic.root-external-delivery.v1";
    channel: {
        kind: "email";
        threadRef: string;
    };
    claimId: string;
    report: {
        kind: "workflow_witness";
        attempt: string;
        limitationOrResult: string;
        syntheticFailure: false;
        versions?: string | undefined;
        minimalInput?: string | undefined;
        expectedResult?: string | undefined;
    } | {
        schema: "pilot.cold-first-use-report.v1";
        observedStatus: "failed" | "completed" | "refused" | "unresolved";
        runtimeVersion: string;
        acquisitionUrl: string;
        commands: string[];
        clarifications: number;
        usefulResult?: string | undefined;
        reproducibleFailure?: string | undefined;
        effortSeconds?: number | undefined;
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
        receivedAt: string;
        recordRef: string;
        actualExternalIdentity: true;
    };
    agreementMessageRef: string;
    deliveryMessageRef: string;
    reportSha256: string;
    receiptAttestation?: {
        schema: "neomorphic.root-external-receipt.v1";
        receivedAt: string;
        binding: {
            termsVersion: string;
            artifactDigestSha256: string;
            credentialRef: string;
            claimId: string;
            roundId: string;
            principalId: string;
            artifactBytes: number;
        };
        selectionSha256: string;
        assignmentKeySha256: string;
        deliverySha256: string;
        attestedAt: string;
        signature: string;
    } | undefined;
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
        receiptAuthorityHash: string;
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
    private unsignedDelivery;
    private receiptSignature;
    private receiptBinding;
    /** A private, explicit assertion by the configured Root receiving authority.
     * Root must independently retain actual channel arrival evidence. Neither a
     * requester session nor a supplied header/timestamp can issue this MAC. No
     * claim, correspondence, submission or financial state is changed here. */
    attestReceipt(receiverToken: string, sessionToken: string, credentialRef: string, assignmentKey: string, raw: unknown): Promise<{
        receiptAttestation: {
            signature: string;
            schema: "neomorphic.root-external-receipt.v1";
            binding: MediatedReceiptBinding;
            selectionSha256: string;
            assignmentKeySha256: string;
            deliverySha256: string;
            receivedAt: string;
            attestedAt: string;
        };
        termsVersion: string;
        credentialRef: string;
        schema: "neomorphic.root-external-delivery.v1";
        channel: {
            kind: "email";
            threadRef: string;
        };
        claimId: string;
        report: {
            kind: "workflow_witness";
            attempt: string;
            limitationOrResult: string;
            syntheticFailure: false;
            versions?: string | undefined;
            minimalInput?: string | undefined;
            expectedResult?: string | undefined;
        } | {
            schema: "pilot.cold-first-use-report.v1";
            observedStatus: "failed" | "completed" | "refused" | "unresolved";
            runtimeVersion: string;
            acquisitionUrl: string;
            commands: string[];
            clarifications: number;
            usefulResult?: string | undefined;
            reproducibleFailure?: string | undefined;
            effortSeconds?: number | undefined;
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
            receivedAt: string;
            recordRef: string;
            actualExternalIdentity: true;
        };
        agreementMessageRef: string;
        deliveryMessageRef: string;
        reportSha256: string;
    }>;
    /** Kernel verifier: a JSON timestamp/options object never establishes receipt. */
    verifyReceipt(raw: unknown, binding: MediatedReceiptBinding): {
        receivedAt: string;
        attestedAt: string;
    } | null;
    private checkReceipt;
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
