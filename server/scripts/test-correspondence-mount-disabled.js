import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function request(port, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

test("unconfigured correspondence leaves SDS health/MCP intact and exposes disabled healthz", async (t) => {
  const env = { ...process.env };
  delete env.CORRESPONDENCE_DATABASE_URL;
  delete env.CORRESPONDENCE_ADMIN_TOKEN;
  delete env.CORRESPONDENCE_STORE;
  const { createSdsApp } = await import("../app.js");
  const app = createSdsApp({ correspondence: { env } });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  const { server, port } = await listen(app);
  t.after(async () => {
    await handle.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const health = await request(port, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  assert.equal(health.json.service, "samedaydesk");

  const ready = await request(port, "/api/correspondence/healthz");
  assert.equal(ready.status, 200);
  assert.equal(ready.json.ok, false);
  assert.equal(ready.json.enabled, false);
  assert.equal(ready.json.reason, "unconfigured");

  const create = await request(port, "/api/correspondence/v1/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "nope", summary: "must not create" }),
  });
  assert.equal(create.status, 503);
  assert.equal(create.json.error.code, "unconfigured");

  const mcp = await request(port, "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "s51", version: "0" } },
    }),
  });
  assert.equal(mcp.status, 200);
  assert.equal(mcp.json.result.serverInfo.name, "samedaydesk-agent-tools");
  assert.equal(health.headers["x-powered-by"], undefined);
});

test("malformed correspondence config is disabled without breaking merchant health", async (t) => {
  const env = {
    ...process.env,
    CORRESPONDENCE_ADMIN_TOKEN: "too-short",
    CORRESPONDENCE_DATABASE_URL: "",
  };
  const { createSdsApp } = await import("../app.js");
  const app = createSdsApp({ correspondence: { env } });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  const { server, port } = await listen(app);
  t.after(async () => {
    await handle.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const health = await request(port, "/api/health");
  assert.equal(health.status, 200);
  const ready = await request(port, "/api/correspondence/healthz");
  assert.equal(ready.status, 200);
  assert.equal(ready.json.reason, "invalid_config");
});

test("memory store is refused outside test even if URL and token are present", async (t) => {
  const env = {
    NODE_ENV: "production",
    CORRESPONDENCE_STORE: "memory",
    CORRESPONDENCE_ADMIN_TOKEN: "test-admin-token-please-change-now",
    CORRESPONDENCE_DATABASE_URL: "postgres://unused",
  };
  const { inspectCorrespondenceEnv } = await import("../lib/correspondence-mount.js");
  assert.equal(inspectCorrespondenceEnv(env).kind, "invalid_config");
});
