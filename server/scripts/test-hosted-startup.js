import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { get } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { probeFamily4Surface, startupGate } from "../lib/hosted-family4.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const preload = fileURLToPath(new URL("./fixtures/hosted-startup-preload.mjs", import.meta.url));
const surfacePromise = probeFamily4Surface();

// Family-4 node:http to the owned listener. Same bounds as the SDS256 probe.
function localJson(url) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = get({
      host: target.hostname,
      port: target.port,
      path: target.pathname,
      family: 4,
      agent: false,
    }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => {
        body += chunk;
        if (body.length > 16384) request.destroy(new Error("Startup response exceeds 16KiB"));
      });
      response.on("error", reject);
      response.on("end", () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error("Startup HTTP probe timed out")));
    request.on("error", reject);
  });
}

async function childMessage(t, args) {
  const child = spawn(process.execPath, ["--import", preload, ...args], {
    cwd: root, env: { PATH: process.env.PATH, NODE_ENV: "test", PORT: "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", b => { output = (output + b).slice(-2000); });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error("No startup receipt: " + output)), 5000);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    }
    child.once("message", message => finish(null, { child, message }));
    child.once("error", error => finish(error));
    child.once("exit", code => finish(new Error("Exited before startup receipt: " + code + " " + output)));
  });
}

for (const [name, args] of [
  ["direct Node entry", ["server/index.js"]],
  ["managed-host ESM loader", ["--input-type=module", "--eval", 'await import("./server/index.js")']],
  ["managed-host CommonJS loader", ["--eval", 'require("./server/index.js")']],
]) {
  test(name + " actually listens and serves health", async t => {
    const surface = await surfacePromise;
    const gate = startupGate(surface);
    if (!gate.runHealth) {
      assert.equal(gate.cause, "surface-incapable");
      assert.equal(gate.ipv6DualStackExplains, false);
      assert.equal(surface.capable, false);
      assert.equal(surface.stage, "connect");
      assert.equal(surface.host, "127.0.0.1");
      assert.equal(surface.family, 4);
      assert.equal(surface.address.family, "IPv4");
      assert.ok(surface.code);
      return;
    }
    const { message } = await childMessage(t, args);
    assert.ok(Number.isInteger(message.port) && message.port > 0);
    const origin = "http://127.0.0.1:" + message.port;
    const health = await localJson(origin + "/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.service, "samedaydesk");
    const disabled = await localJson(origin + "/api/correspondence/healthz");
    assert.equal(disabled.status, 200);
    assert.deepEqual(disabled.body, { ok: false, enabled: false, reason: "unconfigured" });
  });
}

test("factory import remains unbound", async t => {
  const { child, message } = await childMessage(t, [
    "--input-type=module", "--eval",
    'const m = await import("./server/app.js"); process.send({ factory: typeof m.createSdsApp }); process.disconnect();',
  ]);
  assert.deepEqual(message, { factory: "function" });
  if (child.exitCode === null) {
    const [code] = await once(child, "exit");
    assert.equal(code, 0);
  } else assert.equal(child.exitCode, 0);
});
