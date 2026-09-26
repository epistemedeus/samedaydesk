import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import express from "express";
import { createApp, loadConfig, MemoryStore, prepareFoundryHost } from "@neomorphic/correspondence";
import { createSdsApp } from "../app.js";
import { inspectCorrespondenceEnv } from "../lib/correspondence-mount.js";
import { resolveLayout, F93_LAYOUT } from "../foundry/layout.js";
import { runPhasedWorker } from "../foundry/lifecycle.js";
import { bindListenerLifecycle } from "../foundry/listener-lifecycle.js";
import { bindVf09ArtifactLoader, VF09_BIND_POINT } from "../foundry/vf09-bind.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const ADMIN = "foundry-host-admin-token-24chars";
const baseEnv = {
  NODE_ENV: "test",
  CORRESPONDENCE_DATABASE_URL: "postgres://127.0.0.1:9/fixture",
  CORRESPONDENCE_ADMIN_TOKEN: ADMIN,
  CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
  CORRESPONDENCE_POOL_MAX: "2",
  CORRESPONDENCE_STORE: "memory",
  CORRESPONDENCE_TRUST_PROXY: "0",
  CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io",
};

function service(store, trace) {
  return {
    loadConfig,
    createPostgresStore: async () => store,
    createApp: (readyStore, config) => {
      trace?.push("createApp");
      return createApp(readyStore, config);
    },
  };
}

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, port: server.address().port };
}

