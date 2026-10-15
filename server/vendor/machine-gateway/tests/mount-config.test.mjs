import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { mkdtemp, writeFile, rm, chmod, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { mountMachineGateway, SqliteStore } from "../src/index.mjs";
import { loadConfig } from "../src/config.mjs";
import { tenantConfig, TOKEN_A, sampleInput } from "./helpers.mjs";

async function setup(t, override = {}) {
  const dir = await mkdtemp(join(tmpdir(), "gateway-mount-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = join(dir, "tenants.json"), file = join(dir, "machine-gateway.sqlite");
  await writeFile(config, JSON.stringify({ tenants: tenantConfig(["lockfile.delta", "http.capture"]) }), { mode: 0o600 });
  const env = { MACHINE_GATEWAY_ENABLED: "1", MACHINE_GATEWAY_STATE_FILE: file, MACHINE_GATEWAY_TENANTS_FILE: config,
    MACHINE_GATEWAY_PAYMENTS_ENABLED: "0", NODE_ENV: "production", ...override };
  return { dir, file, config, env };
}
async function host(t, env, afterMount) {
  const app = express();
  // Match accepted ordering: raw webhook, optional service, ordinary parser.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => res.json({ raw: Buffer.isBuffer(req.body) }));
  const handle = mountMachineGateway(app, { env });
  afterMount?.(app);
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.post("/api/other", (req, res) => res.json(req.body));
  app.use((_req, res) => res.type("html").send("existing site"));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); handle.close(); });
  return { origin: `http://127.0.0.1:${server.address().port}`, handle };
}

test("real Express shared mount preserves raw webhooks, health, unrelated APIs and site with enabled gateway", async t => {
  const { env } = await setup(t), { origin } = await host(t, env);
  assert.deepEqual(await fetch(`${origin}/api/health`).then(r => r.json()), { ok: true });
  assert.equal(await fetch(`${origin}/`).then(r => r.text()), "existing site");
  assert.deepEqual(await fetch(`${origin}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(r => r.json()), { raw: true });
  assert.deepEqual(await fetch(`${origin}/api/other`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"value":"unchanged"}' }).then(r => r.json()), { value: "unchanged" });
  const health = await fetch(`${origin}/api/machine-gateway/healthz`).then(r => r.json());
  assert.equal(health.ready, true); assert.equal(health.paymentsEnabled, false);
  const quote = await fetch(`${origin}/api/machine-gateway/v1/quote`, { method: "POST", headers: {
    "content-type": "application/json", authorization: `Bearer ${TOKEN_A}`,
  }, body: JSON.stringify({ routeId: "lockfile.delta", input: sampleInput }) }).then(r => r.json());
  assert.ok(quote.quoteId); assert.equal(quote.executable, true);
});

test("disabled and invalid configurations fail only their mount prefix", async t => {
  for (const env of [{}, { MACHINE_GATEWAY_ENABLED: "1" }, { MACHINE_GATEWAY_ENABLED: "invalid" }]) {
    const { origin } = await host(t, env);
    assert.equal((await fetch(`${origin}/api/machine-gateway/healthz`)).status, 503);
    assert.equal((await fetch(`${origin}/api/health`)).status, 200);
    assert.equal(await fetch(`${origin}/other-page`).then(r => r.text()), "existing site");
  }
});

test("production opts in explicitly, rejects generic database fallback and requires dedicated file", async t => {
  assert.equal(loadConfig({ DATABASE_URL: "ignored", MACHINE_GATEWAY_ENABLED: "0" }), null);
  assert.throws(() => loadConfig({ MACHINE_GATEWAY_ENABLED: "1", DATABASE_URL: "ignored" }));
  const { env } = await setup(t);
  assert.throws(() => loadConfig({ ...env, MACHINE_GATEWAY_STATE_FILE: "relative/machine-gateway.sqlite" }));
  assert.throws(() => loadConfig({ ...env, MACHINE_GATEWAY_STATE_FILE: "/other-service.sqlite" }));
  assert.throws(() => loadConfig({ ...env, MACHINE_GATEWAY_PAYMENTS_ENABLED: "yes" }));
  const { origin } = await host(t, { ...env, MACHINE_GATEWAY_PAYMENTS_ENABLED: "1" });
  assert.equal((await fetch(`${origin}/api/machine-gateway/healthz`)).status, 503);
});

test("private tenant authority rejects public permissions, symlinks, hard links and unknown configuration keys", async t => {
  const { dir, config, env } = await setup(t);
  await chmod(config, 0o644); assert.throws(() => loadConfig(env)); await chmod(config, 0o600);
  const symbolic = join(dir, "linked.json"); await symlink(config, symbolic);
  assert.throws(() => loadConfig({ ...env, MACHINE_GATEWAY_TENANTS_FILE: symbolic }));
  const hard = join(dir, "hard.json"); await link(config, hard);
  assert.throws(() => loadConfig(env)); await rm(hard);
  await writeFile(config, JSON.stringify({ tenants: tenantConfig(["lockfile.delta"]), token: "not-accepted" }));
  assert.throws(() => loadConfig(env));
});

test("WAL and FULL synchronization persist and state rejects symlink/hardlink/shared directories", async t => {
  const { dir, file } = await setup(t);
  const store = new SqliteStore(file);
  assert.equal(store.db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
  assert.equal(store.db.prepare("PRAGMA synchronous").get().synchronous, 2); store.close();
  const symbolic = join(dir, "linked.sqlite"); await symlink(file, symbolic);
  assert.throws(() => new SqliteStore(symbolic));
  const hard = join(dir, "hard.sqlite"); await link(file, hard); assert.throws(() => new SqliteStore(file)); await rm(hard);
  await chmod(dir, 0o755); assert.throws(() => new SqliteStore(file)); await chmod(dir, 0o700);
  const db = new DatabaseSync(file); db.exec("PRAGMA user_version=2"); db.close();
  assert.throws(() => new SqliteStore(file), /unsupported/);
});

test("opening an unrelated SQLite database does not add gateway tables", async t => {
  const { file } = await setup(t);
  const db = new DatabaseSync(file); db.exec("CREATE TABLE unrelated (value TEXT)"); db.close();
  assert.throws(() => new SqliteStore(file), /foreign/);
  const read = new DatabaseSync(file);
  assert.deepEqual(read.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name), ["unrelated"]);
  read.close();
});
