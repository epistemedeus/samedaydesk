/**
 * Honesty wrappers for existing lab packs. Do not duplicate their engines.
 *
 * - packs/exchange-townsquare: agreement/artifact metadata only (ref, digest, media, bytes).
 * - packs/capability-preflight: local metadata verification; never fetch/execute artifact.ref.
 * - packs/outside-operator-first-job: distinct accept vs artifact; this kernel is the HTTP job.
 * - services/correspondence: bearer hash-at-rest, idempotency, postgres, OpenAPI, node:test.
 */
export const FORBIDDEN_COMPLETION_LABEL = "actual_completion";
export const ALLOWED_PROVENANCE = ["test", "fixture", "production"];
export const PACK_REFS = Object.freeze({
    correspondence: "services/correspondence",
    exchangeTownsquare: "packs/exchange-townsquare",
    capabilityPreflight: "packs/capability-preflight",
    outsideOperatorFirstJob: "packs/outside-operator-first-job",
});
export const ARTIFACT_SEMANTICS = Object.freeze({
    execute: false,
    fetchRef: false,
    shape: ["ref", "digestSha256", "mediaType", "bytes"],
    note: "Metadata only unless evidenceBase64 is supplied. Default verifier checks digest/media/bytes bounds; that is not a reproduction. Reproduction evaluates received bytes in a host child, never a fixture catalog and never artifact.ref.",
});
export const ACCEPTANCE_POLICY = Object.freeze({
    requiresPassVerdict: true,
    note: "Owner accept binds an explicit pass verdict id to the obligation. Newest created_at is not authority. A later fail cannot select a previous pass or leave lifecycle verified.",
});
export function isForbiddenCompletion(label) {
    return label === FORBIDDEN_COMPLETION_LABEL;
}
//# sourceMappingURL=honesty.js.map