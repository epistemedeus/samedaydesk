import { publicationText } from "../showcase/validation.js";
import { z } from "zod";
export class DiscussionError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const text = z.string().trim().min(1).max(2000).refine(value => Buffer.byteLength(value, "utf8") <= 6000 && !/[\x00-\x08\x0b-\x1f\x7f]/.test(value));
const excerpt = text.refine(value => value.length <= 800);
const consent = z.object({ confirmed: z.literal(true), version: z.literal("discussion-public-v1") }).strict();
const target = { postId: idSchema, expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) };
const reason = z.enum(["privacy", "spam", "abuse", "off_topic"]);
export const commandSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("post"), body: text, audience: z.enum(["private", "public"]).optional(), consent: consent.optional() }).strict(),
    z.object({ kind: z.literal("edit"), ...target, body: text }).strict(),
    z.object({ kind: z.literal("publish_excerpt"), ...target, text: excerpt, consent }).strict(),
    z.object({ kind: z.literal("withdraw"), ...target }).strict(),
    z.object({ kind: z.literal("remove"), ...target }).strict(),
    z.object({ kind: z.literal("moderate"), ...target, decision: z.enum(["approve", "hide"]), reason: reason.optional() }).strict(),
    z.object({ kind: z.literal("report"), ...target, reason }).strict(),
]);
export const profileSchema = z.object({
    profileId: idSchema, displayName: z.string().trim().min(1).max(80), visibilityConsentVersion: idSchema,
}).strict();
export const entrySchema = z.object({
    schema: z.literal("contributor-discussion-v1"), taskId: idSchema, actorAccountId: idSchema,
    operationId: z.string().regex(/^[a-f0-9]{64}$/), requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
    command: commandSchema, profile: profileSchema.nullable(),
}).strict();
export function parseCommand(input) {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success)
        throw new DiscussionError("invalid_input");
    const command = parsed.data;
    if (command.kind === "post" && ((command.audience === "public") !== !!command.consent)) {
        throw new DiscussionError("invalid_input");
    }
    if (command.kind === "moderate" && ((command.decision === "hide") !== !!command.reason)) {
        throw new DiscussionError("invalid_input");
    }
    return command;
}
/** Deliberately conservative for obvious credentials and identifying/financial text.
 * The injected policy additionally handles deployment-known secrets and privacy rules. */
export function safeText(text, audience) {
    if (audience === "public" && !publicationText(text, 6000))
        return false;
    if (/-----BEGIN .*PRIVATE KEY-----|\b(?:sk|ghp|github_pat|neo_(?:wtr|rdr))[-_][A-Za-z0-9_-]{10,}|\bBearer\s+\S+|\b(?:password|api[_ -]?key|secret|access[_ -]?token)\s*[:=]\s*\S+/i.test(text))
        return false;
    if (audience === "public" && /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b0x[a-f0-9]{40,64}\b|\b(?:https?:\/\/|www\.)\S+|\b(?:\d+(?:\.\d+)?\s*(?:USDC|USD|ETH|BTC)|(?:USDC|USD|ETH|BTC)\s*\d+(?:\.\d+)?)\b|[$€£]\s*\d|\+?\d[\d ()-]{7,}\d/i.test(text))
        return false;
    return true;
}
//# sourceMappingURL=validation.js.map