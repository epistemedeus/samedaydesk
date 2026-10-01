import { hashTermsVersion, TERMS_VERSION_RE, isTermsVersionHash } from "@neomorphic/funded-task-terms/hash";
import { ApiError } from "./errors.js";
/** Shape version of the F01 terms document. Distinct from termsVersion (content hash). */
export const SCHEMA_VERSION = 1;
export const EARNED_WORK_TERMS_SCHEMA = "neomorphic.earned-work.terms.v1";
export { TERMS_VERSION_RE, isTermsVersionHash, hashTermsVersion };
/** F17 complete-fixture golden. Shared by F01/F02/F07/F12/F17 agreement tests. */
export const F17_GOLDEN_TERMS_VERSION = "sha256:c82f232dd9d63261b91d32234abf3e0f655d99182cde7c66b7de5c8c787ea31f";
/**
 * Canonical F01 terms body hashed by F17 `hashTermsVersion`.
 * `termsRevision` is the correction counter (F02 alias), never a public termsVersion.
 */
export function earnedWorkTermsBody(taskId, termsRevision, terms, schemaVersion = SCHEMA_VERSION) {
    return {
        schema: EARNED_WORK_TERMS_SCHEMA,
        schemaVersion,
        taskId,
        termsRevision,
        summary: terms.summary,
        reward: terms.reward,
        claimTtlSeconds: terms.claimTtlSeconds,
        maxArtifactBytes: terms.maxArtifactBytes,
        allowedMediaTypes: terms.allowedMediaTypes,
        slotLimit: terms.slotLimit,
    };
}
export function hashEarnedWorkTerms(taskId, termsRevision, terms, schemaVersion = SCHEMA_VERSION) {
    return hashTermsVersion(earnedWorkTermsBody(taskId, termsRevision, terms, schemaVersion));
}
/** Exact non-secret canonical F01 terms body bound by `termsVersion`. */
export function publicTermsDocument(taskId, terms) {
    return earnedWorkTermsBody(taskId, terms.termsRevision, {
        summary: terms.summary,
        reward: terms.reward,
        claimTtlSeconds: terms.claimTtlSeconds,
        maxArtifactBytes: terms.maxArtifactBytes,
        allowedMediaTypes: terms.allowedMediaTypes,
        slotLimit: terms.slotLimit,
    }, terms.schemaVersion);
}
/**
 * Public claim key. Integers are rejected (no silent dual-key).
 * A one-way adapter that *writes* a hash lives as `hashTermsVersion` / `hashEarnedWorkTerms`.
 */
export function parseClaimTermsVersion(value) {
    if (typeof value === "number") {
        throw new ApiError(400, "invalid_input", "integer termsVersion is rejected; use the sha256 content hash (no dual public key)");
    }
    if (typeof value !== "string" || !TERMS_VERSION_RE.test(value)) {
        throw new ApiError(400, "invalid_input", "termsVersion must be sha256: followed by 64 lowercase hex characters");
    }
    return value;
}
//# sourceMappingURL=terms-version.js.map