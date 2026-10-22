import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const canonicalSchema = z.object({
    schema: z.literal('neomorphic.original-continuation.canonical.v1'), roundKey: id, claimId: id, provenance: z.enum(['test', 'fixture', 'production']),
    claim: z.object({ id, termsVersion: version, status: z.string().min(1).max(32), offerKey: id, expiresAt: z.string().datetime(), deferStart: z.boolean() }).strict(),
    terms: z.record(z.unknown()),
    submission: z.object({ id, claimId: id, termsVersion: version, artifact: z.object({ ref: z.string().min(1).max(2048), digestSha256: digest,
            mediaType: z.string().min(1).max(200), bytes: z.number().int().nonnegative().max(1000000) }).strict(), submittedAt: z.string().datetime() }).strict().nullable(),
    obligation: z.object({ id, claimId: id, termsVersion: version, settlementKey: z.string().min(1).max(512), payoutState: z.literal('owed'), paid: z.literal(false) }).strict().nullable(),
    operation: z.object({ key: z.string().min(1).max(200), requestHash: digest, statusCode: z.number().int().min(200).max(599) }).strict().nullable(),
}).strict();
export class ContinuationError extends Error {
    code;
    status;
    constructor(code, status) {
        super(code);
        this.code = code;
        this.status = status;
    }
}
export const CONSENT_VERSION = 'original-continuation/v1';
//# sourceMappingURL=types.js.map