import { parsePgSchema, parsePoolMax } from "./config.js";
import { createPostgresStore } from "./store/postgres.js";
async function main() {
    const databaseUrl = process.env.DATABASE_URL ?? process.env.CORRESPONDENCE_DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("DATABASE_URL is required");
    }
    const store = await createPostgresStore(databaseUrl, {
        schema: parsePgSchema(process.env.CORRESPONDENCE_PG_SCHEMA),
        poolMax: parsePoolMax(process.env.CORRESPONDENCE_POOL_MAX),
    });
    await store.close();
    console.log(`correspondence migration applied schema=${process.env.CORRESPONDENCE_PG_SCHEMA || "public"}`);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map