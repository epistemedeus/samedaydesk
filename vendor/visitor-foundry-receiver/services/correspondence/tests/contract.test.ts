import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../src/app.js";
import type { ServiceConfig } from "../src/config.js";
import { MemoryStore } from "../src/store/memory.js";
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
    await store.close();
  }
}

async function json(
  baseUrl: string,
  path: string,
  init: RequestInit & { token?: string; idempotencyKey?: string } = {},
) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body, headers: response.headers };
}

test("API contract: auth, grants, events, pagination, conflicts", async () => {
  const store = new MemoryStore();
  await withServer(store, async (baseUrl) => {
    const unauthorized = await json(baseUrl, "/v1/projects", {
      method: "POST",
      body: JSON.stringify({ title: "A", summary: "B" }),
      idempotencyKey: "create-project-1",
    });
    assert.equal(unauthorized.status, 401);

    const created = await json(baseUrl, "/v1/projects", {
      method: "POST",
      token: ADMIN,
      idempotencyKey: "create-project-1",
      body: JSON.stringify({
        title: "EIN handoff continuation",
        summary: "Resume a bounded preparation note without payment authority.",
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.project.status, "open");
    assert.equal(created.body.project.version, 1);
    assert.equal(created.body.project.nextAction, null);
    const ownerToken = created.body.ownerToken;
    const projectId = created.body.project.id;
    assert.match(ownerToken, /^neo_own_/);

    const replay = await json(baseUrl, "/v1/projects", {
      method: "POST",
      token: ADMIN,
      idempotencyKey: "create-project-1",
      body: JSON.stringify({
        title: "EIN handoff continuation",
        summary: "Resume a bounded preparation note without payment authority.",
      }),
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.ownerToken, ownerToken);
    assert.equal(replay.body.project.id, projectId);

    const conflict = await json(baseUrl, "/v1/projects", {
      method: "POST",
      token: ADMIN,
      idempotencyKey: "create-project-1",
      body: JSON.stringify({
        title: "Different title",
        summary: "Resume a bounded preparation note without payment authority.",
      }),
    });
    assert.equal(conflict.status, 409);

    const other = await json(baseUrl, "/v1/projects", {
      method: "POST",
      token: ADMIN,
      idempotencyKey: "create-project-2",
      body: JSON.stringify({ title: "Other", summary: "Second project" }),
    });
    assert.equal(other.status, 201);
    const otherOwner = other.body.ownerToken;
    const otherId = other.body.project.id;

    const wrongProject = await json(baseUrl, `/v1/projects/${otherId}`, {
      token: ownerToken,
    });
    assert.equal(wrongProject.status, 404);

    const readerGrant = await json(baseUrl, `/v1/projects/${projectId}/grants`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ role: "reader" }),
    });
    assert.equal(readerGrant.status, 201);
    const readerToken = readerGrant.body.token;

    const writerGrant = await json(baseUrl, `/v1/projects/${projectId}/grants`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        role: "writer",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    assert.equal(writerGrant.status, 201);
    const writerToken = writerGrant.body.token;
    const writerGrantId = writerGrant.body.grantId;

    const readerWrite = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: readerToken,
      idempotencyKey: "evt-reader-denied",
      body: JSON.stringify({ kind: "request", text: "help" }),
    });
    assert.equal(readerWrite.status, 403);

    const requestEvent = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: writerToken,
      idempotencyKey: "evt-request-1",
      body: JSON.stringify({
        kind: "request",
        text: "Need a corrected readiness note after provider change.",
      }),
    });
    assert.equal(requestEvent.status, 201);
    assert.equal(requestEvent.body.project.nextAction.kind, "reply");

    const replayEvent = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: writerToken,
      idempotencyKey: "evt-request-1",
      body: JSON.stringify({
        kind: "request",
        text: "Need a corrected readiness note after provider change.",
      }),
    });
    assert.equal(replayEvent.status, 200);
    assert.equal(replayEvent.body.event.id, requestEvent.body.event.id);

    const changedReplay = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: writerToken,
      idempotencyKey: "evt-request-1",
      body: JSON.stringify({
        kind: "request",
        text: "changed body",
      }),
    });
    assert.equal(changedReplay.status, 409);

    const artifact = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: ownerToken,
      idempotencyKey: "evt-artifact-1",
      body: JSON.stringify({
        kind: "artifact",
        artifact: {
          url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
          label: "internal receipt",
        },
      }),
    });
    assert.equal(artifact.status, 201);
    assert.equal(artifact.body.event.artifact.url.startsWith("https://"), true);

    const httpArtifact = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: ownerToken,
      idempotencyKey: "evt-artifact-http",
      body: JSON.stringify({
        kind: "artifact",
        artifact: { url: "http://example.com/nope" },
      }),
    });
    assert.equal(httpArtifact.status, 400);

    for (let i = 0; i < 3; i += 1) {
      const reply = await json(baseUrl, `/v1/projects/${projectId}/events`, {
        method: "POST",
        token: ownerToken,
        idempotencyKey: `evt-reply-${i}`,
        body: JSON.stringify({ kind: "reply", text: `note ${i}` }),
      });
      assert.equal(reply.status, 201);
    }

    const page1 = await json(baseUrl, `/v1/projects/${projectId}/events?limit=2`, {
      token: readerToken,
    });
    assert.equal(page1.status, 200);
    assert.equal(page1.body.events.length, 2);
    assert.ok(page1.body.nextCursor);

    const page2 = await json(
      baseUrl,
      `/v1/projects/${projectId}/events?after=${page1.body.nextCursor}&limit=10`,
      { token: readerToken },
    );
    assert.equal(page2.status, 200);
    assert.ok(page2.body.events.length >= 1);
    assert.ok(page2.body.events[0].sequence > page1.body.events.at(-1).sequence);

    const foreignCursor = await json(
      baseUrl,
      `/v1/projects/${projectId}/events?after=999999`,
      { token: readerToken },
    );
    assert.equal(foreignCursor.status, 400);

    const resolve = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: ownerToken,
      idempotencyKey: "evt-resolve-1",
      body: JSON.stringify({ kind: "resolved", expectedVersion: 1 }),
    });
    assert.equal(resolve.status, 201);
    assert.equal(resolve.body.project.status, "resolved");
    assert.equal(resolve.body.project.version, 2);

    const staleResolve = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: ownerToken,
      idempotencyKey: "evt-resolve-stale",
      body: JSON.stringify({ kind: "resolved", expectedVersion: 1 }),
    });
    assert.equal(staleResolve.status, 409);

    const reopen = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: ownerToken,
      idempotencyKey: "evt-reopen-1",
      body: JSON.stringify({ kind: "reopened", expectedVersion: 2 }),
    });
    assert.equal(reopen.status, 201);
    assert.equal(reopen.body.project.status, "open");
    assert.equal(reopen.body.project.version, 3);

    await json(baseUrl, `/v1/projects/${projectId}/grants/${writerGrantId}`, {
      method: "DELETE",
      token: ownerToken,
    });
    const revokedWrite = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: writerToken,
      idempotencyKey: "evt-after-revoke",
      body: JSON.stringify({ kind: "reply", text: "should fail" }),
    });
    assert.equal(revokedWrite.status, 401);

    const repeatRevoke = await json(
      baseUrl,
      `/v1/projects/${projectId}/grants/${writerGrantId}`,
      { method: "DELETE", token: ownerToken },
    );
    assert.equal(repeatRevoke.status, 204);

    const crossRevoke = await json(
      baseUrl,
      `/v1/projects/${projectId}/grants/${otherId}`,
      { method: "DELETE", token: ownerToken },
    );
    assert.equal(crossRevoke.status, 404);

    const unknownField = await json(baseUrl, "/v1/projects", {
      method: "POST",
      token: ADMIN,
      idempotencyKey: "create-unknown",
      body: JSON.stringify({
        title: "x",
        summary: "y",
        paymentAuthority: true,
      }),
    });
    assert.equal(unknownField.status, 400);

    const oversized = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: ownerToken,
      idempotencyKey: "evt-too-big",
      body: JSON.stringify({ kind: "reply", text: "x".repeat(9000) }),
    });
    assert.equal(oversized.status, 400);

    // Ensure no token leakage in error messages from this suite.
    for (const sample of [unauthorized, wrongProject, readerWrite, revokedWrite]) {
      const encoded = JSON.stringify(sample.body);
      assert.doesNotMatch(encoded, /neo_own_/);
      assert.doesNotMatch(encoded, /neo_wtr_/);
      assert.doesNotMatch(encoded, new RegExp(ADMIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    void otherOwner;
  });
});

