import { z } from "zod";
import type { ErrorCode, Command } from "./types.js";
export declare class DiscussionError extends Error {
    readonly code: ErrorCode;
    constructor(code: ErrorCode);
}
export declare const idSchema: z.ZodString;
export declare const commandSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"post">;
    body: z.ZodEffects<z.ZodString, string, string>;
    audience: z.ZodOptional<z.ZodEnum<["private", "public"]>>;
    consent: z.ZodOptional<z.ZodObject<{
        confirmed: z.ZodLiteral<true>;
        version: z.ZodLiteral<"discussion-public-v1">;
    }, "strict", z.ZodTypeAny, {
        confirmed: true;
        version: "discussion-public-v1";
    }, {
        confirmed: true;
        version: "discussion-public-v1";
    }>>;
}, "strict", z.ZodTypeAny, {
    body: string;
    kind: "post";
    consent?: {
        confirmed: true;
        version: "discussion-public-v1";
    } | undefined;
    audience?: "public" | "private" | undefined;
}, {
    body: string;
    kind: "post";
    consent?: {
        confirmed: true;
        version: "discussion-public-v1";
    } | undefined;
    audience?: "public" | "private" | undefined;
}>, z.ZodObject<{
    body: z.ZodEffects<z.ZodString, string, string>;
    postId: z.ZodString;
    expectedVersion: z.ZodNumber;
    kind: z.ZodLiteral<"edit">;
}, "strict", z.ZodTypeAny, {
    body: string;
    kind: "edit";
    expectedVersion: number;
    postId: string;
}, {
    body: string;
    kind: "edit";
    expectedVersion: number;
    postId: string;
}>, z.ZodObject<{
    text: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    consent: z.ZodObject<{
        confirmed: z.ZodLiteral<true>;
        version: z.ZodLiteral<"discussion-public-v1">;
    }, "strict", z.ZodTypeAny, {
        confirmed: true;
        version: "discussion-public-v1";
    }, {
        confirmed: true;
        version: "discussion-public-v1";
    }>;
    postId: z.ZodString;
    expectedVersion: z.ZodNumber;
    kind: z.ZodLiteral<"publish_excerpt">;
}, "strict", z.ZodTypeAny, {
    kind: "publish_excerpt";
    text: string;
    expectedVersion: number;
    consent: {
        confirmed: true;
        version: "discussion-public-v1";
    };
    postId: string;
}, {
    kind: "publish_excerpt";
    text: string;
    expectedVersion: number;
    consent: {
        confirmed: true;
        version: "discussion-public-v1";
    };
    postId: string;
}>, z.ZodObject<{
    postId: z.ZodString;
    expectedVersion: z.ZodNumber;
    kind: z.ZodLiteral<"withdraw">;
}, "strict", z.ZodTypeAny, {
    kind: "withdraw";
    expectedVersion: number;
    postId: string;
}, {
    kind: "withdraw";
    expectedVersion: number;
    postId: string;
}>, z.ZodObject<{
    postId: z.ZodString;
    expectedVersion: z.ZodNumber;
    kind: z.ZodLiteral<"remove">;
}, "strict", z.ZodTypeAny, {
    kind: "remove";
    expectedVersion: number;
    postId: string;
}, {
    kind: "remove";
    expectedVersion: number;
    postId: string;
}>, z.ZodObject<{
    decision: z.ZodEnum<["approve", "hide"]>;
    reason: z.ZodOptional<z.ZodEnum<["privacy", "spam", "abuse", "off_topic"]>>;
    postId: z.ZodString;
    expectedVersion: z.ZodNumber;
    kind: z.ZodLiteral<"moderate">;
}, "strict", z.ZodTypeAny, {
    kind: "moderate";
    expectedVersion: number;
    decision: "approve" | "hide";
    postId: string;
    reason?: "privacy" | "spam" | "abuse" | "off_topic" | undefined;
}, {
    kind: "moderate";
    expectedVersion: number;
    decision: "approve" | "hide";
    postId: string;
    reason?: "privacy" | "spam" | "abuse" | "off_topic" | undefined;
}>, z.ZodObject<{
    reason: z.ZodEnum<["privacy", "spam", "abuse", "off_topic"]>;
    postId: z.ZodString;
    expectedVersion: z.ZodNumber;
    kind: z.ZodLiteral<"report">;
}, "strict", z.ZodTypeAny, {
    reason: "privacy" | "spam" | "abuse" | "off_topic";
    kind: "report";
    expectedVersion: number;
    postId: string;
}, {
    reason: "privacy" | "spam" | "abuse" | "off_topic";
    kind: "report";
    expectedVersion: number;
    postId: string;
}>]>;
export declare const profileSchema: z.ZodObject<{
    profileId: z.ZodString;
    displayName: z.ZodString;
    visibilityConsentVersion: z.ZodString;
}, "strict", z.ZodTypeAny, {
    profileId: string;
    displayName: string;
    visibilityConsentVersion: string;
}, {
    profileId: string;
    displayName: string;
    visibilityConsentVersion: string;
}>;
export declare const entrySchema: z.ZodObject<{
    schema: z.ZodLiteral<"contributor-discussion-v1">;
    taskId: z.ZodString;
    actorAccountId: z.ZodString;
    operationId: z.ZodString;
    requestDigest: z.ZodString;
    command: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"post">;
        body: z.ZodEffects<z.ZodString, string, string>;
        audience: z.ZodOptional<z.ZodEnum<["private", "public"]>>;
        consent: z.ZodOptional<z.ZodObject<{
            confirmed: z.ZodLiteral<true>;
            version: z.ZodLiteral<"discussion-public-v1">;
        }, "strict", z.ZodTypeAny, {
            confirmed: true;
            version: "discussion-public-v1";
        }, {
            confirmed: true;
            version: "discussion-public-v1";
        }>>;
    }, "strict", z.ZodTypeAny, {
        body: string;
        kind: "post";
        consent?: {
            confirmed: true;
            version: "discussion-public-v1";
        } | undefined;
        audience?: "public" | "private" | undefined;
    }, {
        body: string;
        kind: "post";
        consent?: {
            confirmed: true;
            version: "discussion-public-v1";
        } | undefined;
        audience?: "public" | "private" | undefined;
    }>, z.ZodObject<{
        body: z.ZodEffects<z.ZodString, string, string>;
        postId: z.ZodString;
        expectedVersion: z.ZodNumber;
        kind: z.ZodLiteral<"edit">;
    }, "strict", z.ZodTypeAny, {
        body: string;
        kind: "edit";
        expectedVersion: number;
        postId: string;
    }, {
        body: string;
        kind: "edit";
        expectedVersion: number;
        postId: string;
    }>, z.ZodObject<{
        text: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
        consent: z.ZodObject<{
            confirmed: z.ZodLiteral<true>;
            version: z.ZodLiteral<"discussion-public-v1">;
        }, "strict", z.ZodTypeAny, {
            confirmed: true;
            version: "discussion-public-v1";
        }, {
            confirmed: true;
            version: "discussion-public-v1";
        }>;
        postId: z.ZodString;
        expectedVersion: z.ZodNumber;
        kind: z.ZodLiteral<"publish_excerpt">;
    }, "strict", z.ZodTypeAny, {
        kind: "publish_excerpt";
        text: string;
        expectedVersion: number;
        consent: {
            confirmed: true;
            version: "discussion-public-v1";
        };
        postId: string;
    }, {
        kind: "publish_excerpt";
        text: string;
        expectedVersion: number;
        consent: {
            confirmed: true;
            version: "discussion-public-v1";
        };
        postId: string;
    }>, z.ZodObject<{
        postId: z.ZodString;
        expectedVersion: z.ZodNumber;
        kind: z.ZodLiteral<"withdraw">;
    }, "strict", z.ZodTypeAny, {
        kind: "withdraw";
        expectedVersion: number;
        postId: string;
    }, {
        kind: "withdraw";
        expectedVersion: number;
        postId: string;
    }>, z.ZodObject<{
        postId: z.ZodString;
        expectedVersion: z.ZodNumber;
        kind: z.ZodLiteral<"remove">;
    }, "strict", z.ZodTypeAny, {
        kind: "remove";
        expectedVersion: number;
        postId: string;
    }, {
        kind: "remove";
        expectedVersion: number;
        postId: string;
    }>, z.ZodObject<{
        decision: z.ZodEnum<["approve", "hide"]>;
        reason: z.ZodOptional<z.ZodEnum<["privacy", "spam", "abuse", "off_topic"]>>;
        postId: z.ZodString;
        expectedVersion: z.ZodNumber;
        kind: z.ZodLiteral<"moderate">;
    }, "strict", z.ZodTypeAny, {
        kind: "moderate";
        expectedVersion: number;
        decision: "approve" | "hide";
        postId: string;
        reason?: "privacy" | "spam" | "abuse" | "off_topic" | undefined;
    }, {
        kind: "moderate";
        expectedVersion: number;
        decision: "approve" | "hide";
        postId: string;
        reason?: "privacy" | "spam" | "abuse" | "off_topic" | undefined;
    }>, z.ZodObject<{
        reason: z.ZodEnum<["privacy", "spam", "abuse", "off_topic"]>;
        postId: z.ZodString;
        expectedVersion: z.ZodNumber;
        kind: z.ZodLiteral<"report">;
    }, "strict", z.ZodTypeAny, {
        reason: "privacy" | "spam" | "abuse" | "off_topic";
        kind: "report";
        expectedVersion: number;
        postId: string;
    }, {
        reason: "privacy" | "spam" | "abuse" | "off_topic";
        kind: "report";
        expectedVersion: number;
        postId: string;
    }>]>;
    profile: z.ZodNullable<z.ZodObject<{
        profileId: z.ZodString;
        displayName: z.ZodString;
        visibilityConsentVersion: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        profileId: string;
        displayName: string;
        visibilityConsentVersion: string;
    }, {
        profileId: string;
        displayName: string;
        visibilityConsentVersion: string;
    }>>;
}, "strict", z.ZodTypeAny, {
    taskId: string;
    schema: "contributor-discussion-v1";
    actorAccountId: string;
    operationId: string;
    requestDigest: string;
    command: {
        body: string;
        kind: "post";
        consent?: {
            confirmed: true;
            version: "discussion-public-v1";
        } | undefined;
        audience?: "public" | "private" | undefined;
    } | {
        body: string;
        kind: "edit";
        expectedVersion: number;
        postId: string;
    } | {
        kind: "publish_excerpt";
        text: string;
        expectedVersion: number;
        consent: {
            confirmed: true;
            version: "discussion-public-v1";
        };
        postId: string;
    } | {
        kind: "withdraw";
        expectedVersion: number;
        postId: string;
    } | {
        kind: "remove";
        expectedVersion: number;
        postId: string;
    } | {
        kind: "moderate";
        expectedVersion: number;
        decision: "approve" | "hide";
        postId: string;
        reason?: "privacy" | "spam" | "abuse" | "off_topic" | undefined;
    } | {
        reason: "privacy" | "spam" | "abuse" | "off_topic";
        kind: "report";
        expectedVersion: number;
        postId: string;
    };
    profile: {
        profileId: string;
        displayName: string;
        visibilityConsentVersion: string;
    } | null;
}, {
    taskId: string;
    schema: "contributor-discussion-v1";
    actorAccountId: string;
    operationId: string;
    requestDigest: string;
    command: {
        body: string;
        kind: "post";
        consent?: {
            confirmed: true;
            version: "discussion-public-v1";
        } | undefined;
        audience?: "public" | "private" | undefined;
    } | {
        body: string;
        kind: "edit";
        expectedVersion: number;
        postId: string;
    } | {
        kind: "publish_excerpt";
        text: string;
        expectedVersion: number;
        consent: {
            confirmed: true;
            version: "discussion-public-v1";
        };
        postId: string;
    } | {
        kind: "withdraw";
        expectedVersion: number;
        postId: string;
    } | {
        kind: "remove";
        expectedVersion: number;
        postId: string;
    } | {
        kind: "moderate";
        expectedVersion: number;
        decision: "approve" | "hide";
        postId: string;
        reason?: "privacy" | "spam" | "abuse" | "off_topic" | undefined;
    } | {
        reason: "privacy" | "spam" | "abuse" | "off_topic";
        kind: "report";
        expectedVersion: number;
        postId: string;
    };
    profile: {
        profileId: string;
        displayName: string;
        visibilityConsentVersion: string;
    } | null;
}>;
export declare function parseCommand(input: unknown): Command;
/** Deliberately conservative for obvious credentials and identifying/financial text.
 * The injected policy additionally handles deployment-known secrets and privacy rules. */
export declare function safeText(text: string, audience: "private" | "public"): boolean;
