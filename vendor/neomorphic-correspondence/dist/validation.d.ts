import { z } from "zod";
export declare const createProjectBodySchema: z.ZodObject<{
    title: z.ZodString;
    summary: z.ZodString;
}, "strict", z.ZodTypeAny, {
    title: string;
    summary: string;
}, {
    title: string;
    summary: string;
}>;
export declare const createGrantBodySchema: z.ZodObject<{
    role: z.ZodEnum<["reader", "writer"]>;
    expiresAt: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    role: "reader" | "writer";
    expiresAt?: string | undefined;
}, {
    role: "reader" | "writer";
    expiresAt?: string | undefined;
}>;
export declare const createEventBodySchema: z.ZodEffects<z.ZodObject<{
    kind: z.ZodEnum<["request", "reply", "artifact", "correction", "needs_human", "resolved", "reopened"]>;
    text: z.ZodOptional<z.ZodString>;
    artifact: z.ZodOptional<z.ZodObject<{
        url: z.ZodEffects<z.ZodString, string, string>;
        label: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        url: string;
        label?: string | undefined;
    }, {
        url: string;
        label?: string | undefined;
    }>>;
    expectedVersion: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    kind: "request" | "reply" | "artifact" | "correction" | "needs_human" | "resolved" | "reopened";
    artifact?: {
        url: string;
        label?: string | undefined;
    } | undefined;
    text?: string | undefined;
    expectedVersion?: number | undefined;
}, {
    kind: "request" | "reply" | "artifact" | "correction" | "needs_human" | "resolved" | "reopened";
    artifact?: {
        url: string;
        label?: string | undefined;
    } | undefined;
    text?: string | undefined;
    expectedVersion?: number | undefined;
}>, {
    kind: "request" | "reply" | "artifact" | "correction" | "needs_human" | "resolved" | "reopened";
    artifact?: {
        url: string;
        label?: string | undefined;
    } | undefined;
    text?: string | undefined;
    expectedVersion?: number | undefined;
}, {
    kind: "request" | "reply" | "artifact" | "correction" | "needs_human" | "resolved" | "reopened";
    artifact?: {
        url: string;
        label?: string | undefined;
    } | undefined;
    text?: string | undefined;
    expectedVersion?: number | undefined;
}>;
export declare function parseBody<T>(schema: z.ZodType<T>, body: unknown): T;
export declare function parseLimit(raw: unknown): number;
export declare function parseCursor(raw: unknown, projectId: string): number;
export declare function requireIdempotencyKey(value: string | string[] | undefined): string;
