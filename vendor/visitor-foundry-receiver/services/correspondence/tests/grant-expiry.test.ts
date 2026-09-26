import assert from "node:assert/strict";
import { inspect } from "node:util";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  CorrespondenceClient,
  CorrespondenceError,
  UnknownOutcomeError,
  WorkbenchSession,
  createIdempotencyKey,
} from "../../../scripts/correspondence/index.mjs";
import { createApp } from "../src/app.js";
import type { ServiceConfig } from "../src/config.js";
import { hashToken } from "../src/crypto.js";
import { MemoryStore } from "../src/store/memory.js";
import { createPostgresStore } from "../src/store/postgres.js";
import type { CorrespondenceStore } from "../src/store/types.js";

const ADMIN = "test-admin-token-please-change-now";

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

async function withServer(
  store: CorrespondenceStore,
  run: (baseUrl: string) => Promise<void>,
  configOverrides: Partial<ServiceConfig> = {},
) {
  const app = createApp(store, testConfig(configOverrides));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function assertExpiredGrant(error: unknown, token: string) {
  assert.equal(error instanceof CorrespondenceError, true);
  assert.equal(error instanceof UnknownOutcomeError, false);
  const correspondence = error as CorrespondenceError & {
    status: number | null;
    code: string;
    retryable: boolean;
  };
  assert.equal(correspondence.status, 401);
  assert.equal(correspondence.code, "unauthorized");
  assert.equal(correspondence.retryable, false);
  const encoded = `${correspondence.message}\n${inspect(correspondence)}\n${JSON.stringify(correspondence)}`;
  assert.equal(encoded.includes(token), false);
  assert.doesNotMatch(encoded, /neo_wtr_|neo_rdr_|neo_own_/);
}

async function assertAllVerbsUnauthorized(
  client: CorrespondenceClient,
  projectId: string,
  token: string,
) {
  await assert.rejects(
    () => client.getProject({ projectId, token }),
    (error) => {
      assertExpiredGrant(error, token);
      return true;
    },
  );
  await assert.rejects(
    () => client.listEvents({ projectId, token }),
    (error) => {
      assertExpiredGrant(error, token);
      return true;
    },
  );
  await assert.rejects(
    () =>
      client.postEvent({
        projectId,
        token,
        kind: "reply",
        text: "expired grant must not append",
        idempotencyKey: createIdempotencyKey(),
      }),
    (error) => {
      assertExpiredGrant(error, token);
      return true;
    },
  );
  await assert.rejects(
    () => client.createGrant({ projectId, token, role: "reader" }),
    (error) => {
      assertExpiredGrant(error, token);
      return true;
    },
  );
}

async function bootstrap(baseUrl: string, title: string) {
  const admin = new CorrespondenceClient({
    baseUrl,
    fetch: globalThis.fetch,
    token: ADMIN,
  });
  const created = await admin.createProject({
    title,
    summary: "N16 grant expiry acceptance cell",
    idempotencyKey: `n16-${randomUUID()}`,
  });
  assert.equal(created.status, 201);
  const owner = new CorrespondenceClient({
    baseUrl,
    fetch: globalThis.fetch,
    token: created.ownerToken,
  });
  return { admin, owner, projectId: created.project.id, ownerToken: created.ownerToken };
}

async function runClientExpiryMatrix(store: CorrespondenceStore) {
  await withServer(store, async (baseUrl) => {
    const { owner, projectId, ownerToken } = await bootstrap(baseUrl, "N16 expiry matrix");

    const omitted = await owner.createGrant({ projectId, role: "writer" });
    assert.equal(omitted.expiresAt, null);
    const neverExpires = new CorrespondenceClient({
      baseUrl,
      fetch: globalThis.fetch,
      token: omitted.token,
    });
    assert.equal((await neverExpires.getProject({ projectId })).project.id, projectId);

    const past = new Date(Date.now() - 1000).toISOString();
    const expiredWriter = await owner.createGrant({
      projectId,
      role: "writer",
      expiresAt: past,
    });
    assert.equal(expiredWriter.expiresAt, past);
    assert.match(expiredWriter.token, /^neo_wtr_/);
    await assertAllVerbsUnauthorized(
      new CorrespondenceClient({ baseUrl, fetch: globalThis.fetch, token: expiredWriter.token }),
      projectId,
      expiredWriter.token,
    );

    const expiredReader = await owner.createGrant({
      projectId,
      role: "reader",
      expiresAt: new Date(Date.now() - 5).toISOString(),
    });
    await assertAllVerbsUnauthorized(
      new CorrespondenceClient({ baseUrl, fetch: globalThis.fetch, token: expiredReader.token }),
      projectId,
      expiredReader.token,
    );

    const exactNow = new Date().toISOString();
    const boundary = await owner.createGrant({
      projectId,
      role: "writer",
      expiresAt: exactNow,
    });
    assert.equal(boundary.expiresAt, exactNow);
    await assertAllVerbsUnauthorized(
      new CorrespondenceClient({ baseUrl, fetch: globalThis.fetch, token: boundary.token }),
      projectId,
      boundary.token,
    );

    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const liveWriter = await owner.createGrant({
      projectId,
      role: "writer",
      expiresAt: future,
    });
    assert.equal(liveWriter.expiresAt, future);
    const live = new CorrespondenceClient({
      baseUrl,
      fetch: globalThis.fetch,
      token: liveWriter.token,
    });
    const posted = await live.postEvent({
      projectId,
      kind: "request",
      text: "written inside the grant window",
      idempotencyKey: createIdempotencyKey(),
    });
    assert.equal(posted.status, 201);
    const listed = await live.listEvents({ projectId });
    assert.equal(
      listed.events.some((event) => event.id === posted.event.id),
      true,
    );

    const offset = new Date(Date.now() + 120_000).toISOString().replace("Z", "+00:00");
    const offsetGrant = await owner.createGrant({
      projectId,
      role: "reader",
      expiresAt: offset,
    });
    assert.equal(offsetGrant.expiresAt, offset);
    const offsetClient = new CorrespondenceClient({
      baseUrl,
      fetch: globalThis.fetch,
      token: offsetGrant.token,
    });
    assert.equal((await offsetClient.getProject({ projectId })).project.id, projectId);

    const stillOwner = await owner.getProject({ projectId });
    assert.equal(stillOwner.project.id, projectId);
    const ownerList = await owner.listEvents({ projectId });
    assert.equal(
      ownerList.events.some((event) => event.text === "written inside the grant window"),
      true,
    );

    const ownerLookup = await store.findActiveGrantByTokenHash(hashToken(ownerToken));
    assert.ok(ownerLookup);
    assert.equal(ownerLookup.role, "owner");
    assert.equal(ownerLookup.expiresAt, null);
    assert.equal(await store.findActiveGrantByTokenHash(hashToken(expiredWriter.token)), null);
    const durableWriter = await store.findActiveGrantByTokenHash(hashToken(omitted.token));
    assert.ok(durableWriter);
    assert.equal(durableWriter.role, "writer");
    assert.equal(durableWriter.expiresAt, null);

    const rawInvalid = await fetch(`${baseUrl}/v1/projects/${projectId}/grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ role: "writer", expiresAt: "tomorrow" }),
    });
    assert.equal(rawInvalid.status, 400);
    const invalidBody = await rawInvalid.json();
    assert.equal(invalidBody.error.code, "invalid_input");
    assert.equal(JSON.stringify(invalidBody).includes(ownerToken), false);
  });
}

test("memory HTTP + CorrespondenceClient: expired grants cannot read, write, or mint", async () => {
  const store = new MemoryStore();
  try {
    await runClientExpiryMatrix(store);
  } finally {
    await store.close();
  }
});

test("real Postgres HTTP + CorrespondenceClient: grant expiry is durable and enforced after expires_at elapses", async (t) => {
  const databaseUrl = process.env.CORRESPONDENCE_TEST_DATABASE_URL;
  if (!databaseUrl) {
    t.skip("requires explicit disposable Postgres test URL");
    return;
  }

  const store = await createPostgresStore(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await runClientExpiryMatrix(store);

    await withServer(store, async (baseUrl) => {
      const { owner, projectId, ownerToken } = await bootstrap(baseUrl, "N16 pg force-expire");
      const future = new Date(Date.now() + 60 * 60_000).toISOString();
      const grant = await owner.createGrant({
        projectId,
        role: "writer",
        expiresAt: future,
      });
      const writer = new CorrespondenceClient({
        baseUrl,
        fetch: globalThis.fetch,
        token: grant.token,
      });
      const before = await writer.postEvent({
        projectId,
        kind: "request",
        text: "pg-backed event before expiry",
        idempotencyKey: createIdempotencyKey(),
      });
      assert.equal(before.status, 201);

      const storedBefore = await pool.query(
        `SELECT expires_at, revoked_at FROM correspondence_grants WHERE id = $1`,
        [grant.grantId],
      );
      assert.equal(storedBefore.rows.length, 1);
      assert.equal(storedBefore.rows[0].revoked_at, null);
      assert.ok(storedBefore.rows[0].expires_at.getTime() > Date.now());
      assert.ok(await store.findActiveGrantByTokenHash(hashToken(grant.token)));

      await pool.query(
        `UPDATE correspondence_grants SET expires_at = now() - interval '1 second' WHERE id = $1`,
        [grant.grantId],
      );

      assert.equal(await store.findActiveGrantByTokenHash(hashToken(grant.token)), null);
      const storedAfter = await pool.query(
        `SELECT expires_at, revoked_at, token_hash FROM correspondence_grants WHERE id = $1`,
        [grant.grantId],
      );
      assert.equal(storedAfter.rows.length, 1);
      assert.equal(storedAfter.rows[0].revoked_at, null);
      assert.ok(storedAfter.rows[0].expires_at.getTime() <= Date.now());
      assert.equal(JSON.stringify(storedAfter.rows[0]).includes(grant.token), false);

      await assertAllVerbsUnauthorized(writer, projectId, grant.token);

      const ownerRead = await owner.listEvents({ projectId });
      assert.equal(
        ownerRead.events.some((event) => event.id === before.event.id),
        true,
      );
      const ownerStill = await store.findActiveGrantByTokenHash(hashToken(ownerToken));
      assert.ok(ownerStill);
      assert.equal(ownerStill.expiresAt, null);

      const desk = new WorkbenchSession();
      const expiredConnect = await desk.connect({
        token: grant.token,
        projectId,
        baseUrl,
      });
      assert.equal(expiredConnect.ok, false);
      assert.equal(expiredConnect.code, "revoked");
      assert.equal(desk.view().connected, false);
      assert.equal(desk.view().actionLocked, false);

      const liveConnect = await desk.connect({
        token: ownerToken,
        projectId,
        baseUrl,
      });
      assert.equal(liveConnect.ok, true);
      const short = await owner.createGrant({
        projectId,
        role: "writer",
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
      const writerDesk = new WorkbenchSession();
      assert.equal(
        (await writerDesk.connect({ token: short.token, projectId, baseUrl })).ok,
        true,
      );
      await pool.query(
        `UPDATE correspondence_grants SET expires_at = now() - interval '1 second' WHERE id = $1`,
        [short.grantId],
      );
      const expiredSubmit = await writerDesk.submit({
        kind: "request",
        text: "workbench submit after pg expiry",
      });
      assert.equal(expiredSubmit.ok, false);
      assert.equal(expiredSubmit.code, "revoked");
      assert.equal(writerDesk.view().connected, false);
      assert.equal(writerDesk.view().lastMutation, null);
      assert.equal((await writerDesk.connect({ token: ownerToken, projectId, baseUrl })).ok, true);
    });
  } finally {
    await pool.end();
    await store.close();
  }
});
