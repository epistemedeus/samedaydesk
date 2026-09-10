import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createApp, loadConfig, MemoryStore } from "@neomorphic/correspondence";
import { inspectCorrespondenceEnv, mountCorrespondence } from "../lib/correspondence-mount.js";
import { createSdsApp } from "../index.js";

const env = { NODE_ENV: "test", CORRESPONDENCE_DATABASE_URL: "postgres://127.0.0.1:1/fixture", CORRESPONDENCE_ADMIN_TOKEN: "s58-fixture-administrator-token-long" };
async function listen(app, t, handle) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => { await handle?.close(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
function service(store = new MemoryStore()) {
  return { loadConfig, createApp, createPostgresStore: async () => store };
}

test("S58 shared-host env rejects public/unrelated schema and pool above four", () => {
  for (const schema of ["public", "other_app", "pg_temp", "pilot_correspondence; SELECT 1"]) {
    assert.equal(inspectCorrespondenceEnv({ ...env, CORRESPONDENCE_PG_SCHEMA: schema }).kind, "invalid_config");
  }
  assert.equal(inspectCorrespondenceEnv({ ...env, CORRESPONDENCE_POOL_MAX: "5" }).kind, "invalid_config");
  for (const url of ["not-a-url", "postgres://localhost", "https://elsewhere/db"]) {
    assert.equal(inspectCorrespondenceEnv({ ...env, CORRESPONDENCE_DATABASE_URL: url }).kind, "invalid_config");
  }
  assert.equal(inspectCorrespondenceEnv({ DATABASE_URL: env.CORRESPONDENCE_DATABASE_URL }).kind, "unconfigured");
});

test("S58 initialization has one request-triggered retry, coalesces requests, and stops after failure", async t => {
  let clock = 1000, attempts = 0;
  const app = express();
  const handle = mountCorrespondence(app, { env, now: () => clock, loadService: async () => ({
    ...service(), createPostgresStore: async () => { attempts++; throw new Error("fixture down"); },
  }) });
  await handle.ready();
  const base = await listen(app, t, handle);
  assert.equal(attempts, 1);
  clock += 4999;
  await fetch(base + "/api/correspondence/healthz");
  assert.equal(attempts, 1);
  clock += 1;
  await Promise.all(Array.from({ length: 5 }, () => fetch(base + "/api/correspondence/healthz")));
  assert.equal(attempts, 2);
  clock += 100000;
  await fetch(base + "/api/correspondence/healthz");
  assert.equal(attempts, 2);
});

test("S58 app initialization failure closes its acquired store", async () => {
  let closed = 0;
  const handle = mountCorrespondence(express(), { env, loadService: async () => ({
    ...service(), createPostgresStore: async () => ({ close: async () => { closed++; } }),
    createApp: () => { throw new Error("fixture app failure"); },
  }) });
  await handle.ready();
  assert.equal(handle.state.reason, "store_unavailable");
  assert.equal(closed, 1);
  await handle.close();
  assert.equal(closed, 1);
});

test("S58 actual SDS mount preserves CORS, body limit and store readiness (memory fixture)", async t => {
  const store = new MemoryStore();
  let down = false;
  store.checkReady = async () => { if (down) throw new Error("fixture store down"); };
  const app = createSdsApp({ correspondence: { env, loadService: async () => service(store) } });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  const base = await listen(app, t, handle);
  const route = base + "/api/correspondence";
  let result = await fetch(route + "/healthz");
  assert.equal((await result.json()).enabled, true);
  result = await fetch(route + "/v1/projects", { method: "OPTIONS", headers: { origin: "https://neomorphic.io" } });
  assert.equal(result.status, 204);
  assert.equal(result.headers.get("access-control-allow-origin"), "https://neomorphic.io");
  result = await fetch(route + "/v1/projects", { method: "OPTIONS", headers: { origin: "https://bad.invalid" } });
  assert.equal(result.status, 403);
  result = await fetch(route + "/v1/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "x".repeat(33000) }) });
  assert.equal(result.status, 413);
  result = await fetch(route + "/v1/projects", { method: "POST", headers: { "content-type": "application/json" }, body: '{}' });
  assert.equal(result.status, 401);
  down = true;
  result = await fetch(route + "/healthz");
  assert.equal(result.status, 503);
  assert.equal((await result.json()).enabled, false);
  result = await fetch(base + "/api/health", { headers: { origin: "https://neomorphic.io" } });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("access-control-allow-origin"), null);
  result = await fetch(base + "/api/checkout/create-payment-intent", { method: "POST", headers: { "content-type": "application/json" }, body: '{}' });
  assert.ok([401, 503].includes(result.status), "checkout stops before any provider request");
});


test("S58 shipped migration/package entrypoints reject generic DB before connecting", () => {
  const root = fileURLToPath(new URL("../../vendor/neomorphic-correspondence/", import.meta.url));
  const pkg = JSON.parse(readFileSync(root + "package.json", "utf8"));
  for (const command of Object.values(pkg.scripts)) {
    assert.match(command, /^node dist\//);
    assert.equal(existsSync(root + command.slice(5)), true);
  }
  const result = spawnSync(process.execPath, [root + "dist/migrate.js"], {
    encoding: "utf8", env: { PATH: process.env.PATH, DATABASE_URL: "postgres://127.0.0.1:1/unrelated" }, timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CORRESPONDENCE_DATABASE_URL is required/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
});