test("expired grants cannot read", async () => {
  const store = new MemoryStore();
  await withServer(store, async (baseUrl) => {
    const created = await json(baseUrl, "/v1/projects", {
      method: "POST",
      token: ADMIN,
      idempotencyKey: "create-expired",
      body: JSON.stringify({ title: "Expire", summary: "Grant expiry" }),
    });
    const ownerToken = created.body.ownerToken;
    const projectId = created.body.project.id;
    const grant = await json(baseUrl, `/v1/projects/${projectId}/grants`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        role: "reader",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    });
    const expiredRead = await json(baseUrl, `/v1/projects/${projectId}`, {
      token: grant.body.token,
    });
    assert.equal(expiredRead.status, 401);
  });
});

test("body over 32KiB is rejected", async () => {
  const store = new MemoryStore();
  await withServer(store, async (baseUrl) => {
    const created = await json(baseUrl, "/v1/projects", {
      method: "POST",
      token: ADMIN,
      idempotencyKey: "create-limit",
      body: JSON.stringify({ title: "Limit", summary: "Body limit" }),
    });
    const huge = "y".repeat(33 * 1024);
    const response = await fetch(`${baseUrl}/v1/projects/${created.body.project.id}/events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.body.ownerToken}`,
        "content-type": "application/json",
        "idempotency-key": "evt-huge",
      },
      body: JSON.stringify({ kind: "reply", text: huge.slice(0, 8000), pad: huge }),
    });
    assert.equal(response.status, 413);
  });
});

