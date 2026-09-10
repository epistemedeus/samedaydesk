import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createApp, createPostgresStore, loadConfig } from "@neomorphic/correspondence";
import { mountCorrespondence } from "../lib/correspondence-mount.js";
import healthRouter from "../routes/health.js";
import mcpRouter from "../routes/mcp.js";

const ADMIN = "s51-shared-host-admin-token-24ok";
const PREFIX = "/api/correspondence";

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, port: server.address().port };
}

async function api(base, method, path, { token, body, idempotencyKey, origin } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  if (origin) headers.origin = origin;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json, headers: response.headers };
}

test("mounted correspondence: two clients, artifact/correction, restart, sentinel, SDS health", async (t) => {
  const url = process.env.CORRESPONDENCE_TEST_DATABASE_URL;
  if (!url) { t.skip("requires an explicitly disposable CORRESPONDENCE_TEST_DATABASE_URL"); return; }
  const cluster = { url };

  const pg = await import("pg");
  const admin = new pg.default.Client({ connectionString: cluster.url });
  await admin.connect();
  t.after(() => admin.end());
  await admin.query("CREATE SCHEMA s51_sentinel");
  await admin.query("CREATE TABLE s51_sentinel.keep_me (id int PRIMARY KEY)");
  await admin.query("INSERT INTO s51_sentinel.keep_me VALUES (1)");

  const env = {
    NODE_ENV: "test",
    CORRESPONDENCE_DATABASE_URL: cluster.url,
    CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    CORRESPONDENCE_POOL_MAX: "3",
    CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io",
    CORRESPONDENCE_TRUST_PROXY: "0",
    CORRESPONDENCE_STORE: "postgres",
  };

  async function boot() {
    const app = express();
    app.disable("x-powered-by");
    const handle = mountCorrespondence(app, {
      env,
      loadService: async () => ({ createApp, createPostgresStore, loadConfig }),
    });
    app.use(express.json({ limit: "1mb" }));
    app.use("/api", healthRouter);
    app.use("/mcp", mcpRouter);
    app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
    await handle.ready();
    const { server, port } = await listen(app);
    return { handle, server, port, base: `http://127.0.0.1:${port}${PREFIX}` };
  }

  const first = await boot();
  t.after(async () => {
    await first.handle.close();
    await new Promise((resolve) => first.server.close(resolve));
  });

  const healthz = await api(first.base, "GET", "/healthz");
  assert.equal(healthz.status, 200);
  assert.equal(healthz.json.enabled, true);
  assert.equal(healthz.json.store, "postgres");

  const sdsHealth = await api(`http://127.0.0.1:${first.port}`, "GET", "/api/health");
  assert.equal(sdsHealth.status, 200);
  assert.equal(sdsHealth.json.service, "samedaydesk");

  const bareV1 = await api(`http://127.0.0.1:${first.port}`, "POST", "/v1/projects", {
    token: ADMIN,
    body: { title: "no prefix", summary: "must not bind" },
    idempotencyKey: "no-prefix-1",
  });
  assert.equal(bareV1.status, 404);

  const missing = await api(first.base, "POST", "/v1/projects", {
    body: { title: "S51 missing", summary: "reject" },
    idempotencyKey: "s51-missing",
  });
  assert.equal(missing.status, 401);

  const created = await api(first.base, "POST", "/v1/projects", {
    token: ADMIN,
    idempotencyKey: "s51-create-1",
    body: { title: "S51 closed-pilot accept", summary: "Prefixed mount tenant. Not a public post." },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const projectId = created.json.project.id;
  const ownerToken = created.json.ownerToken;

  const writerGrant = await api(first.base, "POST", `/v1/projects/${projectId}/grants`, {
    token: ownerToken,
    body: { role: "writer" },
  });
  const readerGrant = await api(first.base, "POST", `/v1/projects/${projectId}/grants`, {
    token: ownerToken,
    body: { role: "reader" },
  });
  assert.equal(writerGrant.status, 201);
  assert.equal(readerGrant.status, 201);
  const writer = writerGrant.json.token;
  const reader = readerGrant.json.token;

  const requestEvt = await api(first.base, "POST", `/v1/projects/${projectId}/events`, {
    token: writer,
    idempotencyKey: "s51-req-1",
    body: { kind: "request", text: "writer request under prefix" },
  });
  assert.equal(requestEvt.status, 201);

  const artifact = await api(first.base, "POST", `/v1/projects/${projectId}/events`, {
    token: writer,
    idempotencyKey: "s51-art-1",
    body: {
      kind: "artifact",
      artifact: { url: "https://neomorphic.io/labs/task-square/", label: "task square" },
    },
  });
  assert.equal(artifact.status, 201);

  const listed = await api(first.base, "GET", `/v1/projects/${projectId}/events?limit=10`, { token: reader });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.events.length, 2);
  assert.ok(listed.json.nextCursor);
  const cursor = listed.json.nextCursor;

  const empty = await api(
    first.base,
    "GET",
    `/v1/projects/${projectId}/events?after=${encodeURIComponent(cursor)}&limit=10`,
    { token: reader },
  );
  assert.equal(empty.status, 200);
  assert.equal(empty.json.events.length, 0);

  const correction = await api(first.base, "POST", `/v1/projects/${projectId}/events`, {
    token: writer,
    idempotencyKey: "s51-corr-1",
    body: { kind: "correction", text: "correction after empty cursor page" },
  });
  assert.equal(correction.status, 201);

  const resumed = await api(
    first.base,
    "GET",
    `/v1/projects/${projectId}/events?after=${encodeURIComponent(cursor)}&limit=10`,
    { token: reader },
  );
  assert.equal(resumed.json.events.length, 1);
  assert.equal(resumed.json.events[0].kind, "correction");

  const readerWrite = await api(first.base, "POST", `/v1/projects/${projectId}/events`, {
    token: reader,
    idempotencyKey: "s51-reader-write",
    body: { kind: "request", text: "reader must not post" },
  });
  assert.ok(readerWrite.status === 403 || readerWrite.status === 401);

  const other = await api(first.base, "POST", "/v1/projects", {
    token: ADMIN,
    idempotencyKey: "s51-other",
    body: { title: "S51 other tenant", summary: "cross-project deny" },
  });
  const otherId = other.json.project.id;
  const cross = await api(first.base, "GET", `/v1/projects/${otherId}`, { token: writer });
  assert.ok(cross.status === 404 || cross.status === 403);

  const badCursor = await api(
    first.base,
    "GET",
    `/v1/projects/${otherId}/events?after=${encodeURIComponent(cursor)}`,
    { token: other.json.ownerToken },
  );
  assert.ok(badCursor.status === 400 || badCursor.status === 404);

  const corsDenied = await api(first.base, "OPTIONS", "/v1/projects", {
    origin: "https://evil.example",
  });
  assert.equal(corsDenied.status, 403);
  const corsOk = await api(first.base, "OPTIONS", "/v1/projects", {
    origin: "https://neomorphic.io",
  });
  assert.equal(corsOk.status, 204);
  assert.equal(corsOk.headers.get("access-control-allow-origin"), "https://neomorphic.io");

  await first.handle.close();
  await new Promise((resolve) => first.server.close(resolve));

  const second = await boot();
  t.after(async () => {
    await second.handle.close();
    await new Promise((resolve) => second.server.close(resolve));
  });
  const replayed = await api(second.base, "GET", `/v1/projects/${projectId}/events?limit=10`, {
    token: reader,
  });
  assert.equal(replayed.status, 200);
  assert.equal(replayed.json.events.length, 3);
  assert.ok(replayed.json.events.some((event) => event.kind === "artifact"));
  assert.ok(replayed.json.events.some((event) => event.kind === "correction"));

  const sentinel = await admin.query("SELECT id FROM s51_sentinel.keep_me");
  assert.deepEqual(sentinel.rows, [{ id: 1 }]);
  const leaked = await admin.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'correspondence_%'`,
  );
  assert.equal(leaked.rowCount, 0);
});
