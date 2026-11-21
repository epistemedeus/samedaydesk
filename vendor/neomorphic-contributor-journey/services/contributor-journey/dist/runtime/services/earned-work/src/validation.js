import { z } from "zod";
import { ApiError } from "./errors.js";
import { assertDecimal } from "./decimal.js";
import { EVIDENCE_BASE64_MAX_CHARS } from "./evidence.js";
import { PROVENANCES, VERDICT_OUTCOMES } from "./types.js";
const TITLE_MAX = 120;
const SUMMARY_MAX = 2000;
const REF_MAX = 2048;
const MEDIA_MAX = 200;
const PUBLIC_ID_MAX = 120;
const DEST_MAX = 200;
const ABSOLUTE_BYTES_CAP = 1_000_000;
function rejectUnknownKeys(shape) {
    return z.object(shape).strict();
}
const decimalString = z
    .string()
    .min(1)
    .max(40)
    .refine((value) => {
    try {
        assertDecimal(value);
        return true;
    }
    catch {
        return false;
    }
}, "must be an atomic decimal string (never a float)");
const rewardSchema = rejectUnknownKeys({
    amount: decimalString,
    asset: z.string().trim().min(1).max(32),
    network: z.string().trim().min(1).max(64),
});
const mediaTypeSchema = z
    .string()
    .trim()
    .min(1)
    .max(MEDIA_MAX)
    .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i, "mediaType must be a type/subtype");
const digestSchema = z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/, "digestSha256 must be 64 hex characters")
    .transform((value) => value.toLowerCase());
export const createTaskBodySchema = rejectUnknownKeys({
    title: z.string().trim().min(1).max(TITLE_MAX),
    summary: z.string().trim().min(1).max(SUMMARY_MAX),
    provenance: z.enum(PROVENANCES),
    reward: rewardSchema,
    budget: rewardSchema,
    correctionPolicy: rejectUnknownKeys({
        maxRevisions: z.number().int().min(0).max(1).optional(),
    }).optional(),
    terms: rejectUnknownKeys({
        summary: z.string().trim().min(1).max(SUMMARY_MAX).optional(),
        claimTtlSeconds: z.number().int().min(1).max(86_400).optional(),
        maxArtifactBytes: z.number().int().min(1).max(ABSOLUTE_BYTES_CAP).optional(),
        allowedMediaTypes: z.array(mediaTypeSchema).min(1).max(16).optional(),
        slotLimit: z.number().int().min(1).max(1).optional(),
    }).optional(),
});
export const addTermsBodySchema = rejectUnknownKeys({
    summary: z.string().trim().min(1).max(SUMMARY_MAX),
    reward: rewardSchema,
    claimTtlSeconds: z.number().int().min(1).max(86_400).optional(),
    maxArtifactBytes: z.number().int().min(1).max(ABSOLUTE_BYTES_CAP).optional(),
    allowedMediaTypes: z.array(mediaTypeSchema).min(1).max(16).optional(),
    slotLimit: z.number().int().min(1).max(1).optional(),
});
export const reserveFundingBodySchema = rejectUnknownKeys({});
export const contributorTokenBodySchema = rejectUnknownKeys({
    contributorPublicId: z.string().trim().min(1).max(PUBLIC_ID_MAX),
    payoutDestination: z.string().trim().min(1).max(DEST_MAX).optional(),
    taskId: z.string().trim().min(1).max(128).optional(),
    provenance: z.enum(PROVENANCES),
    expiresAt: z.string().datetime({ offset: true }).optional(),
});
export const claimBodySchema = rejectUnknownKeys({
    termsVersion: z.unknown(),
});
export const artifactSchema = rejectUnknownKeys({
    ref: z
        .string()
        .trim()
        .min(1)
        .max(REF_MAX)
        .refine((value) => !/[\u0000-\u001f]/.test(value), "artifact.ref must not contain control characters"),
    digestSha256: digestSchema,
    mediaType: mediaTypeSchema,
    bytes: z.number().int().min(1).max(ABSOLUTE_BYTES_CAP),
});
export const submitBodySchema = rejectUnknownKeys({
    reservationId: z.string().trim().min(1).max(128),
    artifact: artifactSchema,
    evidenceBase64: z.string().min(1).max(EVIDENCE_BASE64_MAX_CHARS).optional(),
});
export const verdictBodySchema = rejectUnknownKeys({
    reservationId: z.string().trim().min(1).max(128),
    outcome: z.enum(VERDICT_OUTCOMES).optional(),
    artifactDigestSha256: digestSchema.optional(),
});
export const acceptBodySchema = rejectUnknownKeys({
    reservationId: z.string().trim().min(1).max(128),
    artifactDigestSha256: digestSchema.optional(),
    verdictId: z.string().trim().min(1).max(128).optional(),
});
export const rejectBodySchema = rejectUnknownKeys({
    reservationId: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(1).max(SUMMARY_MAX),
});
export function parseBody(schema, body) {
    const result = schema.safeParse(body);
    if (!result.success) {
        const message = result.error.issues[0]?.message ?? "invalid input";
        throw new ApiError(400, "invalid_input", message);
    }
    return result.data;
}
export function requireIdempotencyKey(value) {
    const key = Array.isArray(value) ? value[0] : value;
    if (!key || typeof key !== "string" || key.trim().length < 8 || key.length > 200) {
        throw new ApiError(400, "invalid_input", "Idempotency-Key header is required");
    }
    return key.trim();
}
export const DEFAULT_CLAIM_TTL_SECONDS = 3600;
export const DEFAULT_MAX_ARTIFACT_BYTES = 65_536;
export const DEFAULT_MEDIA_TYPES = ["text/plain", "application/json"];
export const DEFAULT_SLOT_LIMIT = 1;
export const DEFAULT_CORRECTION_MAX_REVISIONS = 1;
//# sourceMappingURL=validation.js.map