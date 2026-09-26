import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { CorrespondenceClient, createIdempotencyKey } from "../../../scripts/correspondence/index.mjs";
import { createApp } from "../src/app.js";
import type { ServiceConfig } from "../src/config.js";
import { MemoryStore } from "../src/store/memory.js";

const ADMIN = "test-admin-token-please-change-now";

function testConfig(): ServiceConfig {
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

test("ported client talks to the accepted correspondence service over loopback HTTP", async () => {
  const store = new MemoryStore();
  const server = createServer(createApp(store, testConfig()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const admin = new CorrespondenceClient({ baseUrl, fetch: globalThis.fetch, token: ADMIN });
    const created = await admin.createProject({
      title: "Workbench live",
      summary: "Participant client against the accepted service.",
      idempotencyKey: createIdempotencyKey(),
    });
    const grant = await admin.createGrant({
      projectId: created.project.id,
      role: "writer",
      token: created.ownerToken,
    });
    const participant = new CorrespondenceClient({
      baseUrl,
      fetch: globalThis.fetch,
      token: grant.token,
    });
    const request = await participant.postEvent({
      projectId: created.project.id,
      kind: "request",
      text: "Need a bounded reply.",
      idempotencyKey: createIdempotencyKey(),
    });
    assert.equal(request.event.kind, "request");
    const page = await participant.listEvents({ projectId: created.project.id });
    assert.equal(page.events.length, 1);
    assert.ok(page.nextCursor);
    const replayKey = createIdempotencyKey();
    const first = await participant.postEvent({
      projectId: created.project.id,
      kind: "reply",
      text: "Here is the note.",
      idempotencyKey: replayKey,
    });
    const replay = await participant.postEvent({
      projectId: created.project.id,
      kind: "reply",
      text: "Here is the note.",
      idempotencyKey: replayKey,
    });
    assert.equal(first.status, 201);
    assert.equal(replay.status, 200);
    assert.equal(replay.event.id, first.event.id);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await store.close();
  }
});
