import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import express from "express";
import { MemoryStore, loadConfig } from "@neomorphic/correspondence";
import { createSdsApp } from "../app.js";
import { bindListenerLifecycle } from "../foundry/listener-lifecycle.js";
import { connectionBudget } from "../foundry/paths.js";

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path, agent: false }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", part => { body += part; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

for (const surface of ["ordinary", "foundry"]) {
  test(surface + " active HTTP response survives early drain before cleanup", { timeout: 5000 }, async t => {
    let began;
    const started = new Promise(resolve => { began = resolve; });
    let released = false;
    const handler = async (_req, res) => {
      began();
      await delay(750);
      assert.equal(released, false);
      res.json({ useful: true });
    };
    let app;
    let close = async () => {};
    let url;
    if (surface === "ordinary") {
      app = express();
      url = "/ordinary-job";
      app.get(url, handler);
    } else {
      const store = new MemoryStore();
      app = createSdsApp({ correspondence: {
        env: { NODE_ENV: "test", FOUNDRY_HOST_OPT_IN: "1",
          CORRESPONDENCE_DATABASE_URL: "postgres://127.0.0.1:9/fixture",
          CORRESPONDENCE_ADMIN_TOKEN: "test-admin-token-at-least-24-characters",
          CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence", CORRESPONDENCE_POOL_MAX: "2",
          CORRESPONDENCE_STORE: "memory", CORRESPONDENCE_TRUST_PROXY: "0",
          CORRESPONDENCE_CORS_ORIGINS: "https://neomorphic.io" },
        loadService: async () => ({ loadConfig, createPostgresStore: async () => store }),
        hostProfile: { id: "host:drain-test", maxAdmissions: 1, maxPhysical: 1, pool: { validityMs: 1000 } },
        participationKey: "test-participation-key-at-least-32-characters",
        createEntryReuseMount: async () => {
          const facade = express();
          facade.get("/slow-job", handler);
          return { app: facade, checkReady: async () => {}, close: async () => {} };
        },
      }});
      const mounted = app.get("s51Correspondence");
      await mounted.ready();
      assert.equal(mounted.state.foundry.facade, true);
      close = () => mounted.close();
      url = "/api/correspondence/slow-job";
    }
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => { server.closeAllConnections(); server.close(); });
    const codes = [];
    let closed = 0;
    const shutdown = bindListenerLifecycle(server, async () => {
      released = true; closed++; await close();
    }, { bindSignals: false, forceMs: 2000, exit: code => codes.push(code) });
    const response = request(server.address().port, url);
    // Attach rejection before the old implementation resets the socket.
    const checked = response.then(value => ({ value }), error => ({ error }));
    await started;
    const completion = shutdown();
    const repeated = shutdown();
    const outcome = await checked;
    await completion;
    assert.ifError(outcome.error);
assert.equal(repeated, completion);
    assert.equal(outcome.value.status, 200);
    assert.deepEqual(JSON.parse(outcome.value.body), { useful: true });
    assert.equal(closed, 1);
    assert.deepEqual(codes, [0]);
  });
}

test("force deadline truncates stuck request and reports failure exactly once", { timeout: 3000 }, async t => {
  let begin;
  const started = new Promise(resolve => { begin = resolve; });
  const server = http.createServer(() => begin());
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const codes = [];
  let cleaned = 0;
  const shutdown = bindListenerLifecycle(server, async () => { cleaned++; }, {
    bindSignals: false, drainMs: 10, forceMs: 150, exit: code => codes.push(code),
  });
  const outcome = request(server.address().port, "/stuck").then(() => null, error => error);
  await started;
  const completion = shutdown();
  assert.equal((await outcome).code, "ECONNRESET");
  await completion;
  await shutdown();
  assert.deepEqual(codes, [1]);
  assert.equal(cleaned, 0);
});

test("resource close failure cannot report graceful success", async () => {
  const server = http.createServer();
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const codes = [];
  await bindListenerLifecycle(server, async () => { throw new Error("close failed"); }, {
    bindSignals: false, exit: code => codes.push(code),
  })();
  assert.deepEqual(codes, [1]);
});

test("resource cleanup remains bounded and late completion cannot exit zero", async () => {
  const server = http.createServer();
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let finishCleanup;
  const pending = new Promise(resolve => { finishCleanup = resolve; });
  let finishExit;
  const exited = new Promise(resolve => { finishExit = resolve; });
  const codes = [];
  const completion = bindListenerLifecycle(server, () => pending, {
    bindSignals: false, forceMs: 50, exit: code => { codes.push(code); finishExit(); },
  })();
  await exited;
  finishCleanup();
  await completion;
  assert.deepEqual(codes, [1]);
});

test("documented connection envelopes match executable budget", () => {
  assert.equal(connectionBudget({ basePoolMax: 2, workers: 1 }), 10);
  assert.equal(connectionBudget({ httpProcesses: 2, basePoolMax: 4 }), 20);
  assert.equal(connectionBudget({ httpProcesses: 2, basePoolMax: 4, workers: 1 }), 22);
  assert.equal(connectionBudget(), 10);
});
