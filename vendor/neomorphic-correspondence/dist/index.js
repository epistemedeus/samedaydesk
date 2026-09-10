import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { MemoryStore } from "./store/memory.js";
import { createPostgresStore } from "./store/postgres.js";
export { createApp } from "./app.js";
export { loadConfig, parsePgSchema, parsePoolMax, MOUNTED_PG_SCHEMA } from "./config.js";
export { createPostgresStore, PostgresStore } from "./store/postgres.js";
export { MemoryStore } from "./store/memory.js";
export async function buildStoreFromEnv(env = process.env) {
    const config = loadConfig(env);
    if (config.store === "memory") {
        return { store: new MemoryStore(), config };
    }
    const store = await createPostgresStore(config.databaseUrl, {
        schema: config.pgSchema,
        poolMax: config.poolMax,
    });
    return { store, config };
}
async function main() {
    const { store, config } = await buildStoreFromEnv();
    const app = createApp(store, config);
    const server = app.listen(config.port, () => {
        console.log(`correspondence listening on :${config.port} store=${store.kind} trustProxyHops=${config.trustProxyHops}`);
    });
    const shutdown = async () => {
        server.close();
        await store.close();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
const isDirectRun = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map