import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { loadConfig, parsePgSchema, parsePoolMax } from "../src/config.js";
import { hashToken, issueToken } from "../src/crypto.js";
import { createPostgresStore, PostgresStore } from "../src/store/postgres.js";

const ADMIN = "schema-isolation-admin-token-24";

test("schema and pool config stay bounded and standalone-default public", () => {
  assert.equal(parsePgSchema(undefined), "public");
  assert.equal(parsePgSchema("pilot_correspondence"), "pilot_correspondence");
  assert.throws(() => parsePgSchema("Public"));
  assert.throws(() => parsePgSchema("pilot-correspondence"));
  assert.throws(() => parsePgSchema("pg_catalog"));
  assert.equal(parsePoolMax(undefined), 4);
  assert.equal(parsePoolMax("2"), 2);
  assert.throws(() => parsePoolMax("0"));
  assert.throws(() => parsePoolMax("9"));
  const cfg = loadConfig({
    NODE_ENV: "test",
    CORRESPONDENCE_STORE: "memory",
    CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    CORRESPONDENCE_POOL_MAX: "3",
  });
  assert.equal(cfg.pgSchema, "pilot_correspondence");
  assert.equal(cfg.poolMax, 3);
});

test("namespaced migrate leaves sentinel schema/table untouched and is re-runnable", async (t) => {
  const url = process.env.CORRESPONDENCE_TEST_DATABASE_URL;
  if (!url) { t.skip("requires an explicitly disposable CORRESPONDENCE_TEST_DATABASE_URL"); return; }
  const cluster = { url };
  const admin = new pg.Client({ connectionString: cluster.url });
  await admin.connect();
  t.after(() => admin.end());
  // Shared disposable DBs may retain public correspondence_* tables from sibling
  // suite files, or a prior interrupted iso cell. Reset only the fixtures this
  // test owns before asserting namespaced migrate does not touch public.
  await admin.query("DROP SCHEMA IF EXISTS s51_sentinel CASCADE");
  await admin.query("DROP SCHEMA IF EXISTS pilot_correspondence CASCADE");
  await admin.query("DROP TABLE IF EXISTS public.unrelated_app CASCADE");
  {
    const prior = await admin.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename LIKE 'correspondence_%'`,
    );
    for (const row of prior.rows) {
      await admin.query(`DROP TABLE IF EXISTS public.${row.tablename} CASCADE`);
    }
  }
  await admin.query("CREATE SCHEMA s51_sentinel");
  await admin.query("CREATE TABLE s51_sentinel.keep_me (id int PRIMARY KEY)");
  await admin.query("INSERT INTO s51_sentinel.keep_me VALUES (1)");
  await admin.query("CREATE TABLE public.unrelated_app (id int PRIMARY KEY)");
  await admin.query("INSERT INTO public.unrelated_app VALUES (7)");

  const store = await createPostgresStore(cluster.url, {
    schema: "pilot_correspondence",
    poolMax: 2,
  });
  t.after(() => store.close());
  const token = issueToken("neo_own");
  const created = await store.createProject({
    title: "Namespaced",
    summary: "Lives only in pilot_correspondence",
    ownerTokenHash: hashToken(token),
    ownerTokenPlainForReplay: token,
    idempotencyKey: "schema-iso-1",
    requestHash: "hash-schema-iso-1",
  });
  assert.equal(created.replayed, false);

  await store.migrate();

  const sentinel = await admin.query("SELECT id FROM s51_sentinel.keep_me");
  assert.deepEqual(sentinel.rows, [{ id: 1 }]);
  const unrelated = await admin.query("SELECT id FROM public.unrelated_app");
  assert.deepEqual(unrelated.rows, [{ id: 7 }]);
  const publicTables = await admin.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'correspondence_%'`,
  );
  assert.equal(publicTables.rowCount, 0);
  const named = await admin.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'pilot_correspondence' AND table_name LIKE 'correspondence_%'
     ORDER BY table_name`,
  );
  assert.deepEqual(
    named.rows.map((row) => row.table_name),
    [
      "correspondence_events",
      "correspondence_grants",
      "correspondence_idempotency",
      "correspondence_projects",
    ],
  );

  const restarted = new PostgresStore(cluster.url, { schema: "pilot_correspondence", poolMax: 2 });
  t.after(() => restarted.close());
  const project = await restarted.getProject(created.project.id);
  assert.ok(project);
  assert.equal(project.title, "Namespaced");
  const event = await restarted.createEvent({
    projectId: created.project.id,
    kind: "request",
    text: "continue after restart in the namespaced schema",
    idempotencyKey: "schema-iso-evt-1",
    requestHash: "hash-schema-iso-evt-1",
  });
  assert.equal(event.event.sequence, 1);
});
