import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXIT_MS = 4000;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function waitExit(child, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`preview pid ${child.pid} did not exit within ${ms}ms`)), ms);
    child.once("exit", (code, signal) => {
      clearTimeout(t);
      resolve({ code, signal });
    });
  });
}

async function waitHealth(port, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`preview on ${port} did not become healthy`);
}

function assertPidGone(pid) {
  assert.throws(() => process.kill(pid, 0), /ESRCH/, `pid ${pid} still exists`);
}

function assertPortReusable(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (err) => reject(new Error(`port ${port} not reusable: ${err.code || err.message}`)));
    s.listen(port, "127.0.0.1", () => s.close((err) => (err ? reject(err) : resolve())));
  });
}

function startPreview(port) {
  const pulseFile = path.join(os.tmpdir(), `sdd-pulse-shutdown-${port}-${process.pid}.json`);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      PULSE_FILE: pulseFile,
      OPENAI_API_KEY: "",
      TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
      ADMIN_METRICS_TOKEN: "",
    },
    stdio: "ignore",
  });
  child.pulseFile = pulseFile;
  return child;
}

async function signalStopsPreview(signal) {
  const port = await freePort();
  const child = startPreview(port);
  const pid = child.pid;
  assert.ok(pid, "spawned preview has no pid");
  try {
    await waitHealth(port, 5000);
    const home = await fetch(`http://127.0.0.1:${port}/`, { headers: { "User-Agent": "OAI-SearchBot/1.4" } });
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<h1>A desk for agent-era commerce\.<\/h1>/);

    child.kill(signal);
    const exited = await waitExit(child, EXIT_MS);
    assert.equal(exited.signal, null, `${signal} should be handled, not left as a default dump`);
    assert.equal(exited.code, 0, `${signal} should exit 0 after a clean close`);
    assertPidGone(pid);
    await assertPortReusable(port);
    assert.equal(fs.existsSync(child.pulseFile), true, "pulse snapshot should persist on shutdown");
  } catch (err) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    throw err;
  } finally {
    try {
      fs.unlinkSync(child.pulseFile);
    } catch {
      /* absent */
    }
  }
}

test("SIGTERM exits the exact preview process and frees its port", { timeout: 10000 }, async () => {
  await signalStopsPreview("SIGTERM");
});

test("SIGINT exits the exact preview process and frees its port", { timeout: 10000 }, async () => {
  await signalStopsPreview("SIGINT");
});
