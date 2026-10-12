/**
 * Honesty wrappers for existing lab packs. Do not duplicate their engines.
 *
 * - packs/exchange-townsquare: agreement/artifact metadata only (ref, digest, media, bytes).
 * - packs/capability-preflight: local metadata verification; never fetch/execute artifact.ref.
 * - packs/outside-operator-first-job: distinct accept vs artifact; this kernel is the HTTP job.
 * - services/correspondence: bearer hash-at-rest, idempotency, postgres, OpenAPI, node:test.
 */
export declare const FORBIDDEN_COMPLETION_LABEL = "actual_completion";
export declare const ALLOWED_PROVENANCE: readonly ["test", "fixture", "production"];
export declare const PACK_REFS: Readonly<{
    correspondence: "services/correspondence";
    exchangeTownsquare: "packs/exchange-townsquare";
    capabilityPreflight: "packs/capability-preflight";
    outsideOperatorFirstJob: "packs/outside-operator-first-job";
}>;
export declare const ARTIFACT_SEMANTICS: Readonly<{
    execute: false;
    fetchRef: false;
    shape: readonly ["ref", "digestSha256", "mediaType", "bytes"];
    note: "Metadata only unless evidenceBase64 is supplied. Default verifier checks digest/media/bytes bounds; that is not a reproduction. Reproduction evaluates received bytes in a host child, never a fixture catalog and never artifact.ref.";
}>;
export declare const ACCEPTANCE_POLICY: Readonly<{
    requiresPassVerdict: true;
    note: "Owner accept binds an explicit pass verdict id to the obligation. Newest created_at is not authority. A later fail cannot select a previous pass or leave lifecycle verified.";
}>;
export declare function isForbiddenCompletion(label: string | undefined): boolean;