test("browser workbench CORS allows only configured canonical origins and always Varies", async () => {
  const store = new MemoryStore();
  await withServer(store, async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "https://neomorphic.io" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://neomorphic.io");
    assert.match(allowed.headers.get("vary") ?? "", /Origin/i);

    const loopback = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "http://127.0.0.1:4321" },
    });
    assert.equal(loopback.headers.get("access-control-allow-origin"), null);
    assert.match(loopback.headers.get("vary") ?? "", /Origin/i);

    const foreign = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "https://evil.example" },
    });
    assert.equal(foreign.headers.get("access-control-allow-origin"), null);
    assert.match(foreign.headers.get("vary") ?? "", /Origin/i);

    const nullOrigin = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "null" },
    });
    assert.equal(nullOrigin.headers.get("access-control-allow-origin"), null);

    const preflight = await fetch(`${baseUrl}/v1/projects/prj_x`, {
      method: "OPTIONS",
      headers: {
        origin: "https://neomorphic.io",
        "access-control-request-headers": "authorization,content-type,idempotency-key",
      },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /Authorization/i);
    assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /Idempotency-Key/i);
    assert.match(preflight.headers.get("vary") ?? "", /Origin/i);

    const deniedPreflight = await fetch(`${baseUrl}/v1/projects/prj_x`, {
      method: "OPTIONS",
      headers: { origin: "http://127.0.0.1:4321" },
    });
    assert.equal(deniedPreflight.status, 403);
    assert.equal(deniedPreflight.headers.get("access-control-allow-origin"), null);
    assert.match(deniedPreflight.headers.get("vary") ?? "", /Origin/i);
  });
});

test("browser workbench CORS allows loopback only when that origin is configured", async () => {
  const store = new MemoryStore();
  await withServer(store, async (baseUrl) => {
    const loopback = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "http://127.0.0.1:4321" },
    });
    assert.equal(loopback.headers.get("access-control-allow-origin"), "http://127.0.0.1:4321");
    assert.match(loopback.headers.get("vary") ?? "", /Origin/i);

    const otherLoopback = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "http://localhost:9999" },
    });
    assert.equal(otherLoopback.headers.get("access-control-allow-origin"), null);
  }, { corsOrigins: ["https://neomorphic.io", "http://127.0.0.1:4321"], trustProxyHops: 0 });
});

test("empty CORS allowlist rejects the public site and loopback", async () => {
  const store = new MemoryStore();
  await withServer(store, async (baseUrl) => {
    const site = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "https://neomorphic.io" },
    });
    assert.equal(site.headers.get("access-control-allow-origin"), null);
    const loopback = await fetch(`${baseUrl}/healthz`, {
      headers: { origin: "http://127.0.0.1:4321" },
    });
    assert.equal(loopback.headers.get("access-control-allow-origin"), null);
  }, { corsOrigins: [], trustProxyHops: 0 });
});
