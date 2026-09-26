import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { prepareFoundryHost } from "@neomorphic/correspondence";
import { runPhasedWorker } from "../foundry/lifecycle.js";

test("readiness failure closes extension and base once, retaining original error", async () => {
  const seen = [];
  const original = new Error("not ready");
  const base = { close: async () => { seen.push("base"); } };
  await assert.rejects(prepareFoundryHost(base, { enabled: true, create: async () => ({
    checkReady: async () => { throw original; },
    close: async () => { seen.push("extension"); throw new Error("close failed"); },
  }) }), (error) => error === original);
  await assert.rejects(base.close(), /close failed/);
  assert.deepEqual(seen, ["extension", "base"]);
});

test("normal close drains base even when extension close fails, without duplicate close", async () => {
  const seen = [];
  const base = { close: async () => { seen.push("base"); } };
  await prepareFoundryHost(base, { enabled: true, create: async () => ({
    checkReady: async () => {},
    close: async () => { seen.push("extension"); throw new Error("close failed"); },
  }) });
  const results = await Promise.allSettled([base.close(), base.close()]);
  assert.ok(results.every((r) => r.status === "rejected"));
  assert.deepEqual(seen, ["extension", "base"]);
});

test("shutdown does not suppress current-pass failure", async () => {
  let stop;
  let closed = 0;
  const original = new Error("durable write failed");
  await assert.rejects(runPhasedWorker({
    mode: "dispatch", projectId: "p1",
    notify: (handler) => { stop = handler; return () => {}; },
    runPhase: async () => { stop(); throw original; },
    close: async () => { closed++; },
  }), (error) => error === original);
  assert.equal(closed, 1);
});

test("healthy bounded pass survives the former eight-second wrapper deadline", { timeout: 20_000 }, async (t) => {
  const worker = fileURLToPath(new URL("../foundry/worker.mjs", import.meta.url));
  const fixture = fileURLToPath(new URL("./fixtures/foundry-worker-pass.mjs", import.meta.url));
  const child = spawn(process.execPath, [worker, "recover", "p1"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME,
      FOUNDRY_HOST_OPT_IN: "1", CORRESPONDENCE_DATABASE_URL: "postgres://127.0.0.1:9/none",
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
      FOUNDRY_WORKER_PASS: fixture, FOUNDRY_WORKER_HOLD: "recover" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); });
  let stdout = "";
  child.stdout.on("data", (data) => { stdout += data; });
  const [code, signal] = await once(child, "close");
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.match(stdout, /recover-done/);
});
