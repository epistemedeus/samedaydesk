import type { JourneyConfig } from "./types.js";
export declare const JOURNEY_MOUNT_PATH: "/api/neomorphic-contributor-journey";
export declare const PRODUCT_SOURCE_PIN = "ff6c03653f6c268d89502986a5062d36044f6cd0";
export declare const SDS_SOURCE_PIN = "d8cea059213e06d2f263be67f82e498f8052a50f";
/** Dedicated, synthetic database only. No inherited DATABASE_URL or old round schema. */
export declare function loadJourneyConfig(env?: NodeJS.ProcessEnv): JourneyConfig;
