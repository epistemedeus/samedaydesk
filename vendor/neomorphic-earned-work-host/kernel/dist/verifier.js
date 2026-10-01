export const DEFAULT_VERIFIER_VERSION = "earned-work.default-verifier.v1";
export const OWNER_VERIFIER_VERSION = "earned-work.owner-explicit.v1";
export const DEFAULT_VERIFIER_PASS_REASON = "digest, mediaType, and bytes are within terms bounds; this is not a reproduction of the submitted work";
const DIGEST_RE = /^[a-f0-9]{64}$/;
/**
 * Deterministic metadata verifier. Checks digest/media/bytes bounds only.
 * Never fetches `artifact.ref` and never executes bytes.
 */
export function defaultVerifier(input) {
    const reasons = [];
    const { artifact, terms } = input;
    if (!DIGEST_RE.test(artifact.digestSha256)) {
        reasons.push("digestSha256 is not 64 lowercase hex characters");
    }
    if (terms.allowedMediaTypes.length === 0) {
        return {
            outcome: "needs_review",
            verifierVersion: DEFAULT_VERIFIER_VERSION,
            reasons: ["terms.allowedMediaTypes is empty"],
        };
    }
    if (!terms.allowedMediaTypes.includes(artifact.mediaType)) {
        reasons.push(`mediaType ${artifact.mediaType} is not in the terms allowlist`);
    }
    if (artifact.bytes < 1) {
        reasons.push("artifact.bytes must be >= 1");
    }
    if (artifact.bytes > terms.maxArtifactBytes) {
        reasons.push(`artifact.bytes ${artifact.bytes} exceeds maxArtifactBytes ${terms.maxArtifactBytes}`);
    }
    if (!artifact.ref || artifact.ref.length > 2048) {
        reasons.push("artifact.ref is missing or too long");
    }
    return {
        outcome: reasons.length === 0 ? "pass" : "fail",
        verifierVersion: DEFAULT_VERIFIER_VERSION,
        reasons: reasons.length === 0 ? [DEFAULT_VERIFIER_PASS_REASON] : reasons,
    };
}
//# sourceMappingURL=verifier.js.map