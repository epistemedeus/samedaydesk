import type { Artifact } from "./types.js";
/** Decoded inline reproduction evidence cap. Fits under the 32KiB HTTP body limit. */
export declare const REPRODUCTION_EVIDENCE_MAX_BYTES = 16384;
export declare const REPRODUCTION_EVIDENCE_MEDIA_TYPE = "application/json";
export declare const EVIDENCE_BASE64_MAX_CHARS: number;
export declare function digestSha256Hex(bytes: Uint8Array): string;
export declare function decodeEvidenceBase64(raw: string, maxBytes?: number): Buffer;
export declare function bindReceivedEvidence(artifact: Artifact, bytes: Buffer): void;
export declare function receivedEvidenceMatches(artifact: Artifact, bytes: Buffer | Uint8Array | null | undefined): boolean;
export declare function asEvidenceBuffer(value: unknown): Buffer | null;
