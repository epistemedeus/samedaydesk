import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test("writer grant cannot resolve or reopen; writer delivery still works", async () => {
  const store = new MemoryStore();
  const app = createApp(store, testConfig());
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const created = await json(baseUrl, "/v1/projects", {
      method: "POST",
      token: ADMIN,
      idempotencyKey: "create-lifecycle-1",
      body: JSON.stringify({
        title: "Worker lifecycle boundary",
        summary: "Writer may deliver but cannot close the project.",
      }),
    });
    assert.equal(created.status, 201);
    const projectId = created.body.project.id;
    const ownerToken = created.body.ownerToken;
    const writerGrant = await json(baseUrl, `/v1/projects/${projectId}/grants`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ role: "writer" }),
    });
    assert.equal(writerGrant.status, 201);
    const writerToken = writerGrant.body.token;
    const delivery = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: writerToken,
      idempotencyKey: "writer-delivery-1",
      body: JSON.stringify({ kind: "reply", text: "handoff note" }),
    });
    assert.equal(delivery.status, 201);
    const forbiddenResolve = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: writerToken,
      idempotencyKey: "writer-resolve-1",
      body: JSON.stringify({ kind: "resolved", expectedVersion: created.body.project.version }),
    });
    assert.equal(forbiddenResolve.status, 403);
    assert.equal(forbiddenResolve.body.error.code, "forbidden");
    const ownerResolve = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: ownerToken,
      idempotencyKey: "owner-resolve-1",
      body: JSON.stringify({ kind: "resolved", expectedVersion: created.body.project.version }),
    });
    assert.equal(ownerResolve.status, 201);
    assert.equal(ownerResolve.body.project.status, "resolved");
    const forbiddenReopen = await json(baseUrl, `/v1/projects/${projectId}/events`, {
      method: "POST",
      token: writerToken,
      idempotencyKey: "writer-reopen-1",
      body: JSON.stringify({
        kind: "reopened",
        expectedVersion: ownerResolve.body.project.version,
      }),
    });
    assert.equal(forbiddenReopen.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await store.close();
  }
});
