import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { connect } from "node:net";
import test from "node:test";
import { Pool } from "pg";
import { drainRuntime } from "../src/shutdown.js";

test("shutdown distinguishes a real held Postgres client from normal drain", async () => {
  assert.ok(process.env.EARNED_WORK_DATABASE_URL, "disposable Postgres required");
  for (const held of [false, true]) {
    const pool = new Pool({ connectionString: process.env.EARNED_WORK_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    let ending: Promise<void> | undefined;
    if (!held) client.release();
    try {
      const started = Date.now();
      const result = await drainRuntime(server, { close: () => (ending = pool.end()) }, 100);
      assert.equal(result.forced, held);
      assert.equal(result.failed, false);
      assert.ok(Date.now() - started < 1000, "full drain is bounded");
    } finally {
      if (held) client.release();
      if (ending) await ending;
      else await pool.end();
      server.close();
    }
  }
});

test("shutdown close rejection is failed, not graceful", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const result = await drainRuntime(server, { close: async () => { throw new Error("close failed"); } }, 100);
  assert.deepEqual(result, { forced: false, failed: true });
});

test("compiled service: held HTTP body reaches the global deadline and exits nonzero", async (t) => {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const child = spawn(process.execPath, ["dist/index.js"], { cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), EARNED_WORK_LISTEN_HOST: "127.0.0.1", EARNED_WORK_SHUTDOWN_TIMEOUT_MS: "1000",
      EARNED_WORK_PG_SCHEMA: `shutdown_${randomBytes(6).toString("hex")}` }, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr += chunk; });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exit;
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let i = 0; i < 50; i += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(250) });
      const body = await response.json() as { ok?: boolean };
      if (response.status === 200 && body.ok) { healthy = true; break; }
    } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(healthy, true, stderr);
  const socket = connect({ host: "127.0.0.1", port });
  t.after(() => socket.destroy());
  socket.on("error", () => undefined);
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  socket.write('POST /v1/tasks HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 10000\r\n\r\n{"');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const started = Date.now();
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 4000);
  try {
    const outcome = await exit;
    assert.deepEqual(outcome, { code: 1, signal: null }, stderr);
    assert.ok(Date.now() - started >= 900, "held request must exercise the deadline");
    assert.ok(Date.now() - started < 3000, "forced shutdown remains bounded");
  } finally {
    clearTimeout(timer);
  }
});
