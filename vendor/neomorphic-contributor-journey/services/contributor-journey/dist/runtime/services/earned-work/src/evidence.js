import { createHash } from "node:crypto";
import { ApiError } from "./errors.js";
/** Decoded inline reproduction evidence cap. Fits under the 32KiB HTTP body limit. */
export const REPRODUCTION_EVIDENCE_MAX_BYTES = 16_384;
export const REPRODUCTION_EVIDENCE_MEDIA_TYPE = "application/json";
export const EVIDENCE_BASE64_MAX_CHARS = Math.ceil(REPRODUCTION_EVIDENCE_MAX_BYTES / 3) * 4;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
export function digestSha256Hex(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
export function decodeEvidenceBase64(raw, maxBytes = REPRODUCTION_EVIDENCE_MAX_BYTES) {
    if (typeof raw !== "string" || raw.length === 0) {
        throw new ApiError(400, "invalid_input", "evidenceBase64 must be a non-empty base64 string");
    }
    if (raw.length > EVIDENCE_BASE64_MAX_CHARS) {
        throw new ApiError(400, "oversize", "evidenceBase64 exceeds the decoded byte limit");
    }
    if (raw.length % 4 !== 0 || !BASE64_RE.test(raw)) {
        throw new ApiError(400, "invalid_input", "evidenceBase64 must be standard base64");
    }
    const bytes = Buffer.from(raw, "base64");
    if (bytes.byteLength < 1) {
        throw new ApiError(400, "invalid_input", "evidenceBase64 decoded to empty bytes");
    }
    if (bytes.byteLength > maxBytes) {
        throw new ApiError(400, "oversize", `decoded evidence exceeds ${maxBytes} bytes`);
    }
    if (bytes.toString("base64") !== raw) {
        throw new ApiError(400, "invalid_input", "evidenceBase64 is not a strict encoding of the decoded bytes");
    }
    return bytes;
}
export function bindReceivedEvidence(artifact, bytes) {
    if (bytes.byteLength !== artifact.bytes) {
        throw new ApiError(400, "invalid_input", "decoded evidence length does not match artifact.bytes");
    }
    if (digestSha256Hex(bytes) !== artifact.digestSha256) {
        throw new ApiError(400, "invalid_input", "decoded evidence digest does not match artifact.digestSha256");
    }
}
export function receivedEvidenceMatches(artifact, bytes) {
    if (!bytes || bytes.byteLength < 1)
        return false;
    if (bytes.byteLength !== artifact.bytes)
        return false;
    return digestSha256Hex(bytes) === artifact.digestSha256;
}
export function asEvidenceBuffer(value) {
    if (value == null)
        return null;
    if (Buffer.isBuffer(value))
        return value.byteLength > 0 ? value : null;
    if (value instanceof Uint8Array) {
        return value.byteLength > 0 ? Buffer.from(value) : null;
    }
    return null;
}
//# sourceMappingURL=evidence.js.map