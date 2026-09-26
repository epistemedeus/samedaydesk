import { parseMountedDatabaseUrl, parseMountedPgSchema, parsePoolMax } from "./config.js";
import { createPostgresStore } from "./store/postgres.js";
async function main() {
    const databaseUrl = process.env.CORRESPONDENCE_DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("CORRESPONDENCE_DATABASE_URL is required for namespaced migration");
    }
    const store = await createPostgresStore(parseMountedDatabaseUrl(databaseUrl), {
        schema: parseMountedPgSchema(process.env.CORRESPONDENCE_PG_SCHEMA),
        poolMax: parsePoolMax(process.env.CORRESPONDENCE_POOL_MAX),
    });
    await store.close();
    console.log(`correspondence migration applied schema=${process.env.CORRESPONDENCE_PG_SCHEMA || "pilot_correspondence"}`);
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map