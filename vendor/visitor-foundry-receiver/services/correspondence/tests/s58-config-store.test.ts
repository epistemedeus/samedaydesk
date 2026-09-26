import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, parseMountedPgSchema, parsePoolMax } from "../src/config.js";
import { PostgresStore, createPostgresStore } from "../src/store/postgres.js";

const admin = "s58-fixture-administrator-token-long";

test("S58 dedicated database selection cannot inherit public or unrelated schemas", () => {
  const base = { CORRESPONDENCE_ADMIN_TOKEN: admin, DATABASE_URL: "postgres://wrong/db", CORRESPONDENCE_DATABASE_URL: "postgres://selected/db" };
  const config = loadConfig(base);
  assert.equal(config.databaseUrl, base.CORRESPONDENCE_DATABASE_URL);
  assert.equal(config.pgSchema, "pilot_correspondence");
  assert.equal(config.poolMax, 4);
  for (const schema of ["public", "other_app", "pg_temp", "pilot_correspondence;DROP SCHEMA public", "pg_catalog"]) {
    assert.throws(() => parseMountedPgSchema(schema));
    assert.throws(() => loadConfig({ ...base, CORRESPONDENCE_PG_SCHEMA: schema }));
  }
  assert.throws(() => parsePoolMax("5"));
  for (const url of ["not-a-url", "postgres://localhost", "https://elsewhere/db"]) {
    assert.throws(() => loadConfig({ ...base, CORRESPONDENCE_DATABASE_URL: url }));
  }
  // Existing standalone runtime configuration remains separate from shared-host env.
  assert.equal(loadConfig({ DATABASE_URL: base.DATABASE_URL, CORRESPONDENCE_ADMIN_TOKEN: admin }).pgSchema, "public");
});

test("S58 failed migration closes the pool and idle errors have a handler", async () => {
  const migrate = PostgresStore.prototype.migrate;
  const close = PostgresStore.prototype.close;
  let closed = 0;
  PostgresStore.prototype.migrate = async () => { throw new Error("fixture migration failure"); };
  PostgresStore.prototype.close = async function () { closed++; await close.call(this); };
  try {
    await assert.rejects(createPostgresStore("postgres://127.0.0.1:1/fixture", { schema: "pilot_correspondence" }), /fixture migration failure/);
    assert.equal(closed, 1);
  } finally { PostgresStore.prototype.migrate = migrate; PostgresStore.prototype.close = close; }
  const store = new PostgresStore("postgres://127.0.0.1:1/fixture");
  assert.equal((store as any).pool.options.max, 4);
  assert.equal((store as any).pool.options.statement_timeout, 5_000);
  assert.equal((store as any).pool.options.query_timeout, 6_000);
  assert.ok((store as any).pool.listenerCount("error") > 0);
  await store.close();
});

test("S58 migration scopes one transaction and rolls back failures (query fixture)", async () => {
  for (const fail of [false, true]) {
    const store = new PostgresStore("postgres://127.0.0.1:1/fixture", { schema: "pilot_correspondence" });
    const calls: string[] = [];
    let released = false;
    (store as any).pool.connect = async () => ({
      query: async (sql: string) => {
        calls.push(sql);
        if (fail && sql.includes("CREATE TABLE")) throw new Error("fixture DDL failure");
        return { rows: [] };
      },
      release: () => { released = true; },
    });
    if (fail) await assert.rejects(store.migrate(), /fixture DDL failure/);
    else await store.migrate();
    assert.equal(calls[0], "BEGIN");
    assert.match(calls[1], /pg_advisory_xact_lock/);
    assert.equal(calls[2], 'CREATE SCHEMA IF NOT EXISTS "pilot_correspondence"');
    assert.equal(calls[3], 'SET LOCAL search_path TO "pilot_correspondence"');
    assert.equal(calls.at(-1), fail ? "ROLLBACK" : "COMMIT");
    assert.equal(released, true);
    await store.close();
  }
});