test("opt-in unset keeps the 32KiB parser, SDS routes, and exact disabled health", async (t) => {
  const calls = [];
  const env = { ...baseEnv };
  delete env.CORRESPONDENCE_DATABASE_URL;
  delete env.CORRESPONDENCE_ADMIN_TOKEN;
  delete env.CORRESPONDENCE_STORE;
  const app = createSdsApp({
    correspondence: {
      env,
      createFoundryExtension: async () => { calls.push("create"); throw new Error("must not run"); },
    },
  });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  const { server, port } = await listen(app);
  t.after(async () => {
    await handle.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "samedaydesk");
  const ready = await fetch(`http://127.0.0.1:${port}/api/correspondence/healthz`);
  assert.deepEqual(await ready.json(), { ok: false, enabled: false, reason: "unconfigured" });
  const uploads = await fetch(`http://127.0.0.1:${port}/api/uploads/signed-url`, { method: "POST" });
  assert.equal(uploads.status, 501);
  assert.equal(calls.length, 0);
  assert.equal(handle.state.foundry.reason, "opt_in_unset");
});

test("explicit 524288 without opt-in, and a sloppy flag, are rejected before connect", async () => {
  assert.equal(inspectCorrespondenceEnv({ ...baseEnv, CORRESPONDENCE_BODY_LIMIT_BYTES: "524288" }).kind, "invalid_config");
  assert.equal(inspectCorrespondenceEnv({ ...baseEnv, FOUNDRY_HOST_OPT_IN: "yes" }).kind, "invalid_config");
  assert.equal(inspectCorrespondenceEnv({ FOUNDRY_HOST_OPT_IN: "1" }).kind, "invalid_config");
  assert.throws(() => loadConfig({ ...baseEnv, CORRESPONDENCE_BODY_LIMIT_BYTES: "524288" }), /32768/);
  await assert.rejects(
    () => prepareFoundryHost({ close: async () => {} }, { enabled: true }),
    /explicit installed adapter/,
  );
});

test("opt-in prepares the host before createApp and accepts a max-domain authenticated body", async (t) => {
  const trace = [];
  const store = new MemoryStore();
  const env = { ...baseEnv, FOUNDRY_HOST_OPT_IN: "1" };
  const app = createSdsApp({
    correspondence: {
      env,
      loadService: async () => service(store, trace),
      createFoundryExtension: async () => {
        trace.push("prepare");
        const router = express.Router();
        router.post("/v1/projects/:projectId/foundry/resolve", (req, res) => {
          trace.push("route");
          if (!req.header("authorization")) return res.status(401).json({ error: { code: "unauthorized" } });
          res.json({ accepted: true, bytes: Buffer.byteLength(JSON.stringify(req.body)) });
        });
        return {
          router,
          checkReady: async () => { trace.push("ready"); },
          close: async () => { trace.push("close"); },
        };
      },
    },
  });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  assert.deepEqual(trace.slice(0, 3), ["prepare", "ready", "createApp"]);
  const { server, port } = await listen(app);
  t.after(async () => {
    await handle.close();
    assert.equal(trace.at(-1), "close");
    await new Promise((resolve) => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${port}`;
  assert.equal((await (await fetch(origin + "/api/health")).json()).ok, true);
  const summary = "s".repeat(400_000);
  const body = JSON.stringify({ title: "Max domain", summary });
  assert.ok(Buffer.byteLength(body) > 32_768);
  assert.ok(Buffer.byteLength(body) < 524_288);
  const headers = { "content-type": "application/json", "idempotency-key": "max-domain-1" };
  const anonymous = await fetch(origin + "/api/correspondence/v1/projects", { method: "POST", headers, body });
  assert.equal(anonymous.status, 401);
  const authed = await fetch(origin + "/api/correspondence/v1/projects", {
    method: "POST",
    headers: { ...headers, authorization: `Bearer ${ADMIN}` },
    body,
  });
  assert.equal(authed.status, 400);
  assert.equal((await authed.json()).error.code, "invalid_input");
  const over = await fetch(origin + "/api/correspondence/v1/projects", {
    method: "POST",
    headers: { ...headers, authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ title: "Max domain", summary: "s".repeat(600_000) }),
  });
  assert.equal(over.status, 413);
  const foundry = await fetch(origin + "/api/correspondence/v1/projects/p1/foundry/resolve", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ payload: "s".repeat(1000) }),
  });
  assert.equal(foundry.status, 200);
  assert.equal((await foundry.json()).accepted, true);
  assert.equal(trace.includes("route"), true);
  const receiver = await fetch(origin + "/api/correspondence/foundry-receiver");
  const receiverBody = await receiver.json();
  assert.equal(receiverBody.bodyLimitBytes, 524288);
  assert.equal(receiverBody.wholeHostSandbox, false);
  const uploads = await fetch(origin + "/api/uploads/signed-url", { method: "POST" });
  assert.equal(uploads.status, 501);
});

test("opt-in unset does not mount the extension even if a factory is provided", async (t) => {
  const calls = [];
  const store = new MemoryStore();
  const app = createSdsApp({
    correspondence: {
      env: baseEnv,
      loadService: async () => service(store),
      createFoundryExtension: async () => { calls.push("no"); throw new Error("no"); },
    },
  });
  const handle = app.get("s51Correspondence");
  await handle.ready();
  const { server, port } = await listen(app);
  t.after(async () => {
    await handle.close();
    await new Promise((resolve) => server.close(resolve));
  });
  assert.equal(calls.length, 0);
  assert.equal(handle.state.foundry.extension, false);
  const body = JSON.stringify({ title: "x", summary: "s".repeat(40_000) });
  const limited = await fetch(`http://127.0.0.1:${port}/api/correspondence/v1/projects`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}`, "idempotency-key": "small-limit" },
    body,
  });
  assert.equal(limited.status, 413);
});

test("layout resolver fails closed when the export dist is absent", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "foundry-layout-"));
  try {
    const missing = resolveLayout(dir, F93_LAYOUT);
    assert.equal(missing.ok, false);
    assert.ok(missing.missing.includes("scripts/visitor-foundry/integration/src/extension.mjs"));
    await writeFile(path.join(dir, "marker.txt"), "x");
    const still = resolveLayout(dir, F93_LAYOUT);
    assert.equal(still.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("vendored additive SQL matches the F93 pin", async () => {
  const pin = JSON.parse(await readFile(path.join(root, "vendor/neomorphic-correspondence/FOUNDRY-PIN.json"), "utf8"));
  assert.equal(pin.f93Export, "107363a0fabaed6133235ebda812dd5f01b07d51");
  for (const [rel, expected] of Object.entries(pin.files)) {
    if (!expected.match(/^[a-f0-9]{64}$/)) continue;
    const bytes = await readFile(path.join(root, "vendor/neomorphic-correspondence", rel));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, rel);
  }
});

test("foundry migrate refuses to connect without --apply or a correspondence URL", () => {
  const migrate = path.join(root, "server/foundry/migrate.mjs");
  const missingFlag = spawn(process.execPath, [migrate], {
    env: { PATH: process.env.PATH, CORRESPONDENCE_DATABASE_URL: "postgres://127.0.0.1:1/nope", CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence" },
  });
  const generic = spawn(process.execPath, [migrate, "--apply"], {
    env: { PATH: process.env.PATH, DATABASE_URL: "postgres://127.0.0.1:1/nope" },
  });
  return Promise.all([once(missingFlag, "exit"), once(generic, "exit")]).then(async () => {
    assert.equal(missingFlag.exitCode, 1);
    assert.equal(generic.exitCode, 1);
  });
});

test("worker lifecycle closes on shutdown and on failure", async () => {
  let closed = 0;
  const stopped = await runPhasedWorker({
    mode: "dispatch",
    projectId: "project-1",
    notify: (onStop) => { onStop(); return () => {}; },
    runPhase: async () => { throw new Error("must not start"); },
    close: async () => { closed += 1; },
  });
  assert.equal(stopped.phase, "shutdown_before_recover");
  assert.deepEqual(stopped.ran, []);
  assert.equal(closed, 1);
  closed = 0;
  await assert.rejects(() => runPhasedWorker({
    mode: "recover",
    projectId: "project-1",
    runPhase: async () => { throw Object.assign(new Error("boom"), { code: "worker_failed" }); },
    close: async () => { closed += 1; },
  }));
  assert.equal(closed, 1);
});

test("worker CLI skips dispatch when SIGTERM arrives during recover", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "foundry-worker-"));
  const trace = path.join(dir, "trace.txt");
  const pass = path.join(root, "server/scripts/fixtures/foundry-worker-pass.mjs");
  const child = spawn(process.execPath, [path.join(root, "server/foundry/worker.mjs"), "dispatch", "project-1"], {
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      FOUNDRY_HOST_OPT_IN: "1",
      CORRESPONDENCE_DATABASE_URL: "postgres://canary@127.0.0.1:9/none",
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      FOUNDRY_WORKER_PASS: pass,
      FOUNDRY_WORKER_TRACE: trace,
      FOUNDRY_WORKER_HOLD: "recover",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.on("data", (buf) => { stdout += buf; });
  const started = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("recover did not start: " + stdout)), 3000);
    child.stdout.on("data", () => {
      if (stdout.includes("recover-started")) { clearTimeout(timer); resolve(); }
    });
  });
  assert.equal(started, undefined);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const [code] = await exited;
  assert.equal(code, 0);
  const lines = (await readFile(trace, "utf8")).trim().split("\n");
  assert.deepEqual(lines, ["recover"]);
  assert.match(stdout, /recover-done/);
  assert.match(stdout, /shutdown_after_recover/);
  await rm(dir, { recursive: true, force: true });
});

