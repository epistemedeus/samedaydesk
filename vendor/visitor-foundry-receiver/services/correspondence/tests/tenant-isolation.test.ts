import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { createApp } from "../src/app.js";
import { hashToken } from "../src/crypto.js";
import { encodeCursor } from "../src/project-state.js";
import { MemoryStore } from "../src/store/memory.js";
import { createPostgresStore } from "../src/store/postgres.js";
import type { CorrespondenceStore } from "../src/store/types.js";
import type { ServiceConfig } from "../src/config.js";

const ADMIN = "n15-tenant-isolation-admin-token-ok";

function isolationConfig(): ServiceConfig {
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
  };
}

async function serve(store: CorrespondenceStore, run: (url: string) => Promise<void>) {
  const server = createServer(createApp(store, isolationConfig()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function req(
  url: string,
  path: string,
  opts: { method?: string; token?: string; body?: unknown; key?: string } = {},
) {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.key) headers["idempotency-key"] = opts.key;
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function assertNoLeak(body: unknown, ...secrets: string[]) {
  const dumped = JSON.stringify(body);
  for (const secret of secrets) {
    assert.doesNotMatch(dumped, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

async function runForeignWorkspaceAndCursorMatrix(store: CorrespondenceStore) {
  await serve(store, async (url) => {
    const stamp = randomUUID();
    const secretA = `n15-secret-A-${stamp}`;
    const secretB = `n15-secret-B-${stamp}`;

    const createdA = await req(url, "/v1/projects", {
      token: ADMIN,
      key: `n15-create-a-${stamp}`,
      body: { title: `N15 tenant A ${stamp}`.slice(0, 120), summary: secretA },
    });
    const createdB = await req(url, "/v1/projects", {
      token: ADMIN,
      key: `n15-create-b-${stamp}`,
      body: { title: `N15 tenant B ${stamp}`.slice(0, 120), summary: secretB },
    });
    assert.equal(createdA.status, 201);
    assert.equal(createdB.status, 201);
    const aId = createdA.body.project.id as string;
    const bId = createdB.body.project.id as string;
    const aOwner = createdA.body.ownerToken as string;
    const bOwner = createdB.body.ownerToken as string;
    assert.notEqual(aId, bId);
    assert.notEqual(aOwner, bOwner);

    const eventA = await req(url, `/v1/projects/${aId}/events`, {
      token: aOwner,
      key: `n15-evt-a-${stamp}`,
      body: { kind: "request", text: secretA },
    });
    const eventB = await req(url, `/v1/projects/${bId}/events`, {
      token: bOwner,
      key: `n15-evt-b-${stamp}`,
      body: { kind: "request", text: secretB },
    });
    assert.equal(eventA.status, 201);
    assert.equal(eventB.status, 201);
    const eventAId = eventA.body.event.id as string;
    const eventBId = eventB.body.event.id as string;

    const writerA = await req(url, `/v1/projects/${aId}/grants`, {
      token: aOwner,
      body: { role: "writer" },
    });
    const readerA = await req(url, `/v1/projects/${aId}/grants`, {
      token: aOwner,
      body: { role: "reader" },
    });
    assert.equal(writerA.status, 201);
    assert.equal(readerA.status, 201);
    const writerAToken = writerA.body.token as string;
    const readerAToken = readerA.body.token as string;
    const writerAGrantId = writerA.body.grantId as string;

    const pageA = await req(url, `/v1/projects/${aId}/events?limit=1`, { token: aOwner });
    assert.equal(pageA.status, 200);
    assert.equal(pageA.body.events.length, 1);
    assert.equal(pageA.body.events[0].id, eventAId);
    const cursorA = pageA.body.nextCursor as string;
    assert.ok(cursorA);

    const pageB = await req(url, `/v1/projects/${bId}/events?limit=10`, { token: bOwner });
    assert.equal(pageB.status, 200);
    assert.ok(pageB.body.events.every((event: { id: string; projectId: string; text?: string }) => {
      return event.projectId === bId && event.id !== eventAId && event.text !== secretA;
    }));
    assert.equal(pageB.body.events.some((event: { id: string }) => event.id === eventBId), true);

    const missing = await req(url, `/v1/projects/${aId}`, {});
    assert.equal(missing.status, 401);

    const adminAsGrant = await req(url, `/v1/projects/${aId}`, { token: ADMIN });
    assert.equal(adminAsGrant.status, 401);

    const crossGet = await req(url, `/v1/projects/${bId}`, { token: aOwner });
    assert.equal(crossGet.status, 404);
    assert.equal(crossGet.body.error.code, "not_found");
    assertNoLeak(crossGet.body, secretA, secretB, aId, bId, aOwner, bOwner);

    const writerCrossGet = await req(url, `/v1/projects/${bId}`, { token: writerAToken });
    const readerCrossList = await req(url, `/v1/projects/${bId}/events`, { token: readerAToken });
    const ownerCrossList = await req(url, `/v1/projects/${bId}/events`, { token: aOwner });
    const ownerCrossListWithCursor = await req(
      url,
      `/v1/projects/${bId}/events?after=${encodeURIComponent(cursorA)}`,
      { token: aOwner },
    );
    for (const cell of [writerCrossGet, readerCrossList, ownerCrossList, ownerCrossListWithCursor]) {
      assert.equal(cell.status, 404);
      assert.equal(cell.body.error.code, "not_found");
      assertNoLeak(cell.body, secretA, secretB, aOwner, bOwner, cursorA);
    }

    const writerCrossWrite = await req(url, `/v1/projects/${bId}/events`, {
      token: writerAToken,
      key: `n15-xwrite-${stamp}`,
      body: { kind: "request", text: "must deny" },
    });
    const ownerCrossWrite = await req(url, `/v1/projects/${bId}/events`, {
      token: aOwner,
      key: `n15-xwrite-owner-${stamp}`,
      body: { kind: "request", text: "must deny" },
    });
    const ownerCrossGrant = await req(url, `/v1/projects/${bId}/grants`, {
      token: aOwner,
      body: { role: "reader" },
    });
    const ownerCrossRevoke = await req(url, `/v1/projects/${bId}/grants/${writerAGrantId}`, {
      method: "DELETE",
      token: aOwner,
    });
    for (const cell of [writerCrossWrite, ownerCrossWrite, ownerCrossGrant, ownerCrossRevoke]) {
      assert.equal(cell.status, 404);
      assert.equal(cell.body.error.code, "not_found");
    }

    const foreignCursor = await req(
      url,
      `/v1/projects/${bId}/events?after=${encodeURIComponent(cursorA)}`,
      { token: bOwner },
    );
    assert.equal(foreignCursor.status, 400);
    assert.equal(foreignCursor.body.error.code, "invalid_cursor");
    assertNoLeak(foreignCursor.body, secretA, secretB, aOwner, bOwner, eventAId);

    const swappedPayload = encodeCursor(aId, 1);
    const swapped = await req(
      url,
      `/v1/projects/${bId}/events?after=${encodeURIComponent(swappedPayload)}`,
      { token: bOwner },
    );
    assert.equal(swapped.status, 400);
    assert.equal(swapped.body.error.code, "invalid_cursor");

    const numeric = await req(url, `/v1/projects/${bId}/events?after=1`, { token: bOwner });
    assert.equal(numeric.status, 400);
    assert.equal(numeric.body.error.code, "invalid_cursor");

    const missingSeq = encodeCursor(bId, 99);
    const ghost = await req(
      url,
      `/v1/projects/${bId}/events?after=${encodeURIComponent(missingSeq)}`,
      { token: bOwner },
    );
    assert.equal(ghost.status, 400);
    assert.equal(ghost.body.error.code, "invalid_cursor");

    const ownResume = await req(
      url,
      `/v1/projects/${aId}/events?after=${encodeURIComponent(cursorA)}`,
      { token: aOwner },
    );
    assert.equal(ownResume.status, 200);
    assert.deepEqual(ownResume.body.events, []);

    const sameProjectReader = await req(
      url,
      `/v1/projects/${aId}/events?after=${encodeURIComponent(cursorA)}`,
      { token: readerAToken },
    );
    assert.equal(sameProjectReader.status, 200);

    const foreignGrantOnOwnProject = await req(
      url,
      `/v1/projects/${bId}/grants/${writerAGrantId}`,
      { method: "DELETE", token: bOwner },
    );
    assert.equal(foreignGrantOnOwnProject.status, 404);
    assert.equal(foreignGrantOnOwnProject.body.error.code, "not_found");

    const stillA = await req(url, `/v1/projects/${aId}`, { token: aOwner });
    const stillB = await req(url, `/v1/projects/${bId}`, { token: bOwner });
    assert.equal(stillA.status, 200);
    assert.equal(stillB.status, 200);
    assert.equal(stillA.body.project.summary, secretA);
    assert.equal(stillB.body.project.summary, secretB);
    assert.notEqual(stillA.body.project.summary, stillB.body.project.summary);
  });
}

test("memory: reject foreign workspace token and foreign cursor", async () => {
  const store = new MemoryStore();
  try {
    await runForeignWorkspaceAndCursorMatrix(store);
  } finally {
    await store.close();
  }
});

test("postgres: reject foreign workspace token and foreign cursor over real HTTP", async (t) => {
  const databaseUrl = process.env.CORRESPONDENCE_TEST_DATABASE_URL;
  if (!databaseUrl) {
    t.skip("requires explicit disposable Postgres test URL");
    return;
  }
  const store = await createPostgresStore(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await runForeignWorkspaceAndCursorMatrix(store);
    const projects = await pool.query(
      `SELECT id FROM correspondence_projects WHERE title LIKE 'N15 tenant %' ORDER BY created_at DESC LIMIT 8`,
    );
    assert.ok(projects.rows.length >= 2);
    const ids = projects.rows.map((row) => row.id);
    const events = await pool.query(
      `SELECT project_id, id, text FROM correspondence_events WHERE project_id = ANY($1::text[])`,
      [ids],
    );
    const byProject = new Map<string, string[]>();
    for (const row of events.rows) {
      const list = byProject.get(row.project_id) ?? [];
      list.push(row.id);
      byProject.set(row.project_id, list);
    }
    const [first, second] = ids;
    if (first && second && byProject.has(first) && byProject.has(second)) {
      const overlap = (byProject.get(first) ?? []).filter((id) => (byProject.get(second) ?? []).includes(id));
      assert.deepEqual(overlap, []);
    }
    const crossJoin = await pool.query(
      `SELECT e.id
         FROM correspondence_events e
         JOIN correspondence_grants g ON g.token_hash = $1
        WHERE e.project_id <> g.project_id
        LIMIT 1`,
      [hashToken("not-a-real-token")],
    );
    assert.equal(crossJoin.rowCount, 0);
  } finally {
    await pool.end();
    await store.close();
  }
});
