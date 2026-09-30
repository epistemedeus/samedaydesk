import { z } from "zod";
import { ApiError } from "../errors.js";
export declare const artifactSchema: z.ZodObject<{
    uri: z.ZodEffects<z.ZodString, string, string>;
    digest: z.ZodString;
}, "strict", z.ZodTypeAny, {
    uri: string;
    digest: string;
}, {
    uri: string;
    digest: string;
}>;
export declare const gapSchema: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-gap.v1">;
    id: z.ZodEffects<z.ZodString, string, string>;
    contentId: z.ZodString;
    resolverSnapshot: z.ZodObject<{
        uri: z.ZodEffects<z.ZodString, string, string>;
        digest: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        uri: string;
        digest: string;
    }, {
        uri: string;
        digest: string;
    }>;
    reproducer: z.ZodObject<{
        uri: z.ZodEffects<z.ZodString, string, string>;
        digest: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        uri: string;
        digest: string;
    }, {
        uri: string;
        digest: string;
    }>;
    permission: z.ZodEnum<["synthetic", "authorized-reusable"]>;
    fundingKind: z.ZodEnum<["voluntary", "unfunded-request"]>;
}, "strict", z.ZodTypeAny, {
    id: string;
    schema: "neomorphic.foundry.work-cell-gap.v1";
    contentId: string;
    resolverSnapshot: {
        uri: string;
        digest: string;
    };
    reproducer: {
        uri: string;
        digest: string;
    };
    permission: "synthetic" | "authorized-reusable";
    fundingKind: "voluntary" | "unfunded-request";
}, {
    id: string;
    schema: "neomorphic.foundry.work-cell-gap.v1";
    contentId: string;
    resolverSnapshot: {
        uri: string;
        digest: string;
    };
    reproducer: {
        uri: string;
        digest: string;
    };
    permission: "synthetic" | "authorized-reusable";
    fundingKind: "voluntary" | "unfunded-request";
}>;
export declare const checkpointSchema: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.foundry.checkpoint.v1">;
    artifact: z.ZodObject<{
        uri: z.ZodEffects<z.ZodString, string, string>;
        digest: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        uri: string;
        digest: string;
    }, {
        uri: string;
        digest: string;
    }>;
    summary: z.ZodString;
    nextStep: z.ZodString;
}, "strict", z.ZodTypeAny, {
    artifact: {
        uri: string;
        digest: string;
    };
    summary: string;
    schema: "neomorphic.foundry.checkpoint.v1";
    nextStep: string;
}, {
    artifact: {
        uri: string;
        digest: string;
    };
    summary: string;
    schema: "neomorphic.foundry.checkpoint.v1";
    nextStep: string;
}>;
export declare const contributionSchema: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.foundry.contribution.v1">;
    gapId: z.ZodEffects<z.ZodString, string, string>;
    gapRevision: z.ZodString;
    sourceRevision: z.ZodString;
    artifact: z.ZodObject<{
        uri: z.ZodEffects<z.ZodString, string, string>;
        digest: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        uri: string;
        digest: string;
    }, {
        uri: string;
        digest: string;
    }>;
    rights: z.ZodString;
    testProposal: z.ZodString;
    limitations: z.ZodString;
    operatorScope: z.ZodString;
    checkpointRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    artifact: {
        uri: string;
        digest: string;
    };
    schema: "neomorphic.foundry.contribution.v1";
    gapId: string;
    gapRevision: string;
    sourceRevision: string;
    rights: string;
    testProposal: string;
    limitations: string;
    operatorScope: string;
    checkpointRevision: number;
}, {
    artifact: {
        uri: string;
        digest: string;
    };
    schema: "neomorphic.foundry.contribution.v1";
    gapId: string;
    gapRevision: string;
    sourceRevision: string;
    rights: string;
    testProposal: string;
    limitations: string;
    operatorScope: string;
    checkpointRevision: number;
}>;
export declare const commandSchema: z.ZodDiscriminatedUnion<"action", [z.ZodObject<{
    action: z.ZodLiteral<"create">;
    expectedRevision: z.ZodLiteral<0>;
    gap: z.ZodObject<{
        schema: z.ZodLiteral<"neomorphic.foundry.work-cell-gap.v1">;
        id: z.ZodEffects<z.ZodString, string, string>;
        contentId: z.ZodString;
        resolverSnapshot: z.ZodObject<{
            uri: z.ZodEffects<z.ZodString, string, string>;
            digest: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            uri: string;
            digest: string;
        }, {
            uri: string;
            digest: string;
        }>;
        reproducer: z.ZodObject<{
            uri: z.ZodEffects<z.ZodString, string, string>;
            digest: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            uri: string;
            digest: string;
        }, {
            uri: string;
            digest: string;
        }>;
        permission: z.ZodEnum<["synthetic", "authorized-reusable"]>;
        fundingKind: z.ZodEnum<["voluntary", "unfunded-request"]>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        schema: "neomorphic.foundry.work-cell-gap.v1";
        contentId: string;
        resolverSnapshot: {
            uri: string;
            digest: string;
        };
        reproducer: {
            uri: string;
            digest: string;
        };
        permission: "synthetic" | "authorized-reusable";
        fundingKind: "voluntary" | "unfunded-request";
    }, {
        id: string;
        schema: "neomorphic.foundry.work-cell-gap.v1";
        contentId: string;
        resolverSnapshot: {
            uri: string;
            digest: string;
        };
        reproducer: {
            uri: string;
            digest: string;
        };
        permission: "synthetic" | "authorized-reusable";
        fundingKind: "voluntary" | "unfunded-request";
    }>;
    workScope: z.ZodString;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "create";
    expectedRevision: 0;
    gap: {
        id: string;
        schema: "neomorphic.foundry.work-cell-gap.v1";
        contentId: string;
        resolverSnapshot: {
            uri: string;
            digest: string;
        };
        reproducer: {
            uri: string;
            digest: string;
        };
        permission: "synthetic" | "authorized-reusable";
        fundingKind: "voluntary" | "unfunded-request";
    };
    workScope: string;
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "create";
    expectedRevision: 0;
    gap: {
        id: string;
        schema: "neomorphic.foundry.work-cell-gap.v1";
        contentId: string;
        resolverSnapshot: {
            uri: string;
            digest: string;
        };
        reproducer: {
            uri: string;
            digest: string;
        };
        permission: "synthetic" | "authorized-reusable";
        fundingKind: "voluntary" | "unfunded-request";
    };
    workScope: string;
}>, z.ZodObject<{
    action: z.ZodLiteral<"claim">;
    ttlSeconds: z.ZodNumber;
    voluntaryOptIn: z.ZodLiteral<true>;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "claim";
    expectedRevision: number;
    ttlSeconds: number;
    voluntaryOptIn: true;
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "claim";
    expectedRevision: number;
    ttlSeconds: number;
    voluntaryOptIn: true;
}>, z.ZodObject<{
    action: z.ZodLiteral<"renew">;
    ttlSeconds: z.ZodNumber;
    fence: z.ZodNumber;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "renew";
    expectedRevision: number;
    ttlSeconds: number;
    fence: number;
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "renew";
    expectedRevision: number;
    ttlSeconds: number;
    fence: number;
}>, z.ZodObject<{
    action: z.ZodLiteral<"checkpoint">;
    checkpoint: z.ZodObject<{
        schema: z.ZodLiteral<"neomorphic.foundry.checkpoint.v1">;
        artifact: z.ZodObject<{
            uri: z.ZodEffects<z.ZodString, string, string>;
            digest: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            uri: string;
            digest: string;
        }, {
            uri: string;
            digest: string;
        }>;
        summary: z.ZodString;
        nextStep: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        artifact: {
            uri: string;
            digest: string;
        };
        summary: string;
        schema: "neomorphic.foundry.checkpoint.v1";
        nextStep: string;
    }, {
        artifact: {
            uri: string;
            digest: string;
        };
        summary: string;
        schema: "neomorphic.foundry.checkpoint.v1";
        nextStep: string;
    }>;
    fence: z.ZodNumber;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "checkpoint";
    expectedRevision: number;
    fence: number;
    checkpoint: {
        artifact: {
            uri: string;
            digest: string;
        };
        summary: string;
        schema: "neomorphic.foundry.checkpoint.v1";
        nextStep: string;
    };
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "checkpoint";
    expectedRevision: number;
    fence: number;
    checkpoint: {
        artifact: {
            uri: string;
            digest: string;
        };
        summary: string;
        schema: "neomorphic.foundry.checkpoint.v1";
        nextStep: string;
    };
}>, z.ZodObject<{
    action: z.ZodLiteral<"transfer">;
    targetGrantId: z.ZodString;
    ttlSeconds: z.ZodNumber;
    fence: z.ZodNumber;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "transfer";
    expectedRevision: number;
    ttlSeconds: number;
    fence: number;
    targetGrantId: string;
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "transfer";
    expectedRevision: number;
    ttlSeconds: number;
    fence: number;
    targetGrantId: string;
}>, z.ZodObject<{
    action: z.ZodLiteral<"release">;
    fence: z.ZodNumber;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "release";
    expectedRevision: number;
    fence: number;
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "release";
    expectedRevision: number;
    fence: number;
}>, z.ZodObject<{
    action: z.ZodLiteral<"submit">;
    contribution: z.ZodObject<{
        schema: z.ZodLiteral<"neomorphic.foundry.contribution.v1">;
        gapId: z.ZodEffects<z.ZodString, string, string>;
        gapRevision: z.ZodString;
        sourceRevision: z.ZodString;
        artifact: z.ZodObject<{
            uri: z.ZodEffects<z.ZodString, string, string>;
            digest: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            uri: string;
            digest: string;
        }, {
            uri: string;
            digest: string;
        }>;
        rights: z.ZodString;
        testProposal: z.ZodString;
        limitations: z.ZodString;
        operatorScope: z.ZodString;
        checkpointRevision: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        artifact: {
            uri: string;
            digest: string;
        };
        schema: "neomorphic.foundry.contribution.v1";
        gapId: string;
        gapRevision: string;
        sourceRevision: string;
        rights: string;
        testProposal: string;
        limitations: string;
        operatorScope: string;
        checkpointRevision: number;
    }, {
        artifact: {
            uri: string;
            digest: string;
        };
        schema: "neomorphic.foundry.contribution.v1";
        gapId: string;
        gapRevision: string;
        sourceRevision: string;
        rights: string;
        testProposal: string;
        limitations: string;
        operatorScope: string;
        checkpointRevision: number;
    }>;
    fence: z.ZodNumber;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "submit";
    expectedRevision: number;
    fence: number;
    contribution: {
        artifact: {
            uri: string;
            digest: string;
        };
        schema: "neomorphic.foundry.contribution.v1";
        gapId: string;
        gapRevision: string;
        sourceRevision: string;
        rights: string;
        testProposal: string;
        limitations: string;
        operatorScope: string;
        checkpointRevision: number;
    };
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "submit";
    expectedRevision: number;
    fence: number;
    contribution: {
        artifact: {
            uri: string;
            digest: string;
        };
        schema: "neomorphic.foundry.contribution.v1";
        gapId: string;
        gapRevision: string;
        sourceRevision: string;
        rights: string;
        testProposal: string;
        limitations: string;
        operatorScope: string;
        checkpointRevision: number;
    };
}>, z.ZodObject<{
    action: z.ZodLiteral<"cancel">;
    reason: z.ZodString;
    fence: z.ZodOptional<z.ZodNumber>;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "cancel";
    expectedRevision: number;
    reason: string;
    fence?: number | undefined;
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "cancel";
    expectedRevision: number;
    reason: string;
    fence?: number | undefined;
}>, z.ZodObject<{
    action: z.ZodLiteral<"reject">;
    reason: z.ZodString;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "reject";
    expectedRevision: number;
    reason: string;
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "reject";
    expectedRevision: number;
    reason: string;
}>, z.ZodObject<{
    action: z.ZodLiteral<"disposition">;
    receipt: z.ZodObject<{
        uri: z.ZodEffects<z.ZodString, string, string>;
        digest: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        uri: string;
        digest: string;
    }, {
        uri: string;
        digest: string;
    }>;
    schema: z.ZodLiteral<"neomorphic.foundry.work-cell-command.v1">;
    expectedRevision: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "disposition";
    expectedRevision: number;
    receipt: {
        uri: string;
        digest: string;
    };
}, {
    schema: "neomorphic.foundry.work-cell-command.v1";
    action: "disposition";
    expectedRevision: number;
    receipt: {
        uri: string;
        digest: string;
    };
}>]>;
export type Command = z.infer<typeof commandSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Gap = z.infer<typeof gapSchema>;
export type Contribution = z.infer<typeof contributionSchema>;
export type Grant = {
    id: string;
    projectId: string;
    role: "owner" | "writer" | "reader";
    expiresAt: string | null;
};
export type Lease = {
    grantId: string;
    fence: number;
    expiresAt: string;
};
export type Submission = {
    id: string;
    revision: number;
    grantId: string;
    contributorGrantIds: string[];
    submittedAt: string;
    contribution: Contribution;
};
export declare const verificationSchema: z.ZodObject<{
    schema: z.ZodLiteral<"neomorphic.foundry.verification-receipt.v1">;
    id: z.ZodString;
    projectId: z.ZodString;
    cellId: z.ZodString;
    submissionId: z.ZodString;
    candidateRevision: z.ZodString;
    artifactDigest: z.ZodString;
    executionIdentity: z.ZodString;
    evaluatorPolicy: z.ZodObject<{
        uri: z.ZodEffects<z.ZodString, string, string>;
        digest: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        uri: string;
        digest: string;
    }, {
        uri: string;
        digest: string;
    }>;
    environment: z.ZodString;
    independentlyAssigned: z.ZodLiteral<true>;
    contributorRelationship: z.ZodEnum<["independent", "owner-controlled", "unknown"]>;
    outcome: z.ZodEnum<["accepted", "rejected", "deferred"]>;
    limitations: z.ZodString;
    nextStep: z.ZodString;
    retryAfterSeconds: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    id: string;
    projectId: string;
    schema: "neomorphic.foundry.verification-receipt.v1";
    nextStep: string;
    limitations: string;
    cellId: string;
    submissionId: string;
    candidateRevision: string;
    artifactDigest: string;
    executionIdentity: string;
    evaluatorPolicy: {
        uri: string;
        digest: string;
    };
    environment: string;
    independentlyAssigned: true;
    contributorRelationship: "unknown" | "independent" | "owner-controlled";
    outcome: "accepted" | "rejected" | "deferred";
    retryAfterSeconds?: number | undefined;
}, {
    id: string;
    projectId: string;
    schema: "neomorphic.foundry.verification-receipt.v1";
    nextStep: string;
    limitations: string;
    cellId: string;
    submissionId: string;
    candidateRevision: string;
    artifactDigest: string;
    executionIdentity: string;
    evaluatorPolicy: {
        uri: string;
        digest: string;
    };
    environment: string;
    independentlyAssigned: true;
    contributorRelationship: "unknown" | "independent" | "owner-controlled";
    outcome: "accepted" | "rejected" | "deferred";
    retryAfterSeconds?: number | undefined;
}>;
export type Verification = z.infer<typeof verificationSchema>;
export type ReceiptResolver = (input: {
    reference: Artifact;
    projectId: string;
    cellId: string;
    submission: Submission;
    signal: AbortSignal;
}) => Promise<Verification>;
export type Cell = {
    schema: "neomorphic.foundry.work-cell.v1";
    id: string;
    projectId: string;
    workScope: string;
    gap: Gap;
    revision: number;
    fence: number;
    status: "open" | "leased" | "submitted" | "accepted" | "rejected" | "cancelled";
    lease: Lease | null;
    checkpoint: (z.infer<typeof checkpointSchema> & {
        revision: number;
        grantId: string;
        createdAt: string;
    }) | null;
    contributorGrantIds: string[];
    submission: Submission | null;
    disposition: {
        source: "owner" | "contributor" | "verification";
        reason?: string;
        receipt?: Artifact;
        verification?: Verification;
    } | null;
    createdAt: string;
    updatedAt: string;
};
export type MutationReceipt = {
    schema: "neomorphic.foundry.work-cell-receipt.v1";
    action: Command["action"];
    revision: number;
    actorGrantId: string;
    recordedAt: string;
    cell: Cell;
    nextStep: string;
};
export declare class WorkCellError extends ApiError {
    readonly nextStep: string;
    readonly retryAfterSeconds?: number | undefined;
    constructor(status: number, code: string, message: string, nextStep: string, retryAfterSeconds?: number | undefined);
}
export declare class UnsupportedWorkCell extends WorkCellError {
    readonly result: {
        schema: string;
        status: string;
        reason: string;
        original: unknown;
        limit: null;
        accepted: false;
    };
    constructor(original: unknown);
}
export declare function fail(status: number, code: string, message: string, nextStep: string, retryAfterSeconds?: number): never;
export declare function parseCommand(raw: unknown): Command;
export declare function cellIdFor(projectId: string, gapId: string, workScope: string): string;
export declare function nextStep(cell: Cell): string;
