import { z } from "zod";
import { ApiError } from "./errors.js";
import { EVENT_KINDS } from "./types.js";
const TITLE_MAX = 120;
const SUMMARY_MAX = 2000;
const TEXT_MAX = 8000;
const URL_MAX = 2048;
const LABEL_MAX = 200;
function rejectUnknownKeys(shape) {
    return z.object(shape).strict();
}
export const createProjectBodySchema = rejectUnknownKeys({
    title: z.string().trim().min(1).max(TITLE_MAX),
    summary: z.string().trim().min(1).max(SUMMARY_MAX),
});
export const createGrantBodySchema = rejectUnknownKeys({
    role: z.enum(["reader", "writer"]),
    expiresAt: z.string().datetime({ offset: true }).optional(),
});
const artifactSchema = rejectUnknownKeys({
    url: z
        .string()
        .max(URL_MAX)
        .refine((value) => {
        try {
            const url = new URL(value);
            return url.protocol === "https:";
        }
        catch {
            return false;
        }
    }, "artifact.url must be an https URL"),
    label: z.string().trim().min(1).max(LABEL_MAX).optional(),
});
export const createEventBodySchema = rejectUnknownKeys({
    kind: z.enum(EVENT_KINDS),
    text: z.string().trim().min(1).max(TEXT_MAX).optional(),
    artifact: artifactSchema.optional(),
    expectedVersion: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
    if ((value.kind === "resolved" || value.kind === "reopened") && value.expectedVersion == null) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "expectedVersion is required for resolved and reopened events",
            path: ["expectedVersion"],
        });
    }
    if (value.kind === "artifact" && !value.artifact) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "artifact is required for artifact events",
            path: ["artifact"],
        });
    }
});
export function parseBody(schema, body) {
    const result = schema.safeParse(body);
    if (!result.success) {
        const message = result.error.issues[0]?.message ?? "invalid input";
        throw new ApiError(400, "invalid_input", message);
    }
    return result.data;
}
export function parseLimit(raw) {
    if (raw == null || raw === "")
        return 25;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new ApiError(400, "invalid_input", "limit must be an integer from 1 to 100");
    }
    return value;
}
export function parseCursor(raw, projectId) {
    if (raw == null || raw === "")
        return 0;
    try {
        if (typeof raw !== "string" || raw.length > 256 || !/^[A-Za-z0-9_-]+$/.test(raw))
            throw new Error();
        const bytes = Buffer.from(raw, "base64url");
        if (bytes.toString("base64url") !== raw)
            throw new Error();
        const value = JSON.parse(bytes.toString("utf8"));
        if (!Array.isArray(value) || value.length !== 2 || value[0] !== projectId ||
            !Number.isSafeInteger(value[1]) || value[1] < 1)
            throw new Error();
        return value[1];
    }
    catch {
        throw new ApiError(400, "invalid_cursor", "cursor is not valid for this project");
    }
}
export function requireIdempotencyKey(value) {
    const key = Array.isArray(value) ? value[0] : value;
    if (!key || typeof key !== "string" || key.trim().length < 8 || key.length > 200) {
        throw new ApiError(400, "invalid_input", "Idempotency-Key header is required");
    }
    return key.trim();
}
//# sourceMappingURL=validation.js.map