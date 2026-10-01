import { parseDatabaseUrl, parsePgSchema, parsePoolMax } from "./config.js";
import { createPostgresStore } from "./store/postgres.js";
async function main() {
    const databaseUrl = process.env.EARNED_WORK_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("EARNED_WORK_DATABASE_URL is required for migration");
    }
    const store = await createPostgresStore(parseDatabaseUrl(databaseUrl), {
        schema: parsePgSchema(process.env.EARNED_WORK_PG_SCHEMA),
        poolMax: parsePoolMax(process.env.EARNED_WORK_POOL_MAX),
    });
    await store.close();
    console.log(`earned-work migration applied schema=${process.env.EARNED_WORK_PG_SCHEMA || "public"}`);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map