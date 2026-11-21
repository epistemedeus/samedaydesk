import { z } from "zod";
import { ApiError } from "../../earned-work/src/errors.js";
const boundedText = z.string().trim().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f]/u.test(value));
export const passwordSchema = z.string().min(12).max(128).refine(value => Buffer.byteLength(value, "utf8") <= 512);
export const accountIdSchema = z.string().regex(/^acc_[A-Za-z0-9_-]{16}$/);
export const kernelScopeSchema = z.string().min(1).max(128).regex(/^(?:[A-Za-z0-9_-]+|opportunity:[A-Za-z0-9_-]+)$/);
export const sessionTokenSchema = z.string().regex(/^acs_[A-Za-z0-9_-]{43}$/);
export const recoveryCodeSchema = z.string().regex(/^acr_[A-Za-z0-9_-]{43}$/);
export const signupSchema = z.object({
    password: passwordSchema,
    displayName: boundedText.optional(),
    contactEmail: z.string().trim().email().max(254).optional(),
}).strict();
export const loginSchema = z.object({ accountId: accountIdSchema, password: passwordSchema }).strict();
export const recoverSchema = z.object({ accountId: accountIdSchema, recoveryCode: recoveryCodeSchema, newPassword: passwordSchema }).strict();
export const adoptionSchema = z.object({ kernelScope: kernelScopeSchema, contributorToken: z.string().min(16).max(512).regex(/^[A-Za-z0-9_-]+$/) }).strict();
export const operationProofSchema = z.object({
    idempotencyKey: z.string().min(8).max(120).regex(/^[A-Za-z0-9_-]+$/),
    proof: z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine(value => {
        const bytes = Buffer.from(value, "base64url");
        return bytes.length === 32 && bytes.toString("base64url") === value;
    }),
}).strict();
export const readbackSchema = z.object({
    operation: z.enum(["signup", "login", "recover"]),
    accountId: accountIdSchema.optional(),
}).strict().refine(value => value.operation === "signup" ? value.accountId === undefined : value.accountId !== undefined);
export const receiptSchema = z.object({
    account: z.object({
        accountId: accountIdSchema,
        sessionId: z.string().regex(/^ses_[A-Za-z0-9_-]{16}$/),
        authTime: z.string().datetime(),
        expiresAt: z.string().datetime(),
        publicProfileId: z.string().regex(/^prf_[A-Za-z0-9_-]{16}$/),
    }).strict(),
    sessionToken: sessionTokenSchema,
    recoveryCode: recoveryCodeSchema.optional(),
}).strict();
export function parse(schema, value) {
    const result = schema.safeParse(value);
    if (!result.success)
        throw new ApiError(400, "invalid_input", "Check the account fields and retry proof.");
    return result.data;
}
//# sourceMappingURL=validation.js.map