test("worker CLI without opt-in exits 2 and does not spawn a pass", async () => {
  const child = spawn(process.execPath, [path.join(root, "server/foundry/worker.mjs"), "dispatch", "project-1"], {
    env: { PATH: process.env.PATH },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 2);
});

test("server/index.js SIGTERM exits 0 and leaves correspondence disabled", async () => {
  const preload = path.join(root, "server/scripts/fixtures/hosted-startup-preload.mjs");
  const child = spawn(process.execPath, ["--import", preload, "server/index.js"], {
    cwd: root,
    env: { PATH: process.env.PATH, NODE_ENV: "test", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no listen")), 5000);
    child.once("message", (msg) => { clearTimeout(timer); resolve(msg); });
  });
  const ready = await fetch(`http://127.0.0.1:${message.port}/api/correspondence/healthz`);
  assert.deepEqual(await ready.json(), { ok: false, enabled: false, reason: "unconfigured" });
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const [code, signal] = await exited;
  assert.equal(code, 0);
  assert.equal(signal, null);
});

test("listener drain invokes the correspondence close hook", async () => {
  const server = express().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let closed = 0;
  const codes = [];
  const shutdown = bindListenerLifecycle(server, async () => { closed += 1; }, {
    bindSignals: false,
    drainMs: 20,
    exit: (code) => codes.push(code),
  });
  await shutdown();
  assert.equal(closed, 1);
  assert.deepEqual(codes, [0]);
});

test("VF09 bind stays closed and uploads remain the 501 stub", () => {
  assert.equal(VF09_BIND_POINT.currentBehavior, "501");
  assert.equal(VF09_BIND_POINT.notAnAuthorityStore, true);
  assert.throws(() => bindVf09ArtifactLoader(), /501 stub/);
});
