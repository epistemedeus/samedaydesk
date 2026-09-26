import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { CorrespondenceClient, WorkbenchSession, createIdempotencyKey } from "../../../scripts/correspondence/index.mjs";
import { createApp } from "../src/app.js";
import type { ServiceConfig } from "../src/config.js";
import { MemoryStore } from "../src/store/memory.js";
import { createPostgresStore } from "../src/store/postgres.js";
import type { CorrespondenceStore } from "../src/store/types.js";

const ADMIN = "n17-restart-reload-admin-token-32chars";

function testConfig(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    port: 0,
    adminToken: ADMIN,
    databaseUrl: null,
    store: "memory",
    bodyLimitBytes: 32 * 1024,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 10_000,
    corsOrigins: ["https://neomorphic.io"],
    trustProxyHops: 0,
    pgSchema: "public",
    poolMax: 4,
    ...overrides,
  };
}

async function listen(
  store: CorrespondenceStore,
  cfg: ServiceConfig,
  port = 0,
): Promise<{ server: Server; baseUrl: string; port: number }> {
  const app = createApp(store, cfg);
  const server = createServer((request, response) => {
    // Each side of a simulated restart needs a fresh socket. Otherwise the
    // process-global fetch pool can reuse a socket the old server just closed.
    response.setHeader("Connection", "close");
    app(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, port: address.port };
}

async function listenRetry(
  store: CorrespondenceStore,
  cfg: ServiceConfig,
  port: number,
  attempts = 20,
) {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await listen(store, cfg, port);
    } catch (error) {
      last = error;
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code !== "EADDRINUSE") throw error;
      await sleep(100);
    }
  }
  throw last;
}

async function shutdown(server: Server, store: CorrespondenceStore) {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await store.close();
}

