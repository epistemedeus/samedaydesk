import {
  ABSOLUTE_BYTES_CAP,
  DEFAULT_MAX_ARTIFACT_BYTES,
  DIGEST_RE,
  ERROR_CODES,
  MEDIA_TYPE_RE,
  REF_MAX,
} from "./constants.mjs";
import { ProgressError } from "./errors.mjs";

/**
 * Bind artifact metadata to its digest. Never fetch artifact.ref.
 * Never execute bytes. This is not a verifier.
 *
 * @param {unknown} artifact
 * @param {{ maxArtifactBytes?: number }} [bounds]
 */
export function bindArtifactDigest(artifact, bounds = {}) {
  if (artifact == null || typeof artifact !== "object") {
    throw new ProgressError(ERROR_CODES.MALFORMED_ARTIFACT, "artifact metadata is required to bind a digest");
  }
  const rec = /** @type {Record<string, unknown>} */ (artifact);
  if (rec.fetch === true || rec.fetchRef === true) {
    throw new ProgressError(ERROR_CODES.FETCH_REF_FORBIDDEN, "bindArtifactDigest never fetches artifact.ref");
  }
  const digestRaw = rec.digestSha256 ?? rec.artifactDigestSha256;
  if (typeof digestRaw !== "string" || !/^[a-fA-F0-9]{64}$/.test(digestRaw.trim())) {
    throw new ProgressError(ERROR_CODES.MALFORMED_ARTIFACT, "digestSha256 must be 64 hex characters");
  }
  const digestSha256 = digestRaw.trim().toLowerCase();
  if (!DIGEST_RE.test(digestSha256)) {
    throw new ProgressError(ERROR_CODES.MALFORMED_ARTIFACT, "digestSha256 must be 64 lowercase hex characters");
  }

  const ref = rec.ref;
  if (typeof ref !== "string" || ref.trim().length < 1 || ref.length > REF_MAX || /[\u0000-\u001f]/.test(ref)) {
    throw new ProgressError(ERROR_CODES.MALFORMED_ARTIFACT, "artifact.ref must be a metadata string (never fetched)");
  }

  const mediaType = rec.mediaType;
  if (typeof mediaType !== "string" || !MEDIA_TYPE_RE.test(mediaType.trim())) {
    throw new ProgressError(ERROR_CODES.MALFORMED_ARTIFACT, "artifact.mediaType must be a type/subtype");
  }

  const bytes = rec.bytes ?? rec.byteLength;
  if (!Number.isInteger(bytes) || bytes < 1) {
    throw new ProgressError(ERROR_CODES.MALFORMED_ARTIFACT, "artifact.bytes must be an integer >= 1");
  }
  const maxArtifactBytes = Number.isInteger(bounds.maxArtifactBytes)
    ? bounds.maxArtifactBytes
    : DEFAULT_MAX_ARTIFACT_BYTES;
  const cap = Math.min(maxArtifactBytes, ABSOLUTE_BYTES_CAP);
  if (bytes > cap) {
    throw new ProgressError(
      ERROR_CODES.OVERSIZE,
      `artifact.bytes ${bytes} exceeds maxArtifactBytes ${cap}`,
    );
  }

  return {
    ref: ref.trim(),
    digestSha256,
    mediaType: mediaType.trim(),
    bytes,
  };
}

export function maxBytesFromTask(task) {
  const terms = task?.terms;
  const constraints = task?.constraints;
  const fromTerms = terms && Number.isInteger(terms.maxArtifactBytes) ? terms.maxArtifactBytes : null;
  const fromConstraints =
    constraints && Number.isInteger(constraints.maxArtifactBytes) ? constraints.maxArtifactBytes : null;
  return fromTerms ?? fromConstraints ?? DEFAULT_MAX_ARTIFACT_BYTES;
}
