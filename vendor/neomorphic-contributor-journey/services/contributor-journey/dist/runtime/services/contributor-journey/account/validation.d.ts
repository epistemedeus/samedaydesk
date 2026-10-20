import { z } from "zod";
export declare const passwordSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const accountIdSchema: z.ZodString;
export declare const kernelScopeSchema: z.ZodString;
export declare const sessionTokenSchema: z.ZodString;
export declare const recoveryCodeSchema: z.ZodString;
export declare const signupSchema: z.ZodObject<{
    password: z.ZodEffects<z.ZodString, string, string>;
    displayName: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    contactEmail: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    password: string;
    displayName?: string | undefined;
    contactEmail?: string | undefined;
}, {
    password: string;
    displayName?: string | undefined;
    contactEmail?: string | undefined;
}>;
export declare const loginSchema: z.ZodObject<{
    accountId: z.ZodString;
    password: z.ZodEffects<z.ZodString, string, string>;
}, "strict", z.ZodTypeAny, {
    accountId: string;
    password: string;
}, {
    accountId: string;
    password: string;
}>;
export declare const recoverSchema: z.ZodObject<{
    accountId: z.ZodString;
    recoveryCode: z.ZodString;
    newPassword: z.ZodEffects<z.ZodString, string, string>;
}, "strict", z.ZodTypeAny, {
    accountId: string;
    recoveryCode: string;
    newPassword: string;
}, {
    accountId: string;
    recoveryCode: string;
    newPassword: string;
}>;
export declare const adoptionSchema: z.ZodObject<{
    kernelScope: z.ZodString;
    contributorToken: z.ZodString;
}, "strict", z.ZodTypeAny, {
    kernelScope: string;
    contributorToken: string;
}, {
    kernelScope: string;
    contributorToken: string;
}>;
export declare const operationProofSchema: z.ZodObject<{
    idempotencyKey: z.ZodString;
    proof: z.ZodEffects<z.ZodString, string, string>;
}, "strict", z.ZodTypeAny, {
    idempotencyKey: string;
    proof: string;
}, {
    idempotencyKey: string;
    proof: string;
}>;
export declare const readbackSchema: z.ZodEffects<z.ZodObject<{
    operation: z.ZodEnum<["signup", "login", "recover"]>;
    accountId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    operation: "signup" | "login" | "recover";
    accountId?: string | undefined;
}, {
    operation: "signup" | "login" | "recover";
    accountId?: string | undefined;
}>, {
    operation: "signup" | "login" | "recover";
    accountId?: string | undefined;
}, {
    operation: "signup" | "login" | "recover";
    accountId?: string | undefined;
}>;
export declare const receiptSchema: z.ZodObject<{
    account: z.ZodObject<{
        accountId: z.ZodString;
        sessionId: z.ZodString;
        authTime: z.ZodString;
        expiresAt: z.ZodString;
        publicProfileId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        expiresAt: string;
        accountId: string;
        sessionId: string;
        authTime: string;
        publicProfileId: string;
    }, {
        expiresAt: string;
        accountId: string;
        sessionId: string;
        authTime: string;
        publicProfileId: string;
    }>;
    sessionToken: z.ZodString;
    recoveryCode: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    account: {
        expiresAt: string;
        accountId: string;
        sessionId: string;
        authTime: string;
        publicProfileId: string;
    };
    sessionToken: string;
    recoveryCode?: string | undefined;
}, {
    account: {
        expiresAt: string;
        accountId: string;
        sessionId: string;
        authTime: string;
        publicProfileId: string;
    };
    sessionToken: string;
    recoveryCode?: string | undefined;
}>;
export declare function parse<T>(schema: z.ZodType<T>, value: unknown): T;
