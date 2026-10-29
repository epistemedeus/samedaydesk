import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import qs from "qs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const listener = fileURLToPath(new URL("./fixtures/runtime-maintenance-listener.mjs", import.meta.url));
const requireFromRoot = createRequire(path.join(root, "package.json"));

// One complete gzip frame of {"a":1}, then one trailing byte and padding.
// A naive gzipSync() plus a single extra byte is a caught decode error, not this crash.
const GZIP_FRAME = Buffer.from("1f8b0800000000000003ab564a54b232ac0500afac1b5607000000", "hex");
const GZIP_TRAILING = Buffer.concat([
  GZIP_FRAME,
  Buffer.from([0x00]),
  Buffer.alloc(100 * 1024, 0x58),
]);

function childEnv() {
  return {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    TMPDIR: process.env.TMPDIR || "/tmp",
    NODE_ENV: "test",
  };
}

function request({ port, method = "GET", path: requestPath = "/", headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      method,
      path: requestPath,
      headers,
      agent: false,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        const text = raw.toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { json = null; }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.setTimeout(8000, () => req.destroy(new Error(`${method} ${requestPath} timed out`)));
    req.on("error", reject);
    if (body) req.end(body);
    else req.end();
  });
}

function startListener(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [listener, mode], {
      cwd: root,
      env: childEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`listener ${mode} did not bind\n${stderr}`));
    }, 20000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/LISTEN (\d+)/);
      if (!match || settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        child,
        port: Number(match[1]),
        stderr: () => stderr,
      });
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`listener ${mode} exited ${code} ${signal || ""}\n${stderr}`));
    });
  });
}

async function stillAlive(handle, label) {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const { child } = handle;
  assert.equal(child.exitCode, null, `${label} exited ${child.exitCode}\n${handle.stderr()}`);
  assert.equal(child.signalCode, null, `${label} signal ${child.signalCode}`);
}

async function stopListener(handle) {
  const { child } = handle;
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

test("production resolution keeps the patched parser and the original direct pins", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const deps = manifest.dependencies;
  assert.equal(deps["body-parser"], "2.4.0");
  assert.equal(deps.qs, "6.16.1");
  assert.equal(deps.express, "^5.2.1");
  assert.equal(deps["proxy-addr"], "2.0.8");
  assert.equal(deps["ipaddr.js"], "1.9.1");
  assert.equal(deps.zod, "^3.25.76");
  assert.equal(deps.stripe, "^22.2.2");
  assert.equal(deps.pg, "^8.23.0");
  assert.equal(deps.resend, "^6.14.0");
  assert.equal(deps.jose, "^6.2.3");
  assert.equal(Object.hasOwn(deps, "axios"), false);
  assert.equal(manifest.overrides, undefined);

  const packages = lock.packages;
  assert.equal(packages["node_modules/body-parser"].version, "2.4.0");
  assert.equal(packages["node_modules/qs"].version, "6.16.1");
  assert.equal(packages["node_modules/iconv-lite"].version, "0.7.3");
  assert.equal(packages["node_modules/body-parser/node_modules/content-type"].version, "2.1.0");
  assert.equal(packages["node_modules/express"].version, "5.2.1");
  assert.equal(packages["node_modules/proxy-addr"].version, "2.0.8");
  assert.equal(packages["node_modules/ipaddr.js"].version, "1.9.1");
  assert.equal(packages["node_modules/zod"].version, "3.25.76");
  assert.equal(packages["node_modules/fast-uri"].version, "3.1.8");
  assert.equal(Object.keys(packages).includes("node_modules/axios"), false);

  assert.equal(requireFromRoot("./node_modules/body-parser/package.json").version, "2.4.0");
  assert.equal(requireFromRoot("./node_modules/qs/package.json").version, "6.16.1");
  assert.equal(requireFromRoot("./node_modules/express/package.json").version, "5.2.1");
  assert.equal(requireFromRoot("./node_modules/proxy-addr/package.json").version, "2.0.8");
  assert.equal(requireFromRoot("./node_modules/ipaddr.js/package.json").version, "1.9.1");
  assert.equal(requireFromRoot("./node_modules/zod/package.json").version, "3.25.76");
  const fromExpress = createRequire(path.join(root, "node_modules/express/package.json"));
  assert.equal(fromExpress(fromExpress.resolve("body-parser/package.json")).version, "2.4.0");
  assert.throws(() => fromExpress.resolve("axios"), /Cannot find module/);
});

