import type { JourneyConfig } from "./types.js";
export declare const JOURNEY_MOUNT_PATH: "/api/neomorphic-contributor-journey";
export declare const PRODUCT_SOURCE_PIN = "ff6c03653f6c268d89502986a5062d36044f6cd0";
export declare const SDS_SOURCE_PIN = "d8cea059213e06d2f263be67f82e498f8052a50f";
export declare const LIVE_PROFILE_PRODUCT_BASE = "2a0cbd71b0c14c124d592ed6b6b66f7f35cbacd4";
export declare const LIVE_PROFILE_SDS_BASE = "f864cadceaa7d2ee80077058992e95102ef361ae";
export declare const LEGACY_ROUNDS: Set<string>;
/** Explicit store binding only. Live admission never changes a source's provenance. */
export declare function loadJourneyConfig(env?: NodeJS.ProcessEnv): JourneyConfig;
/** Reconstruct every option at the factory boundary, including direct object callers. */
export declare function validateJourneyConfig(config: JourneyConfig): JourneyConfig;
