import { ApiError } from "./errors.js";
export const BOOTSTRAP_REPLAY_MS = 24 * 60 * 60 * 1000;
export function requireBootstrapReplay(createdAt, storedHash, inputHash) {
    if (Date.now() - new Date(createdAt).getTime() >= BOOTSTRAP_REPLAY_MS || storedHash !== inputHash) {
        // Keep the original idempotency row: expiry must never create a second project.
        throw new ApiError(409, "bootstrap_recovery_required", "original project exists; bootstrap replay expired or bootstrap secret changed");
    }
}
//# sourceMappingURL=bootstrap-replay.js.map