test("qs parse stays available and comma stringify survives a non-callable toString", () => {
  assert.deepEqual(qs.parse("a=1&b=2"), { a: "1", b: "2" });
  const values = ["ok"];
  Object.defineProperty(values, "toString", { value: "not-callable" });
  assert.equal(qs.stringify({ a: values }, { arrayFormat: "comma" }), "a=ok");
});

test("configured JSON inflation accepts a trailing gzip frame and stays up", async () => {
  const handle = await startListener("parser");
  try {
    const positive = await request({
      port: handle.port,
      method: "POST",
      path: "/echo",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ finding_id: "local" }),
    });
    assert.equal(positive.status, 200);
    assert.deepEqual(positive.json, { ok: true, body: { finding_id: "local" } });

    const malformed = await request({
      port: handle.port,
      method: "POST",
      path: "/echo",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    await stillAlive(handle, "malformed json");

    const compressed = await request({
      port: handle.port,
      method: "POST",
      path: "/echo",
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(GZIP_TRAILING.length),
      },
      body: GZIP_TRAILING,
    });
    assert.equal(compressed.status, 200);
    assert.deepEqual(compressed.json, { ok: true, body: { a: 1 } });
    await stillAlive(handle, "trailing gzip");

    const recovery = await request({ port: handle.port, path: "/health" });
    assert.equal(recovery.status, 200);
    assert.deepEqual(recovery.json, { ok: true });
  } finally {
    await stopListener(handle);
  }
});

test("customer and agent journey survives the same compressed body", async () => {
  const handle = await startListener("journey");
  try {
    const health = await request({ port: handle.port, path: "/api/health" });
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);
    assert.equal(health.json.service, "samedaydesk");
    assert.equal(health.json.configured.stripe, false);

    const descriptor = await request({
      port: handle.port,
      path: "/discovery/original-task-correspondence.json",
    });
    assert.equal(descriptor.status, 200);
    assert.equal(descriptor.json.schema, "samedaydesk.original-task-correspondence.v1");
    assert.equal(descriptor.json.payment, false);
    assert.equal(descriptor.json.fundedJob, false);
    assert.equal(descriptor.json.contributionRequired, false);

    const card = await request({ port: handle.port, path: "/.well-known/agent-card.json" });
    assert.equal(card.status, 200);
    assert.equal(card.json.protocolVersion, "0.3.0");
    assert.equal(card.json.name, "SameDayDesk");
    assert.equal(card.json.interfaces.some((item) => item.url.endsWith("/discovery/original-task-correspondence.json")), true);

    const checkout = await request({
      port: handle.port,
      method: "POST",
      path: "/api/checkout/seller-repair-session",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ finding_id: "local" }),
    });
    assert.equal(checkout.status, 503);
    assert.deepEqual(checkout.json, { error: "Payments not configured" });

    const malformed = await request({
      port: handle.port,
      method: "POST",
      path: "/api/checkout/seller-repair-session",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    await stillAlive(handle, "journey malformed json");

    const compressed = await request({
      port: handle.port,
      method: "POST",
      path: "/api/checkout/seller-repair-session",
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(GZIP_TRAILING.length),
      },
      body: GZIP_TRAILING,
    });
    assert.equal(compressed.status, 503);
    assert.deepEqual(compressed.json, { error: "Payments not configured" });
    await stillAlive(handle, "journey trailing gzip");

    const recovery = await request({ port: handle.port, path: "/api/health" });
    assert.equal(recovery.status, 200);
    assert.equal(recovery.json.service, "samedaydesk");
  } finally {
    await stopListener(handle);
  }
});
