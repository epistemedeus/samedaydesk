import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createApp } from "@neomorphic/correspondence";
import { mountCorrespondence } from "../lib/correspondence-mount.js";
import healthRouter from "../routes/health.js";

const ADMIN = "s51-negative-admin-token-24ok";
const dummyStore = { kind: "postgres", close: async () => {} };

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, port: server.address().port };
}

async function get(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: response.status, json: await response.json() };
}

test("DB down is store_unavailable; SDS health stays 200; one recovery after cooldown", async (t) => {
  let attempts = 0;
  let allow = false;

  const env = {
    NODE_ENV: "test",
    CORRESPONDENCE_DATABASE_URL: "postgres://s51-down/db",
    CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
  };
  let now = 1_000;
  const app = express();
  const handle = mountCorrespondence(app, {
    env,
    now: () => now,
    loadService: async () => ({
      loadConfig: () => ({
        adminToken: ADMIN,
        databaseUrl: env.CORRESPONDENCE_DATABASE_URL,
        store: "postgres",
        bodyLimitBytes: 32768,
        rateLimitWindowMs: 60000,
        rateLimitMax: 120,
        corsOrigins: ["https://neomorphic.io"],
        trustProxyHops: 0,
        pgSchema: "pilot_correspondence",
        poolMax: 4,
        port: 0,
      }),
      createPostgresStore: async () => {
        attempts += 1;
        if (!allow) throw new Error("connect ECONNREFUSED");
        return dummyStore;
      },
      createApp,
    }),
  });
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", healthRouter);
  await handle.ready();
  const { server, port } = await listen(app);
  t.after(async () => {
    await handle.close();
    await new Promise((resolve) => server.close(resolve));
  });

  const health = await get(port, "/api/health");
  assert.equal(health.status, 200);
  const down = await get(port, "/api/correspondence/healthz");
  assert.equal(down.json.reason, "store_unavailable");
  assert.equal(attempts, 1);

  now += 1000;
  await get(port, "/api/correspondence/healthz");
  assert.equal(attempts, 1, "cooldown must skip extra reconnects");

  allow = true;
  now += 5000;
  const recovered = await get(port, "/api/correspondence/healthz");
  assert.equal(recovered.json.ok, true);
  assert.equal(recovered.json.enabled, true);
  assert.equal(attempts, 2);
  const healthAfter = await get(port, "/api/health");
  assert.equal(healthAfter.status, 200);
});
