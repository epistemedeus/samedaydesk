import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createRateLimiter } from "../src/auth.js";
import { deriveOwnerToken } from "../src/crypto.js";
import { encodeCursor } from "../src/project-state.js";
import { parseCursor } from "../src/validation.js";
import { MemoryStore } from "../src/store/memory.js";
import { createPostgresStore } from "../src/store/postgres.js";
import type { CorrespondenceStore } from "../src/store/types.js";
import type { ServiceConfig } from "../src/config.js";

const config: ServiceConfig = { port: 0, adminToken: "controller-test-bootstrap-secret-32",
  databaseUrl: null, store: "memory", bodyLimitBytes: 32768,
  rateLimitWindowMs: 60000, rateLimitMax: 10000, corsOrigins: ["https://neomorphic.io"], trustProxyHops: 0,
  pgSchema: "public", poolMax: 4 };

async function serve(store: CorrespondenceStore, run: (url: string) => Promise<void>, cfg = config) {
  const server = createServer(createApp(store, cfg));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}

async function call(url: string, path: string, token: string, body?: unknown, key?: string) {
  const response = await fetch(url + path, { method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json",
      ...(key ? { "idempotency-key": key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}

test("cursor binds project and rejects unsafe sequence/foreign cursor", () => {
  const cursor = encodeCursor("project-A", 1);
  assert.equal(parseCursor(cursor, "project-A"), 1);
  assert.throws(() => parseCursor(cursor, "project-B"));
  assert.throws(() => parseCursor(encodeCursor("project-A", Number.MAX_SAFE_INTEGER + 1), "project-A"));
  assert.throws(() => parseCursor("1", "project-A"));
});

test("rate buckets are bounded/expire, and bearer rotation cannot bypass source limit", async () => {
  let now = 0;
  const limiter = createRateLimiter(config, 2, () => now);
  limiter("first"); limiter("second");
  assert.throws(() => limiter("third"));
  now = 60001;
  assert.doesNotThrow(() => limiter("third"));
  assert.doesNotThrow(() => limiter("fourth"));
  const store = new MemoryStore();
  await serve(store, async url => {
    assert.equal((await call(url, "/healthz", "random-one")).status, 200);
    assert.equal((await call(url, "/healthz", "random-two")).status, 200);
    assert.equal((await call(url, "/healthz", "random-three")).status, 429);
  }, { ...config, rateLimitMax: 2 });
});

test("forwarded client IP is ignored by default and used only at the configured proxy hop", async () => {
  const request = (url: string, forwarded: string) => fetch(`${url}/healthz`, {
    headers: { "x-forwarded-for": forwarded },
  });
  await serve(new MemoryStore(), async url => {
    assert.equal((await request(url, "198.51.100.10")).status, 200);
    assert.equal((await request(url, "198.51.100.11")).status, 429);
  }, { ...config, rateLimitMax: 1, trustProxyHops: 0 });

  await serve(new MemoryStore(), async url => {
    assert.equal((await request(url, "198.51.100.10")).status, 200);
    assert.equal((await request(url, "198.51.100.11")).status, 200);
  }, { ...config, rateLimitMax: 1, trustProxyHops: 1 });
});

test("real Postgres: create replay hashes only, concurrent events, scoped continuation, expiry", async t => {
  const databaseUrl = process.env.CORRESPONDENCE_TEST_DATABASE_URL;
  if (!databaseUrl) { t.skip("requires explicit disposable Postgres test URL"); return; }
  const store = await createPostgresStore(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await serve(store, async url => {
      const key = `regression-${randomUUID()}`;
      const draft = { title: "Controller replay", summary: "One project only" };
      const creates = await Promise.all(Array.from({ length: 5 }, () =>
        call(url, "/v1/projects", config.adminToken, draft, key)));
      assert.equal(creates.filter(r => r.status === 201).length, 1);
      assert.ok(creates.every(r => r.status === 201 || r.status === 200));
      const project = creates[0]!.body.project;
      const token = creates[0]!.body.ownerToken;
      assert.ok(creates.every(r => r.body.ownerToken === token && r.body.project.id === project.id));
      assert.equal(token, deriveOwnerToken(config.adminToken, key));
      const stored = await pool.query("SELECT response_json FROM correspondence_idempotency WHERE scope='project_create' AND key=$1", [key]);
      assert.equal(stored.rows.length, 1);
      assert.equal(stored.rows[0].response_json.ownerToken, undefined);
      assert.equal(JSON.stringify(stored.rows).includes(token), false);

      const base = `/v1/projects/${project.id}/events`;
      const blocker = await pool.connect();
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM correspondence_projects WHERE id=$1 FOR UPDATE", [project.id]);
      const sameKey = `event-${randomUUID()}`;
      const waiting = Promise.all(Array.from({ length: 4 }, () =>
        call(url, base, token, { kind: "request", text: "exact retry" }, sameKey)));
      try { await new Promise(resolve => setTimeout(resolve, 60)); }
      finally { await blocker.query("COMMIT"); blocker.release(); }
      const writes = await waiting;
      assert.equal(writes.filter(r => r.status === 201).length, 1);
      assert.ok(writes.every(r => r.status === 201 || r.status === 200));
      assert.ok(writes.every(r => r.body.event.id === writes[0]!.body.event.id));
      const page = await call(url, base, token);
      assert.equal(page.body.events.length, 1);
      assert.ok(page.body.nextCursor, "last nonempty page supplies a resume cursor");

      const second = await call(url, "/v1/projects", config.adminToken, draft, `second-${randomUUID()}`);
      const secondBase = `/v1/projects/${second.body.project.id}/events`;
      await call(url, secondBase, second.body.ownerToken, { kind: "request", text: "also sequence one" }, `second-event-${randomUUID()}`);
      const foreign = await call(url, `${secondBase}?after=${page.body.nextCursor}`, second.body.ownerToken);
      assert.equal(foreign.status, 400);

      const resolvedKey = `resolved-${randomUUID()}`;
      const resolved = await Promise.all(Array.from({ length: 3 }, () =>
        call(url, base, token, { kind: "resolved", expectedVersion: 1 }, resolvedKey)));
      assert.ok(resolved.every(r => r.status === 200 || r.status === 201));
      assert.ok(resolved.every(r => r.body.project.version === 2));
      const resumed = await call(url, `${base}?after=${page.body.nextCursor}`, token);
      assert.equal(resumed.body.events.length, 1);
      assert.equal(resumed.body.events[0].kind, "resolved");

      await pool.query("UPDATE correspondence_idempotency SET created_at=now()-interval '25 hours' WHERE scope='project_create' AND key=$1", [key]);
      const expired = await call(url, "/v1/projects", config.adminToken, draft, key);
      assert.equal(expired.status, 409);
      assert.equal(expired.body.error.code, "bootstrap_recovery_required");
      assert.equal((await pool.query("SELECT count(*) FROM correspondence_idempotency WHERE scope='project_create' AND key=$1", [key])).rows[0].count, "1");
    });
  } finally { await pool.end(); await store.close(); }
});
