// Disposable database and loopback only. No live grants or external requests.
import { createPostgresStore } from "../src/store/postgres.ts";
import { createApp } from "../src/app.ts";
import { testConfig } from "./helpers.ts";
import { loadConfig } from "../src/config.ts";
const config = process.env.RECEIVING_USE_OWNER_CONFIG === "1"
  ? loadConfig(process.env)
  : testConfig({ pgSchema: process.env.EARNED_WORK_PG_SCHEMA });
const store = await createPostgresStore(config.databaseUrl, { schema: config.pgSchema, poolMax: 4,
  afterDurableWrite: ({ kind }) => {
    if (kind === "commit" && process.env.RECEIVING_CRASH_AFTER_COMMIT === "1") process.exit(86);
  } });
const server = createApp(store, config).listen(0, "127.0.0.1", () => {
  process.send({ baseUrl: `http://127.0.0.1:${server.address().port}` });
});
process.on("SIGTERM", async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close(); process.exit(0); });
