/**
 * Bind artifact metadata to its digest. Never fetch artifact.ref.
 * Never execute bytes. This is not a verifier.
 *
 * @param {unknown} artifact
 * @param {{ maxArtifactBytes?: number }} [bounds]
 */
export function bindArtifactDigest(artifact: unknown, bounds?: {
    maxArtifactBytes?: number;
}): {
    ref: string;
    digestSha256: string;
    mediaType: string;
    bytes: unknown;
};
export function maxBytesFromTask(task: any): any;
