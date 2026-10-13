import { z } from 'zod';
import { hashRequest } from '../../earned-work/src/crypto.js';
import { digestSha256Hex, REPRODUCTION_EVIDENCE_MAX_BYTES } from '../../earned-work/src/evidence.js';
export const MAX_EVIDENCE_BYTES = REPRODUCTION_EVIDENCE_MAX_BYTES;
export const MAX_REQUEST_BYTES = 32_768;
export const opaqueId = z.string().min(1).max(160).regex(/^[A-Za-z0-9_:.\-]+$/);
export const keySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_:.-]+$/);
export const evidenceSchema = z.object({
    format: z.enum(['plaintext', 'json', 'source']),
    body: z.string().min(1).max(MAX_EVIDENCE_BYTES),
    sourceReferences: z.array(z.string().min(1).max(1024)).max(8),
}).strict();
export const saveSchema = z.object({
    reservationId: opaqueId, termsVersion: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    expectedRevision: z.number().int().min(0).max(1_000_000),
    evidence: evidenceSchema,
}).strict();
export const submitSchema = z.object({ reservationId: opaqueId, expectedRevision: z.number().int().min(1).max(1_000_000) }).strict();
export class SubmissionError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export function refuse(code, message) { throw new SubmissionError(code, message); }
// Conservative rejection of recognizable credential material; never echo matched values.
// This is input hygiene, not a claim that all private information can be detected.
export function rejectSecrets(value) {
    if (/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\b(?:sk_(?:live|test)_[A-Za-z0-9]+|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|ew_ctr_[A-Za-z0-9_-]{20,})\b/i.test(value) ||
        /(?:authorization\s*[:=]\s*["']?bearer\s+\S+|(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|owner[_ -]?token|secret|seed[_ -]?phrase|private[_ -]?key)\s*["']?\s*[:=]\s*["']?[^\s"',}\]]{3,})/i.test(value)) {
        refuse('secret_detected', 'Remove credentials or secret material before saving evidence.');
    }
}
function safeReference(raw) {
    rejectSecrets(raw);
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        return refuse('invalid_input', 'Source references must be HTTPS URLs.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || /[\u0000-\u0020\u007f]/.test(raw)) {
        refuse('invalid_input', 'Use HTTPS references without credentials, fragments or whitespace.');
    }
    if (url.search)
        refuse('invalid_input', 'Source references must not include query parameters.');
    return url.href;
}
export function encodeEvidence(input, taskFamily = 'kernel') {
    const parsed = evidenceSchema.safeParse(input);
    if (!parsed.success)
        refuse('invalid_input', 'Provide bounded plaintext, JSON or source evidence.');
    rejectSecrets(input.body);
    const sources = input.sourceReferences.map(safeReference);
    if (taskFamily === 'opportunity' && (input.format !== 'json' || sources.length))
        refuse('invalid_input', 'This task requires its exact JSON evidence document. Include source references in that document.');
    if (input.format === 'source' && sources.length === 0)
        refuse('invalid_input', 'Source evidence needs at least one reference and a description.');
    if (input.format === 'json') {
        let data;
        try {
            data = JSON.parse(input.body);
        }
        catch {
            return refuse('invalid_input', 'Evidence JSON must be valid JSON.');
        }
        // Decode JSON escapes before scanning credential names and values.
        rejectSecrets(JSON.stringify(data));
        if (taskFamily === 'opportunity') {
            if (!data || typeof data !== 'object' || Array.isArray(data))
                refuse('invalid_input', 'Opportunity evidence must be an object.');
            return { content: JSON.stringify(data), mediaType: 'application/json', sources };
        }
        return { content: JSON.stringify({ schema: 'neomorphic.submission-evidence.v1', data, sourceReferences: sources }), mediaType: 'application/json', sources };
    }
    return {
        content: input.body + (sources.length ? '\n\nSource references (not fetched):\n' + sources.join('\n') : ''),
        mediaType: 'text/plain', sources,
    };
}
export function boundedEvidence(input, claim) {
    const encoded = encodeEvidence(input, claim.taskFamily);
    const bytes = Buffer.byteLength(encoded.content, 'utf8');
    if (bytes > Math.min(MAX_EVIDENCE_BYTES, claim.maxArtifactBytes))
        refuse('oversize', 'Evidence exceeds this claim’s byte limit.');
    if (!claim.allowedMediaTypes.includes(encoded.mediaType))
        refuse('invalid_input', 'This evidence format is not allowed by the claimed terms.');
    return { ...encoded, bytes, digest: digestSha256Hex(Buffer.from(encoded.content, 'utf8')) };
}
const draftSchema = z.object({
    taskFamily: z.enum(['kernel', 'opportunity']).optional(),
    accountId: opaqueId, taskId: opaqueId, reservationId: opaqueId, termsId: opaqueId,
    termsVersion: z.string().regex(/^sha256:[0-9a-f]{64}$/), revision: z.number().int().min(1).max(1_000_000),
    evidence: evidenceSchema, updatedAt: z.string().datetime(),
}).strict();
const frozenSchema = z.object({
    taskFamily: z.enum(['kernel', 'opportunity']).optional(),
    artifactId: opaqueId, artifact: z.object({ ref: z.string().max(1024), digestSha256: z.string().regex(/^[0-9a-f]{64}$/), mediaType: z.enum(['text/plain', 'application/json']), bytes: z.number().int().min(1).max(MAX_EVIDENCE_BYTES) }).strict(),
    content: z.string().min(1).max(MAX_EVIDENCE_BYTES), sourceReferences: z.array(z.string()).max(8),
    accountId: opaqueId, taskId: opaqueId, reservationId: opaqueId, termsId: opaqueId,
    termsVersion: z.string().regex(/^sha256:[0-9a-f]{64}$/), revision: z.number().int().min(1),
    kernelIdempotencyKey: keySchema, requestHash: z.string().regex(/^[0-9a-f]{64}$/), frozenAt: z.string().datetime(),
}).strict();
export function parseRecord(raw) {
    const parsed = z.object({ draft: draftSchema, frozen: frozenSchema.nullable() }).strict().safeParse(raw);
    if (!parsed.success)
        refuse('storage_invalid', 'Stored draft is malformed; no delivery was attempted.');
    const record = parsed.data;
    const encoded = encodeEvidence(record.draft.evidence, record.draft.taskFamily);
    if (Buffer.byteLength(encoded.content) > MAX_EVIDENCE_BYTES)
        refuse('storage_invalid', 'Stored evidence exceeds the limit.');
    if (record.frozen)
        assertFrozen(record.frozen, record);
    return record;
}
export function assertFrozen(frozen, record) {
    const draft = record.draft;
    const encoded = encodeEvidence(draft.evidence, draft.taskFamily);
    for (const field of ['accountId', 'taskId', 'reservationId', 'termsId', 'termsVersion', 'revision', 'taskFamily']) {
        if (draft[field] !== frozen[field])
            refuse('storage_invalid', 'Stored delivery identity does not match its draft.');
    }
    if (frozen.content !== encoded.content || frozen.artifact.mediaType !== encoded.mediaType ||
        JSON.stringify(frozen.sourceReferences) !== JSON.stringify(encoded.sources) ||
        frozen.artifact.ref !== `journey-artifact:${frozen.artifactId}` ||
        frozen.artifact.bytes !== Buffer.byteLength(frozen.content) ||
        frozen.artifact.digestSha256 !== digestSha256Hex(Buffer.from(frozen.content)) ||
        frozen.requestHash !== hashRequest({ reservationId: frozen.reservationId, artifact: frozen.artifact, evidenceBase64: Buffer.from(frozen.content).toString('base64') })) {
        refuse('storage_invalid', 'Stored delivery bytes do not match the immutable artifact.');
    }
}
//# sourceMappingURL=validation.js.map