test("memory store HTTP state does not survive a process-like restart", async () => {
  const store = new MemoryStore();
  const first = await listen(store, testConfig());
  const key = `n17-mem-${randomUUID()}`;
  const admin = new CorrespondenceClient({
    baseUrl: first.baseUrl,
    fetch: globalThis.fetch,
    token: ADMIN,
  });
  const created = await admin.createProject({
    title: "Volatile memory desk",
    summary: "Must vanish when the process is replaced.",
    idempotencyKey: key,
  });
  await admin.postEvent({
    projectId: created.project.id,
    kind: "request",
    text: "held only in this heap",
    token: created.ownerToken,
    idempotencyKey: createIdempotencyKey(),
  });
  admin.dispose();
  await shutdown(first.server, store);

  const restarted = new MemoryStore();
  const second = await listenRetry(restarted, testConfig(), first.port);
  try {
    const health = await fetch(`${second.baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).store, "memory");

    const ghost = new CorrespondenceClient({
      baseUrl: second.baseUrl,
      fetch: globalThis.fetch,
      token: created.ownerToken,
    });
    await assert.rejects(
      () => ghost.getProject({ projectId: created.project.id }),
      (error: { status?: number; code?: string; message?: string }) =>
        error.status === 401 ||
        error.code === "invalid_grant" ||
        /invalid grant|unauthorized/i.test(String(error.message)),
    );
    ghost.dispose();

    const replay = new CorrespondenceClient({
      baseUrl: second.baseUrl,
      fetch: globalThis.fetch,
      token: ADMIN,
    });
    const again = await replay.createProject({
      title: "Volatile memory desk",
      summary: "Must vanish when the process is replaced.",
      idempotencyKey: key,
    });
    assert.equal(again.replayed, false);
    assert.notEqual(again.project.id, created.project.id);
    replay.dispose();
  } finally {
    await shutdown(second.server, restarted);
  }
});

test("postgres HTTP restart + fresh-client reload resume is PG-backed", async (t) => {
  const databaseUrl = process.env.CORRESPONDENCE_TEST_DATABASE_URL;
  if (!databaseUrl) {
    t.skip("requires explicit disposable Postgres CORRESPONDENCE_TEST_DATABASE_URL");
    return;
  }

  const cfg = testConfig({ store: "postgres", databaseUrl });
  const store = await createPostgresStore(databaseUrl);
  const first = await listen(store, cfg);
  const createKey = `n17-pg-create-${randomUUID()}`;
  let requestKey = "";
  const title = `N17 restart ${randomUUID().slice(0, 8)}`;
  const summary = "PG-backed restart and reload resume. Not a public post.";

  let projectId = "";
  let ownerToken = "";
  let checkpoint = "";
  let requestId = "";
  let replyId = "";
  let afterRequestCursor = "";

  try {
    const admin = new CorrespondenceClient({
      baseUrl: first.baseUrl,
      fetch: globalThis.fetch,
      token: ADMIN,
    });
    const created = await admin.createProject({ title, summary, idempotencyKey: createKey });
    assert.equal(created.replayed, false);
    projectId = created.project.id;
    ownerToken = created.ownerToken;

    const session = new WorkbenchSession();
    const connected = await session.connect({
      token: ownerToken,
      projectId,
      baseUrl: first.baseUrl,
    });
    assert.equal(connected.ok, true);

    const request = await session.submit({ kind: "request", text: "brief before restart" });
    assert.equal(request.ok, true);
    assert.ok(request.result?.event?.id);
    requestId = request.result.event.id;
    const capturedRequestKey = session.view().lastMutation?.key;
    assert.ok(capturedRequestKey);

    const refreshed = await session.loadHistory();
    assert.equal(refreshed.ok, true);
    afterRequestCursor = session.view().nextCursor;
    assert.ok(afterRequestCursor, "nonempty page must supply a resume cursor");
    checkpoint = session.exportCheckpoint();
    assert.match(checkpoint, /"schema": "neomorphic.correspondence.checkpoint.v1"/);
    assert.doesNotMatch(checkpoint, /neo_own_|neo_wtr_|neo_rdr_/);

    const reply = await session.submit({ kind: "reply", text: "note retained in Postgres" });
    assert.equal(reply.ok, true);
    assert.ok(reply.result?.event?.id);
    replyId = reply.result.event.id;
    assert.ok(session.view().events.length >= 2);
    requestKey = capturedRequestKey;

    session.disconnect();
    assert.equal(session.token, null);
    assert.equal(session.view().events.length, 0);
    admin.dispose();
  } finally {
    await shutdown(first.server, store);
  }

  const probe = new pg.Pool({ connectionString: databaseUrl });
  try {
    const rows = await probe.query(
      `SELECT kind, sequence FROM correspondence_events WHERE project_id = $1 ORDER BY sequence`,
      [projectId],
    );
    assert.equal(rows.rows.length, 2);
    assert.equal(rows.rows[0].kind, "request");
    assert.equal(rows.rows[1].kind, "reply");
    const grants = await probe.query(
      `SELECT role FROM correspondence_grants WHERE project_id = $1 AND revoked_at IS NULL`,
      [projectId],
    );
    assert.ok(grants.rows.some((row: { role: string }) => row.role === "owner"));
  } finally {
    await probe.end();
  }

  const emptyReload = new WorkbenchSession();
  assert.equal(emptyReload.view().events.length, 0);
  assert.equal(emptyReload.token, null);

  const restarted = await createPostgresStore(databaseUrl);
  const second = await listenRetry(restarted, cfg, first.port);
  try {
    assert.equal(second.baseUrl, first.baseUrl);
    const health = await fetch(`${second.baseUrl}/healthz`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.store, "postgres");

    const replay = new CorrespondenceClient({
      baseUrl: second.baseUrl,
      fetch: globalThis.fetch,
      token: ADMIN,
    });
    const same = await replay.createProject({ title, summary, idempotencyKey: createKey });
    assert.equal(same.replayed, true);
    assert.equal(same.project.id, projectId);
    assert.equal(same.ownerToken, ownerToken);
    replay.dispose();

    const reloaded = new WorkbenchSession();
    const live = await reloaded.connect({
      token: ownerToken,
      projectId,
      baseUrl: second.baseUrl,
    });
    assert.equal(live.ok, true);
    const texts = reloaded.view().events.map((event) => event.text);
    assert.ok(texts.includes("brief before restart"));
    assert.ok(texts.includes("note retained in Postgres"));
    assert.equal(reloaded.view().events.some((event) => event.id === requestId), true);
    assert.equal(reloaded.view().events.some((event) => event.id === replyId), true);

    const resumed = await reloaded.resume(checkpoint);
    assert.equal(resumed.ok, true);
    assert.ok(reloaded.view().events.some((event) => event.id === replyId));

    const correction = await reloaded.submit({
      kind: "correction",
      text: "posted after service restart",
    });
    assert.equal(correction.ok, true);
    reloaded.disconnect();

    const peer = new CorrespondenceClient({
      baseUrl: second.baseUrl,
      fetch: globalThis.fetch,
      token: ownerToken,
    });
    const page = await peer.listEvents({
      projectId,
      after: afterRequestCursor,
      limit: 10,
    });
    assert.ok(page.events.some((event) => event.id === replyId));
    assert.ok(page.events.some((event) => event.kind === "correction" && event.text === "posted after service restart"));
    peer.dispose();

    const replayRequest = new CorrespondenceClient({
      baseUrl: second.baseUrl,
      fetch: globalThis.fetch,
      token: ownerToken,
    });
    const replayed = await replayRequest.postEvent({
      projectId,
      kind: "request",
      text: "brief before restart",
      idempotencyKey: requestKey,
    });
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.event.id, requestId);
    replayRequest.dispose();
  } finally {
    await shutdown(second.server, restarted);
  }
});
