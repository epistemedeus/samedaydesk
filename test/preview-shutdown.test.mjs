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
  const measureFile = path.join(os.tmpdir(), `sdd-home-measure-shutdown-${port}-${process.pid}.json`);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      PULSE_FILE: pulseFile,
      HOMEPAGE_MEASURE_FILE: measureFile,
      HOMEPAGE_MEASURE_TOKEN: "",
      OPENAI_API_KEY: "",
      TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
      ADMIN_METRICS_TOKEN: "",
    },
    stdio: "ignore",
  });
  child.pulseFile = pulseFile;
  child.measureFile = measureFile;
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
    assert.equal(fs.existsSync(child.measureFile), true, "homepage measure should persist on shutdown");
    const measure = JSON.parse(fs.readFileSync(child.measureFile, "utf8"));
    assert.deepEqual(Object.keys(measure).sort(), ["days", "v"]);
    const day = Object.keys(measure.days)[0];
    assert.ok(day, "homepage measure should have a UTC day");
    assert.ok(measure.days[day].crawler_fetch >= 1, "crawler GET / should land in crawler_fetch");
    assert.equal(JSON.stringify(measure).includes("OAI-SearchBot"), false);
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
    try {
      fs.unlinkSync(child.measureFile);
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

test("a taken port exits nonzero and does not linger", { timeout: 10000 }, async () => {
  const port = await freePort();
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(port, "0.0.0.0", resolve);
  });
  const pulseFile = path.join(os.tmpdir(), `sdd-pulse-eaddr-${port}-${process.pid}.json`);
  const measureFile = path.join(os.tmpdir(), `sdd-home-measure-eaddr-${port}-${process.pid}.json`);
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      PULSE_FILE: pulseFile,
      HOMEPAGE_MEASURE_FILE: measureFile,
      HOMEPAGE_MEASURE_TOKEN: "",
      OPENAI_API_KEY: "",
      TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
      ADMIN_METRICS_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pid = child.pid;
  let out = "";
  let err = "";
  child.stdout.on("data", (b) => {
    out += b.toString();
  });
  child.stderr.on("data", (b) => {
    err += b.toString();
  });
  try {
    assert.ok(pid, "spawned preview has no pid");
    const exited = await waitExit(child, EXIT_MS);
    assert.equal(exited.signal, null, "listen failure should be a handled exit, not a signal");
    assert.equal(exited.code, 1, "listen failure must not look like a clean start");
    assertPidGone(pid);
    assert.match(`${out}\n${err}`, /listen failed/);
    assert.doesNotMatch(out, /listening on/);
  } catch (e) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    throw e;
  } finally {
    try {
      fs.unlinkSync(pulseFile);
    } catch {
      /* absent */
    }
    try {
      fs.unlinkSync(measureFile);
    } catch {
      /* absent */
    }
    await new Promise((resolve) => blocker.close(() => resolve()));
  }
});
