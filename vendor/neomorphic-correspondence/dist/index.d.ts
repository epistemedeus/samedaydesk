import { loadConfig } from "./config.js";
import type { CorrespondenceStore } from "./store/types.js";
export { createApp } from "./app.js";
export { loadConfig, parsePgSchema, parsePoolMax, MOUNTED_PG_SCHEMA } from "./config.js";
export { createPostgresStore, PostgresStore } from "./store/postgres.js";
export { MemoryStore } from "./store/memory.js";
export declare function buildStoreFromEnv(env?: NodeJS.ProcessEnv): Promise<{
    store: CorrespondenceStore;
    config: ReturnType<typeof loadConfig>;
}>;
